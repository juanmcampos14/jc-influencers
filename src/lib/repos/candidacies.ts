import 'server-only'
import type { Availability, ClientApproval, ContactStatus, NegotiationStatus } from '@/generated/prisma/enums'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope, capabilitiesFor } from '@/lib/authz/context'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import { fieldPermissionsFor, toCandidacyDto, type CandidacyDto } from '@/lib/domain/dto'
import { DEFAULT_STATUS_KEY } from '@/lib/domain/statuses'
import { actorOf, assertUpdated, normalizePagination, paginate, scoped, skipTake, type Paginated, type Tx } from './base'

const INFLUENCER_INCLUDE = {
  influencer: {
    include: {
      profiles: { orderBy: [{ isPrimary: 'desc' as const }, { followers: 'desc' as const }] },
      niches: { include: { niche: true } },
      tags: { include: { tag: true } },
    },
  },
  cluster: { select: { label: true } },
}

export type CandidacyFilters = {
  statusKeys?: string[] | null
  clusterIds?: string[] | null
  clientApproval?: ClientApproval[] | null
  onlyShortlist?: boolean
  search?: string | null
  minFollowers?: number | null
  maxFollowers?: number | null
}

/**
 * Filtro base según el lado. Para el cliente sólo existen las candidaturas que
 * la agencia marcó como visibles: no es una decisión de la interfaz, es del `where`.
 */
function baseWhere(ctx: AuthContext, campaignId: string, clientId: string) {
  return {
    campaignId,
    clientId,
    ...(ctx.side === 'CLIENT' ? { clientVisible: true } : {}),
  }
}

async function resolveCampaignClient(ctx: AuthContext, campaignId: string): Promise<string> {
  const campaign = await scoped(ctx, (tx) =>
    tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true } }),
  )
  if (!campaign) throw new NotFoundError()
  assertClientInScope(ctx, campaign.clientId)
  return campaign.clientId
}

export async function listCandidacies(
  ctx: AuthContext,
  campaignId: string,
  filters: CandidacyFilters = {},
  pageInput?: { page?: number; pageSize?: number },
): Promise<Paginated<CandidacyDto>> {
  const clientId = await resolveCampaignClient(ctx, campaignId)
  assertCan(ctx, 'candidate.view', clientId)

  const pagination = normalizePagination(pageInput)
  const where = {
    ...baseWhere(ctx, campaignId, clientId),
    ...(filters.statusKeys?.length ? { statusKey: { in: filters.statusKeys } } : {}),
    ...(filters.clusterIds?.length ? { clusterId: { in: filters.clusterIds } } : {}),
    ...(filters.clientApproval?.length ? { clientApproval: { in: filters.clientApproval } } : {}),
    ...(filters.onlyShortlist ? { inShortlist: true } : {}),
    ...(filters.search
      ? {
          influencer: {
            OR: [
              { displayName: { contains: filters.search, mode: 'insensitive' as const } },
              { primaryHandle: { contains: filters.search, mode: 'insensitive' as const } },
            ],
          },
        }
      : {}),
    ...(filters.minFollowers != null || filters.maxFollowers != null
      ? {
          influencer: {
            profiles: {
              some: {
                followers: {
                  ...(filters.minFollowers != null ? { gte: filters.minFollowers } : {}),
                  ...(filters.maxFollowers != null ? { lte: filters.maxFollowers } : {}),
                },
              },
            },
          },
        }
      : {}),
  }

  const perms = fieldPermissionsFor(ctx, clientId)
  return scoped(ctx, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.candidacy.findMany({
        where,
        orderBy: [{ inShortlist: 'desc' }, { shortlistOrder: 'asc' }, { rank: 'asc' }, { createdAt: 'asc' }],
        ...skipTake(pagination),
        include: INFLUENCER_INCLUDE,
      }),
      tx.candidacy.count({ where }),
    ])
    return paginate(rows.map((row) => toCandidacyDto(row, perms)), total, pagination)
  })
}

