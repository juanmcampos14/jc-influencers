import 'server-only'
import type { DeliverableStatus, DeliverableType, MetricsSource } from '@/generated/prisma/enums'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { NotFoundError, ValidationError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import { actorOf, scoped } from './base'

/**
 * Las entregas: qué publicó cada influencer y qué midió.
 *
 * Es el eslabón que faltaba para que la palabra "reporte" signifique algo. Sin
 * esto, la plataforma sabe a quién eligió la agencia y cuánto le pagó, pero no
 * qué pasó después -- y un reporte sobre eso sería una lista de intenciones.
 *
 * Cada métrica es opcional a propósito. `null` significa "nadie lo cargó", que
 * NO es lo mismo que cero. Un reporte que trata el hueco como un cero informa
 * una caída que nunca pasó, y esa es exactamente la clase de número que después
 * alguien defiende en una reunión.
 */

export type EntregaDto = {
  id: string
  candidacyId: string
  quien: string
  type: DeliverableType
  status: DeliverableStatus
  description: string | null
  url: string | null
  publishedAt: string | null
  metricas: {
    views: number | null
    likes: number | null
    comments: number | null
    shares: number | null
    saves: number | null
    reach: number | null
  }
  metricsSource: MetricsSource | null
  measuredAt: string | null
  /** Cuántas métricas de las seis tienen un número cargado. */
  cargadas: number
}

const CUENTA = ['views', 'likes', 'comments', 'shares', 'saves', 'reach'] as const

export async function listarEntregas(ctx: AuthContext, campaignId: string): Promise<EntregaDto[]> {
  const campaign = await scoped(ctx, (tx) =>
    tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true } }),
  )
  if (!campaign) throw new NotFoundError()
  assertClientInScope(ctx, campaign.clientId)
  assertCan(ctx, 'campaign.view', campaign.clientId)

  return scoped(ctx, async (tx) => {
    const filas = await tx.deliverable.findMany({
      where: { candidacy: { campaignId } },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      include: { candidacy: { select: { id: true, influencer: { select: { displayName: true } } } } },
    })

    return filas.map((fila) => {
      const metricas = {
        views: fila.views,
        likes: fila.likes,
        comments: fila.comments,
        shares: fila.shares,
        saves: fila.saves,
        reach: fila.reach,
      }
      return {
        id: fila.id,
        candidacyId: fila.candidacy.id,
        quien: fila.candidacy.influencer.displayName,
        type: fila.type,
        status: fila.status,
        description: fila.description,
        url: fila.url,
        publishedAt: fila.publishedAt?.toISOString() ?? null,
        metricas,
        metricsSource: fila.metricsSource,
        measuredAt: fila.measuredAt?.toISOString() ?? null,
        cargadas: CUENTA.filter((clave) => metricas[clave] !== null).length,
      }
    })
  })
}

export type EntregaInput = {
  candidacyId: string
  type: DeliverableType
  status: DeliverableStatus
  description: string | null
  url: string | null
  publishedAt: Date | null
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  reach: number | null
  metricsSource: MetricsSource | null
}

/** Alta o edición de una entrega. `deliverableId` vacío es un alta. */
export async function guardarEntrega(
  ctx: AuthContext,
  campaignId: string,
  deliverableId: string | null,
  input: EntregaInput,
): Promise<{ id: string }> {
  const campaign = await scoped(ctx, (tx) =>
    tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true } }),
  )
  if (!campaign) throw new NotFoundError()
  assertClientInScope(ctx, campaign.clientId)
  assertCan(ctx, 'candidate.manage', campaign.clientId)

  const candidacy = await scoped(ctx, (tx) =>
    tx.candidacy.findFirst({ where: { id: input.candidacyId, campaignId }, select: { id: true } }),
  )
  if (!candidacy) throw new ValidationError('Ese perfil no está en esta campaña.')

  if (input.url) {
    try {
      const url = new URL(input.url)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error()
    } catch {
      throw new ValidationError('El link de la publicación tiene que empezar con https://')
    }
  }

  const tieneMetricas = CUENTA.some((clave) => input[clave] !== null)
  if (tieneMetricas && !input.metricsSource) {
    // Un número sin procedencia no se puede defender: quien lo lea en tres
    // meses no va a saber si lo copió alguien de la app o si lo mandó el
    // influencer por captura.
    throw new ValidationError('Decí de dónde salieron las métricas antes de guardarlas.')
  }

  const datos = {
    clientId: campaign.clientId,
    candidacyId: input.candidacyId,
    type: input.type,
    status: input.status,
    description: input.description,
    url: input.url,
    publishedAt: input.publishedAt,
    views: input.views,
    likes: input.likes,
    comments: input.comments,
    shares: input.shares,
    saves: input.saves,
    reach: input.reach,
    metricsSource: tieneMetricas ? input.metricsSource : null,
    measuredAt: tieneMetricas ? new Date() : null,
  }

  return scoped(ctx, async (tx) => {
    const fila = deliverableId
      ? await tx.deliverable.update({ where: { id: deliverableId }, data: datos })
      : await tx.deliverable.create({ data: datos })

    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.DELIVERABLE_SAVED,
      entityType: 'Deliverable',
      entityId: fila.id,
      clientId: campaign.clientId,
      after: { url: input.url, metricasCargadas: CUENTA.filter((c) => input[c] !== null).length },
    })
    return { id: fila.id }
  })
}

export async function borrarEntrega(ctx: AuthContext, deliverableId: string): Promise<void> {
  const fila = await scoped(ctx, (tx) =>
    tx.deliverable.findUnique({ where: { id: deliverableId }, select: { clientId: true } }),
  )
  if (!fila) throw new NotFoundError()
  assertClientInScope(ctx, fila.clientId)
  assertCan(ctx, 'candidate.manage', fila.clientId)
  await scoped(ctx, (tx) => tx.deliverable.delete({ where: { id: deliverableId } }))
}
