import 'server-only'
import type { CommentVisibility } from '@/generated/prisma/enums'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope, capabilitiesFor } from '@/lib/authz/context'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import { fieldPermissionsFor, toCommentDto, visibleCommentFilter, type CommentDto } from '@/lib/domain/dto'
import { actorOf, scoped } from './base'

const MAX_BODY = 5000

export type CommentScope = { campaignId?: string | null; candidacyId?: string | null }

async function resolveScopeClient(ctx: AuthContext, scopeInput: CommentScope): Promise<{ clientId: string; campaignId: string | null; candidacyId: string | null }> {
  if (scopeInput.candidacyId) {
    const candidacy = await scoped(ctx, (tx) =>
      tx.candidacy.findUnique({
        where: { id: scopeInput.candidacyId as string },
        select: { clientId: true, campaignId: true, clientVisible: true },
      }),
    )
    if (!candidacy) throw new NotFoundError()
    if (ctx.side === 'CLIENT' && !candidacy.clientVisible) throw new NotFoundError()
    assertClientInScope(ctx, candidacy.clientId)
    return { clientId: candidacy.clientId, campaignId: candidacy.campaignId, candidacyId: scopeInput.candidacyId }
  }
  if (scopeInput.campaignId) {
    const campaign = await scoped(ctx, (tx) =>
      tx.campaign.findUnique({ where: { id: scopeInput.campaignId as string }, select: { clientId: true } }),
    )
    if (!campaign) throw new NotFoundError()
    assertClientInScope(ctx, campaign.clientId)
    return { clientId: campaign.clientId, campaignId: scopeInput.campaignId, candidacyId: null }
  }
  throw new ValidationError('Falta indicar la campaña o la candidatura.')
}

export async function listComments(ctx: AuthContext, scopeInput: CommentScope): Promise<CommentDto[]> {
  const target = await resolveScopeClient(ctx, scopeInput)
  assertCan(ctx, 'candidate.view', target.clientId)

  const perms = fieldPermissionsFor(ctx, target.clientId)
  const allowed = visibleCommentFilter(perms, ctx.side)

  const rows = await scoped(ctx, (tx) =>
    tx.comment.findMany({
      where: {
        clientId: target.clientId,
        deletedAt: null,
        // El filtro de visibilidad va en la consulta, no en el render.
        visibility: { in: allowed as CommentVisibility[] },
        ...(target.candidacyId ? { candidacyId: target.candidacyId } : { campaignId: target.campaignId, candidacyId: null }),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { author: { select: { name: true } } },
    }),
  )
  return rows.map(toCommentDto)
}

export async function createComment(
  ctx: AuthContext,
  scopeInput: CommentScope,
  body: string,
  visibility: CommentVisibility,
): Promise<{ id: string }> {
  const target = await resolveScopeClient(ctx, scopeInput)
  const caps = capabilitiesFor(ctx, target.clientId)
  const clean = body.trim()

  if (!clean) throw new ValidationError('El comentario no puede estar vacío.')
  if (clean.length > MAX_BODY) throw new ValidationError(`El comentario no puede superar los ${MAX_BODY} caracteres.`)

  const authorSide = ctx.side
  // Un usuario de cliente sólo puede escribir feedback propio: nunca notas internas.
  if (authorSide === 'CLIENT') {
    if (visibility !== 'CLIENT_AUTHORED') throw new ForbiddenError('Sólo podés dejar feedback visible para la agencia.')
    if (!caps.has('feedback.create')) throw new ForbiddenError('Tu rol es de sólo lectura.')
  } else {
    if (visibility === 'CLIENT_AUTHORED') throw new ValidationError('Ese tipo de comentario lo escribe el cliente.')
    if (visibility === 'INTERNAL' && !caps.has('feedback.internal.create')) throw new ForbiddenError()
    if (visibility === 'BUDGET_PRIVATE' && !caps.has('budget.view')) throw new ForbiddenError()
    if (visibility === 'CLIENT_VISIBLE' && !caps.has('feedback.create')) throw new ForbiddenError()
  }

  return scoped(ctx, async (tx) => {
    const created = await tx.comment.create({
      data: {
        clientId: target.clientId,
        campaignId: target.campaignId,
        candidacyId: target.candidacyId,
        authorUserId: ctx.user.id,
        authorSide,
        visibility,
        body: clean,
      },
    })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.COMMENT_CREATED,
      entityType: 'Comment',
      entityId: created.id,
      clientId: target.clientId,
      metadata: { visibility, candidacyId: target.candidacyId },
    })
    return { id: created.id }
  })
}