export async function getCandidacy(ctx: AuthContext, candidacyId: string): Promise<CandidacyDto> {
  const row = await scoped(ctx, (tx) =>
    tx.candidacy.findUnique({ where: { id: candidacyId }, include: INFLUENCER_INCLUDE }),
  )
  if (!row) throw new NotFoundError()
  assertClientInScope(ctx, row.clientId)
  assertCan(ctx, 'candidate.view', row.clientId)
  // Para el cliente, una candidatura no visible sencillamente no existe.
  if (ctx.side === 'CLIENT' && !row.clientVisible) throw new NotFoundError()
  return toCandidacyDto(row, fieldPermissionsFor(ctx, row.clientId))
}

/** Resumen por estado, para el funnel y el panel. */
export async function candidacySummary(
  ctx: AuthContext,
  campaignId: string,
): Promise<{ byStatus: Record<string, number>; byApproval: Record<string, number>; total: number; shortlist: number }> {
  const clientId = await resolveCampaignClient(ctx, campaignId)
  assertCan(ctx, 'candidate.view', clientId)
  const where = baseWhere(ctx, campaignId, clientId)

  return scoped(ctx, async (tx) => {
    const [byStatusRows, byApprovalRows, total, shortlist] = await Promise.all([
      tx.candidacy.groupBy({ by: ['statusKey'], where, _count: { _all: true } }),
      tx.candidacy.groupBy({ by: ['clientApproval'], where, _count: { _all: true } }),
      tx.candidacy.count({ where }),
      tx.candidacy.count({ where: { ...where, inShortlist: true } }),
    ])
    const byStatus: Record<string, number> = {}
    for (const row of byStatusRows) byStatus[row.statusKey] = row._count._all
    const byApproval: Record<string, number> = {}
    for (const row of byApprovalRows) byApproval[row.clientApproval] = row._count._all
    return { byStatus, byApproval, total, shortlist }
  })
}

export type CandidacyWriteInput = {
  clusterId?: string | null
  rank?: number | null
  fitScore?: number | null
  agencyRationale?: string | null
  contentIdea?: string | null
  deliverablesSummary?: string | null
  storiesCount?: number
  reelsCount?: number
  postsCount?: number
  tiktoksCount?: number
  videosCount?: number
  availability?: Availability
  contactStatus?: ContactStatus
  negotiationStatus?: NegotiationStatus
  ownerUserId?: string | null
  rejectionReason?: string | null
  internalNotes?: string | null
  currency?: string
  budgetRequested?: number | null
  budgetNegotiated?: number | null
  cacheAmount?: number | null
  barterDescription?: string | null
  budgetPrivateNotes?: string | null
}

export async function createCandidacy(
  ctx: AuthContext,
  campaignId: string,
  influencerId: string,
  input: CandidacyWriteInput = {},
): Promise<{ id: string }> {
  const clientId = await resolveCampaignClient(ctx, campaignId)
  assertCan(ctx, 'candidate.manage', clientId)

  return scoped(ctx, async (tx) => {
    const influencer = await tx.influencer.findUnique({ where: { id: influencerId }, select: { id: true } })
    if (!influencer) throw new NotFoundError()

    const existing = await tx.candidacy.findUnique({
      where: { campaignId_influencerId: { campaignId, influencerId } },
    })
    if (existing) throw new ValidationError('Ese influencer ya está en la campaña.')

    await assertClusterBelongsToCampaign(tx, campaignId, clientId, input.clusterId ?? null)

    const created = await tx.candidacy.create({
      data: {
        clientId,
        campaignId,
        influencerId,
        statusKey: DEFAULT_STATUS_KEY,
        clusterId: input.clusterId ?? null,
        rank: input.rank ?? null,
        fitScore: input.fitScore ?? null,
        agencyRationale: input.agencyRationale ?? null,
        contentIdea: input.contentIdea ?? null,
        currency: input.currency ?? 'USD',
        createdById: ctx.user.id,
      },
    })
    await tx.candidacyStatusEvent.create({
      data: {
        candidacyId: created.id,
        clientId,
        fromStatusKey: null,
        toStatusKey: DEFAULT_STATUS_KEY,
        comment: 'Alta de la candidatura',
        actorUserId: ctx.user.id,
        actorEmail: ctx.user.email,
        actorRole: ctx.agencyRole,
      },
    })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.CANDIDACY_CREATED,
      entityType: 'Candidacy',
      entityId: created.id,
      clientId,
      after: { influencerId, campaignId },
    })
    return { id: created.id }
  })
}

