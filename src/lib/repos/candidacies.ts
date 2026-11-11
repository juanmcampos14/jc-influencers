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

/**
 * Lo que suma la plata de una campaña, por moneda.
 *
 * Tres números distintos que la gente junta en la cabeza y que no son lo
 * mismo, así que se muestran separados:
 *
 *  - **Pedido**: lo que cada creador pide. Es un número que cambia.
 *  - **Cerrado**: lo que se negoció. Sólo cuenta a quien ya tiene un número
 *    acordado, no a quien todavía está en "lo que pidió".
 *  - **Aprobado**: lo que el cliente dijo que sí. Es el único que se puede
 *    comprometer.
 *
 * **No se suman monedas distintas.** Mezclar pesos y dólares da un número que
 * no existe, y es exactamente el tipo de cifra que alguien repite en una
 * reunión. Se devuelve una fila por moneda y la pantalla las muestra todas.
 *
 * Para el aprobado se usa lo CERRADO si está, y si no lo pedido: aprobar sin
 * haber negociado es aprobar el precio de lista, y esconderlo mostraría cero
 * donde hay plata comprometida.
 */
export type TotalPorMoneda = { currency: string; pedido: number; cerrado: number; aprobado: number; perfiles: number }

export async function resumenDePresupuesto(ctx: AuthContext, campaignId: string): Promise<TotalPorMoneda[]> {
  const clientId = await resolveCampaignClient(ctx, campaignId)
  // La plata es de la agencia: el portal del cliente no la ve ni por acá.
  assertCan(ctx, 'budget.view', clientId)
  const where = baseWhere(ctx, campaignId, clientId)

  const filas = await scoped(ctx, (tx) =>
    tx.candidacy.findMany({
      where,
      select: { currency: true, budgetRequested: true, budgetNegotiated: true, clientApproval: true },
    }),
  )

  const porMoneda = new Map<string, TotalPorMoneda>()
  for (const fila of filas) {
    const moneda = fila.currency || 'USD'
    const entrada = porMoneda.get(moneda) ?? { currency: moneda, pedido: 0, cerrado: 0, aprobado: 0, perfiles: 0 }
    const pedido = fila.budgetRequested === null ? null : Number(fila.budgetRequested)
    const cerrado = fila.budgetNegotiated === null ? null : Number(fila.budgetNegotiated)

    if (pedido !== null) entrada.pedido += pedido
    if (cerrado !== null) entrada.cerrado += cerrado
    if (fila.clientApproval === 'APPROVED') entrada.aprobado += cerrado ?? pedido ?? 0
    if (pedido !== null || cerrado !== null) entrada.perfiles += 1

    porMoneda.set(moneda, entrada)
  }

  /*
   * Una campaña sin un solo número no devuelve una fila en cero: cero y "no
   * se cargó nada" no son lo mismo, y la pantalla tiene que poder decir cuál
   * de los dos es.
   */
  return [...porMoneda.values()]
    .filter((entrada) => entrada.perfiles > 0)
    .sort((a, b) => b.pedido - a.pedido)
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
    if (existing) throw new ValidationError({ clave: 'influencerYaEnCampana' })

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
  if (!cluster) throw new ValidationError({ clave: 'clusterAjeno' })
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
        throw new ValidationError({ clave: 'responsableSinAcceso' })
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
    if (!status || !status.active) throw new ValidationError({ clave: 'estadoInexistente' })
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
    throw new ValidationError({ clave: 'motivoDeRechazo' }, { feedback: ['Es obligatorio al rechazar.'] })
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
  if (ctx.side !== 'AGENCY') throw new ForbiddenError({ clave: 'soloAgenciaDecideVisibilidad' })
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
  /** Candidaturas que quien guarda tenía a la vista. Sólo se toca este conjunto. */
  known: string[] = [],
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

    /*
     * Sólo se toca lo que quien guarda tenía a la vista.
     *
     * Antes esto limpiaba la shortlist ENTERA y volvía a marcar las entradas
     * recibidas. Como la pantalla manda una página --y encima podía venir
     * filtrada-- guardar el orden de doce perfiles sacaba de la shortlist a los
     * otros treinta, en silencio, y el aviso decía "Shortlist actualizada".
     *
     * `known` es el conjunto que el cliente realmente vio. Lo que está fuera de
     * ese conjunto no se toca: no se puede decidir sobre lo que no se miró.
     */
    const conocidas = [...new Set([...known, ...ids])]
    const existentes = await tx.candidacy.findMany({
      where: { id: { in: conocidas }, campaignId, clientId },
      select: { id: true },
    })
    if (existentes.length !== conocidas.length) throw new NotFoundError()

    await tx.candidacy.updateMany({
      where: { id: { in: conocidas }, campaignId, clientId },
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

/**
 * Suma varios influencers a una campaña de una vez.
 *
 * Desde la base de influencers no se podía hacer nada con lo que uno encontraba:
 * había que anotarse el nombre, ir a la campaña y buscarlo de nuevo.
 *
 * Los que ya estaban NO son un error, pero tampoco se ocultan: se informan
 * aparte. "Agregué 12" cuando en realidad agregaste 7 es una mentira chica que
 * después cuesta cara.
 */
export async function addInfluencersToCampaign(
  ctx: AuthContext,
  campaignId: string,
  influencerIds: string[],
): Promise<{ added: number; alreadyThere: number; notFound: number }> {
  const clientId = await resolveCampaignClient(ctx, campaignId)
  assertCan(ctx, 'candidate.manage', clientId)

  const TOPE = 200
  const todos = [...new Set(influencerIds)]
  if (todos.length === 0) throw new ValidationError({ clave: 'sinInfluencersElegidos' })
  // Un lote que no entra se rechaza, no se recorta en silencio: decir "agregué
  // 200" cuando elegiste 230 esconde treinta que nadie va a volver a mirar.
  if (todos.length > TOPE) {
    throw new ValidationError({
      clave: 'demasiadosInfluencers',
      valores: { cantidad: todos.length, maximo: TOPE },
    })
  }
  const unicos = todos

  let added = 0
  let alreadyThere = 0
  for (const influencerId of unicos) {
    try {
      await createCandidacy(ctx, campaignId, influencerId)
      added += 1
    } catch (error) {
      // Ya estaba en la campaña: no es un fallo, es información.
      if (error instanceof ValidationError) alreadyThere += 1
      else if (error instanceof NotFoundError) continue
      else throw error
    }
  }

  const notFound = unicos.length - added - alreadyThere
  return { added, alreadyThere, notFound }
}

/**
 * Cambia el estado de varias candidaturas de una vez.
 *
 * "Estos doce pasan a Contactado" es lo más repetido de la pantalla que más se
 * usa, y se hacía de a una sobre una tabla de cincuenta filas.
 *
 * Cada una pasa por `changeCandidacyStatus`, así que conserva su evento de
 * cambio con autor y fecha: el historial no se pierde por hacerlo en lote.
 */
export async function bulkChangeStatus(
  ctx: AuthContext,
  campaignId: string,
  candidacyIds: string[],
  statusKey: string,
): Promise<{ changed: number; unchanged: number }> {
  const clientId = await resolveCampaignClient(ctx, campaignId)
  assertCan(ctx, 'candidate.manage', clientId)

  const unicos = [...new Set(candidacyIds)]
  if (unicos.length === 0) throw new ValidationError({ clave: 'sinCandidaturasElegidas' })
  if (unicos.length > 200) {
    throw new ValidationError({ clave: 'demasiadasCandidaturas', valores: { cantidad: unicos.length } })
  }

  let changed = 0
  let unchanged = 0
  for (const candidacyId of unicos) {
    try {
      await changeCandidacyStatus(ctx, candidacyId, statusKey)
      changed += 1
    } catch (error) {
      // Ya estaba en ese estado, o alguien la movió mientras tanto: no es un
      // fallo del lote, pero se informa en vez de contarla como cambiada.
      if (error instanceof ValidationError || error instanceof NotFoundError) unchanged += 1
      else throw error
    }
  }
  return { changed, unchanged }
}

/**
 * Suma o saca varias candidaturas de la shortlist, sin tocar el resto.
 *
 * A diferencia de `setShortlist`, que reordena, esto es un delta: agrega al
 * final o quita, y nunca reescribe la lista entera.
 */
export async function bulkShortlist(
  ctx: AuthContext,
  campaignId: string,
  candidacyIds: string[],
  inShortlist: boolean,
): Promise<{ count: number }> {
  const clientId = await resolveCampaignClient(ctx, campaignId)
  assertCan(ctx, 'candidate.manage', clientId)
  const unicos = [...new Set(candidacyIds)].slice(0, 200)
  if (unicos.length === 0) throw new ValidationError({ clave: 'sinCandidaturasElegidas' })

  return scoped(ctx, async (tx) => {
    if (!inShortlist) {
      const result = await tx.candidacy.updateMany({
        where: { id: { in: unicos }, campaignId, clientId },
        data: { inShortlist: false, shortlistOrder: null },
      })
      await recordAudit(tx, actorOf(ctx), {
        action: AUDIT.SHORTLIST_CHANGED,
        entityType: 'Campaign',
        entityId: campaignId,
        clientId,
        after: { quitados: result.count },
      })
      return { count: result.count }
    }

    // Se agregan al final: el orden que ya tenían los demás no se toca.
    const ultimo = await tx.candidacy.aggregate({
      where: { campaignId, clientId, inShortlist: true },
      _max: { shortlistOrder: true },
    })
    let orden = (ultimo._max.shortlistOrder ?? 0) + 1
    let count = 0
    for (const id of unicos) {
      const result = await tx.candidacy.updateMany({
        where: { id, campaignId, clientId, inShortlist: false },
        data: { inShortlist: true, shortlistOrder: orden },
      })
      if (result.count > 0) {
        orden += 1
        count += 1
      }
    }
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.SHORTLIST_CHANGED,
      entityType: 'Campaign',
      entityId: campaignId,
      clientId,
      after: { agregados: count },
    })
    return { count }
  })
}

/**
 * Cuántos perfiles hay en cada cluster de la campaña.
 *
 * La pantalla del brief dibujaba barras de progreso con el porcentaje DESEADO
 * bajo el título "Distribución del squad", sin ningún número real al lado: el
 * deseo dibujado como si fuera la realidad. Con esto se pueden mostrar los dos.
 */
export async function perfilesPorCluster(ctx: AuthContext, campaignId: string): Promise<Record<string, number>> {
  const clientId = await resolveCampaignClient(ctx, campaignId)
  assertCan(ctx, 'campaign.view', clientId)

  return scoped(ctx, async (tx) => {
    const filas = await tx.candidacy.groupBy({
      by: ['clusterId'],
      where: { campaignId, clientId },
      _count: { _all: true },
    })
    const porCluster: Record<string, number> = {}
    for (const fila of filas) {
      if (fila.clusterId) porCluster[fila.clusterId] = fila._count._all
    }
    return porCluster
  })
}