async function assertClusterBelongsToCampaign(
  tx: Tx,
  campaignId: string,
  clientId: string,
  clusterId: string | null,
): Promise<void> {
  if (!clusterId) return
  const cluster = await tx.briefCluster.findFirst({
    where: { id: clusterId, clientId, brief: { campaignId } },
    select: { id: true },
  })
  // Un clusterId de otra campaña (o de otro tenant) se rechaza como inexistente.
  if (!cluster) throw new ValidationError('El cluster indicado no pertenece a esta campaña.')
}

export async function updateCandidacy(
  ctx: AuthContext,
  candidacyId: string,
  input: CandidacyWriteInput & { version: number },
): Promise<void> {
  const current = await scoped(ctx, (tx) => tx.candidacy.findUnique({ where: { id: candidacyId } }))
  if (!current) throw new NotFoundError()
  assertClientInScope(ctx, current.clientId)

  const caps = capabilitiesFor(ctx, current.clientId)
  const canManage = caps.has('candidate.manage')
  const canBudget = caps.has('budget.manage')
  const canInternal = caps.has('internal_notes.view')
  // Finanzas puede negociar cachés sin poder mover el resto de la candidatura.
  if (!canManage && !canBudget) throw new ForbiddenError()

  await scoped(ctx, async (tx) => {
    if (canManage && input.clusterId !== undefined) {
      await assertClusterBelongsToCampaign(tx, current.campaignId, current.clientId, input.clusterId ?? null)
    }
    if (canManage && input.ownerUserId) {
      // El responsable debe ser alguien con acceso real a este cliente.
      const allowed = await tx.agencyClientAssignment.findFirst({
        where: { userId: input.ownerUserId, clientId: current.clientId },
        select: { id: true },
      })
      const isAgencyAdmin = await tx.agencyMembership.findFirst({
        where: { userId: input.ownerUserId, role: { in: ['AGENCY_ADMIN', 'PLATFORM_SUPERADMIN'] } },
        select: { id: true },
      })
      if (!allowed && !isAgencyAdmin) {
        throw new ValidationError('El responsable elegido no tiene acceso a este cliente.')
      }
    }

    const result = await tx.candidacy.updateMany({
      where: { id: candidacyId, clientId: current.clientId, version: input.version },
      data: {
        ...(canManage
          ? {
              clusterId: input.clusterId,
              rank: input.rank,
              fitScore: input.fitScore,
              agencyRationale: input.agencyRationale,
              contentIdea: input.contentIdea,
              deliverablesSummary: input.deliverablesSummary,
              storiesCount: input.storiesCount,
              reelsCount: input.reelsCount,
              postsCount: input.postsCount,
              tiktoksCount: input.tiktoksCount,
              videosCount: input.videosCount,
              availability: input.availability,
              contactStatus: input.contactStatus,
              negotiationStatus: input.negotiationStatus,
              ownerUserId: input.ownerUserId,
              rejectionReason: input.rejectionReason,
            }
          : {}),
        ...(canManage && canInternal ? { internalNotes: input.internalNotes } : {}),
        ...(canBudget
          ? {
              currency: input.currency,
              budgetRequested: input.budgetRequested == null ? null : String(input.budgetRequested),
              budgetNegotiated: input.budgetNegotiated == null ? null : String(input.budgetNegotiated),
              cacheAmount: input.cacheAmount == null ? null : String(input.cacheAmount),
              barterDescription: input.barterDescription,
              budgetPrivateNotes: input.budgetPrivateNotes,
            }
          : {}),
        version: { increment: 1 },
      },
    })
    assertUpdated(result.count)

    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.CANDIDACY_UPDATED,
      entityType: 'Candidacy',
      entityId: candidacyId,
      clientId: current.clientId,
    })
    if (canBudget) {
      const budgetChanged =
        String(current.budgetRequested ?? '') !== String(input.budgetRequested ?? '') ||
        String(current.budgetNegotiated ?? '') !== String(input.budgetNegotiated ?? '') ||
        String(current.cacheAmount ?? '') !== String(input.cacheAmount ?? '')
      if (budgetChanged) {
        await recordAudit(tx, actorOf(ctx), {
          action: AUDIT.BUDGET_CHANGED,
          entityType: 'Candidacy',
          entityId: candidacyId,
          clientId: current.clientId,
          before: {
            requested: current.budgetRequested?.toString() ?? null,
            negotiated: current.budgetNegotiated?.toString() ?? null,
          },
          after: { requested: input.budgetRequested ?? null, negotiated: input.budgetNegotiated ?? null },
        })
      }
    }
  })
}

/** Cambia el estado y deja el evento con usuario, fecha y comentario. */
export async function changeCandidacyStatus(
  ctx: AuthContext,
  candidacyId: string,
  toStatusKey: string,
  comment?: string | null,
): Promise<void> {
  const current = await scoped(ctx, (tx) => tx.candidacy.findUnique({ where: { id: candidacyId } }))
  if (!current) throw new NotFoundError()
  assertClientInScope(ctx, current.clientId)
  assertCan(ctx, 'candidate.manage', current.clientId)

  await scoped(ctx, async (tx) => {
    const status = await tx.candidacyStatusDef.findUnique({ where: { key: toStatusKey } })
    if (!status || !status.active) throw new ValidationError('Ese estado no existe o está desactivado.')
    if (current.statusKey === toStatusKey) return

    const now = new Date()
    await tx.candidacy.update({
      where: { id: candidacyId },
      data: {
        statusKey: toStatusKey,
        version: { increment: 1 },
        ...(toStatusKey === 'PROPUESTO' && !current.proposedAt ? { proposedAt: now } : {}),
        ...(toStatusKey === 'CONTACTAR' && !current.contactedAt ? { contactedAt: now } : {}),
        ...(toStatusKey === 'CONFIRMADO' && !current.confirmedAt ? { confirmedAt: now } : {}),
        ...(toStatusKey === 'PUBLICADO' && !current.publishedAt ? { publishedAt: now } : {}),
        ...(status.isTerminal && !current.closedAt ? { closedAt: now } : {}),
      },
    })
    await tx.candidacyStatusEvent.create({
      data: {
        candidacyId,
        clientId: current.clientId,
        fromStatusKey: current.statusKey,
        toStatusKey,
        comment: comment ?? null,
        actorUserId: ctx.user.id,
        actorEmail: ctx.user.email,
        actorRole: ctx.agencyRole ?? ctx.clients.find((c) => c.id === current.clientId)?.role ?? null,
      },
    })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.CANDIDACY_STATUS_CHANGED,
      entityType: 'Candidacy',
      entityId: candidacyId,
      clientId: current.clientId,
      before: { statusKey: current.statusKey },
      after: { statusKey: toStatusKey },
      metadata: comment ? { comment } : undefined,
    })
  })
}

const APPROVAL_TO_STATUS: Partial<Record<ClientApproval, string>> = {
  APPROVED: 'APROBADO',
  REJECTED: 'RECHAZADO',
  NEEDS_REVIEW: 'A_REVISAR',
  REPLACEMENT_REQUESTED: 'SOLICITAR_REEMPLAZO',
}

/** Aprobar / rechazar / pedir revisión. Es la acción central del portal del cliente. */
export async function setClientApproval(
  ctx: AuthContext,
  candidacyId: string,
  approval: ClientApproval,
  feedback?: string | null,
): Promise<void> {
  const current = await scoped(ctx, (tx) => tx.candidacy.findUnique({ where: { id: candidacyId } }))
  if (!current) throw new NotFoundError()
  assertClientInScope(ctx, current.clientId)
  assertCan(ctx, 'candidate.approve', current.clientId)
  if (ctx.side === 'CLIENT' && !current.clientVisible) throw new NotFoundError()
  if (approval === 'REJECTED' && !feedback?.trim()) {
    throw new ValidationError('Contanos el motivo del rechazo.', { feedback: ['Es obligatorio al rechazar.'] })
  }

  const authorSide = ctx.side === 'CLIENT' ? 'CLIENT' : 'AGENCY'
  const now = new Date()

  await scoped(ctx, async (tx) => {
    await tx.candidacy.update({
      where: { id: candidacyId },
      data: {
        clientApproval: approval,
        clientApprovalAt: now,
        clientApprovalById: ctx.user.id,
        version: { increment: 1 },
      },
    })

    if (feedback?.trim()) {
      await tx.comment.create({
        data: {
          clientId: current.clientId,
          campaignId: current.campaignId,
          candidacyId,
          authorUserId: ctx.user.id,
          authorSide,
          visibility: authorSide === 'CLIENT' ? 'CLIENT_AUTHORED' : 'CLIENT_VISIBLE',
          body: feedback.trim(),
        },
      })
    }

    const nextStatus = APPROVAL_TO_STATUS[approval]
    if (nextStatus && nextStatus !== current.statusKey) {
      const status = await tx.candidacyStatusDef.findUnique({ where: { key: nextStatus } })
      if (status?.active) {
        await tx.candidacy.update({
          where: { id: candidacyId },
          data: { statusKey: nextStatus, ...(status.isTerminal && !current.closedAt ? { closedAt: now } : {}) },
        })
        await tx.candidacyStatusEvent.create({
          data: {
            candidacyId,
            clientId: current.clientId,
            fromStatusKey: current.statusKey,
            toStatusKey: nextStatus,
            comment: feedback?.trim() ?? null,
            actorUserId: ctx.user.id,
            actorEmail: ctx.user.email,
            actorRole: ctx.agencyRole ?? ctx.clients.find((c) => c.id === current.clientId)?.role ?? null,
          },
        })
      }
    }

    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.CANDIDACY_APPROVAL,
      entityType: 'Candidacy',
      entityId: candidacyId,
      clientId: current.clientId,
      before: { clientApproval: current.clientApproval },
      after: { clientApproval: approval },
    })
  })
}

/** Interruptor de visibilidad hacia el cliente. Sólo la agencia. */
export async function setCandidacyVisibility(
  ctx: AuthContext,
  candidacyIds: string[],
  visible: boolean,
): Promise<number> {
  if (ctx.side !== 'AGENCY') throw new ForbiddenError('Sólo la agencia decide qué ve el cliente.')
  if (candidacyIds.length === 0) return 0

  return scoped(ctx, async (tx) => {
    const rows = await tx.candidacy.findMany({
      where: { id: { in: candidacyIds } },
      select: { id: true, clientId: true },
    })
    // Cualquier id fuera de alcance hace fallar la operación entera.
    if (rows.length !== candidacyIds.length) throw new NotFoundError()
    for (const row of rows) assertCan(ctx, 'candidate.manage', row.clientId)

    const result = await tx.candidacy.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { clientVisible: visible, ...(visible ? { proposedAt: new Date() } : {}), version: { increment: 1 } },
    })
    for (const row of rows) {
      await recordAudit(tx, actorOf(ctx), {
        action: AUDIT.CANDIDACY_VISIBILITY,
        entityType: 'Candidacy',
        entityId: row.id,
        clientId: row.clientId,
        after: { clientVisible: visible },
      })
    }
    return result.count
  })
}

export async function setShortlist(
  ctx: AuthContext,
  campaignId: string,
  entries: Array<{ candidacyId: string; order: number }>,
): Promise<void> {
  const clientId = await resolveCampaignClient(ctx, campaignId)
  assertCan(ctx, 'candidate.manage', clientId)

  await scoped(ctx, async (tx) => {
    const ids = entries.map((e) => e.candidacyId)
    const rows = await tx.candidacy.findMany({
      where: { id: { in: ids }, campaignId, clientId },
      select: { id: true },
    })
    if (rows.length !== ids.length) throw new NotFoundError()

    await tx.candidacy.updateMany({
      where: { campaignId, clientId },
      data: { inShortlist: false, shortlistOrder: null },
    })
    for (const entry of entries) {
      await tx.candidacy.update({
        where: { id: entry.candidacyId },
        data: { inShortlist: true, shortlistOrder: entry.order },
      })
    }
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.SHORTLIST_CHANGED,
      entityType: 'Campaign',
      entityId: campaignId,
      clientId,
      after: { shortlist: entries },
    })
  })
}

/**
 * Perfiles de la campaña que están marcados como posible duplicado.
 * El Excel de origen repite personas entre hojas; el importador no las fusiona,
 * así que la campaña tiene que avisar en vez de mostrarlas como si fueran distintas.
 */
export async function duplicateWarnings(
  ctx: AuthContext,
  campaignId: string,
): Promise<Array<{ influencerId: string; displayName: string; otherName: string; reason: string }>> {
  const clientId = await resolveCampaignClient(ctx, campaignId)
  if (ctx.side !== 'AGENCY') return []
  assertCan(ctx, 'candidate.view', clientId)

  return scoped(ctx, async (tx) => {
    const candidacies = await tx.candidacy.findMany({
      where: { campaignId, clientId },
      select: { influencerId: true, influencer: { select: { displayName: true } } },
    })
    if (candidacies.length === 0) return []
    const ids = candidacies.map((row) => row.influencerId)
    const nameById = new Map(candidacies.map((row) => [row.influencerId, row.influencer.displayName]))

    const pairs = await tx.influencerDuplicate.findMany({
      where: {
        status: 'OPEN',
        OR: [{ influencerAId: { in: ids } }, { influencerBId: { in: ids } }],
      },
      include: {
        influencerA: { select: { id: true, displayName: true } },
        influencerB: { select: { id: true, displayName: true } },
      },
      take: 100,
    })

    const warnings: Array<{ influencerId: string; displayName: string; otherName: string; reason: string }> = []
    for (const pair of pairs) {
      const inside = nameById.has(pair.influencerAId) ? pair.influencerA : pair.influencerB
      const other = nameById.has(pair.influencerAId) ? pair.influencerB : pair.influencerA
      warnings.push({
        influencerId: inside.id,
        displayName: inside.displayName,
        otherName: other.displayName,
        reason: pair.reason,
      })
    }
    return warnings
  })
}

export type StatusEventDto = {
  id: string
  fromStatusKey: string | null
  toStatusKey: string
  comment: string | null
  actorEmail: string | null
  actorRole: string | null
  createdAt: string
}

export async function listStatusEvents(ctx: AuthContext, candidacyId: string): Promise<StatusEventDto[]> {
  const candidacy = await scoped(ctx, (tx) =>
    tx.candidacy.findUnique({ where: { id: candidacyId }, select: { clientId: true, clientVisible: true } }),
  )
  if (!candidacy) throw new NotFoundError()
  assertClientInScope(ctx, candidacy.clientId)
  assertCan(ctx, 'candidate.view', candidacy.clientId)
  if (ctx.side === 'CLIENT' && !candidacy.clientVisible) throw new NotFoundError()

  const rows = await scoped(ctx, (tx) =>
    tx.candidacyStatusEvent.findMany({ where: { candidacyId }, orderBy: { createdAt: 'desc' }, take: 200 }),
  )
  return rows.map((row) => ({
    id: row.id,
    fromStatusKey: row.fromStatusKey,
    toStatusKey: row.toStatusKey,
    comment: row.comment,
    // El cliente no necesita saber el email interno de quien movió el estado.
    actorEmail: ctx.side === 'AGENCY' ? row.actorEmail : null,
    actorRole: row.actorRole,
    createdAt: row.createdAt.toISOString(),
  }))
}
