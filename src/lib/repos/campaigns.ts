import 'server-only'
import type { CampaignStatus } from '@/generated/prisma/enums'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope, capabilitiesFor } from '@/lib/authz/context'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import { slugify } from '@/lib/domain/normalize'
import { fieldPermissionsFor, toCampaignDto, type CampaignDto } from '@/lib/domain/dto'
import { actorOf, assertUpdated, normalizePagination, paginate, scoped, skipTake, type Paginated } from './base'

/**
 * Sin orden explícito, las campañas vivas van primero: el enum está declarado
 * en orden de avance y termina en CLOSED y CANCELLED, así que ordenar por
 * estado deja las cerradas al final sin necesidad de un CASE.
 *
 * Antes ordenaba sólo por última modificación, y como importar toca las
 * históricas, las cerradas tapaban a las tres que estaban en curso.
 */
function ordenPrisma(orden?: OrdenDeCampanas) {
  if (!orden) return [{ status: 'asc' as const }, { updatedAt: 'desc' as const }]
  const dir = orden.direccion
  switch (orden.clave) {
    case 'nombre':
      return [{ name: dir }]
    case 'cliente':
      return [{ client: { name: dir } }, { name: 'asc' as const }]
    case 'estado':
      return [{ status: dir }, { updatedAt: 'desc' as const }]
    case 'perfiles':
      return [{ candidacies: { _count: dir } }]
    case 'fechas':
      // Una campaña sin fecha de inicio no es "la más vieja": va al final en
      // los dos sentidos, para no inventarle una posición en el calendario.
      return [{ startDate: { sort: dir, nulls: 'last' as const } }]
    default:
      return [{ status: 'asc' as const }, { updatedAt: 'desc' as const }]
  }
}

export type CampaignFilters = {
  clientId?: string | null
  status?: CampaignStatus[] | null
  search?: string | null
}

export type CampaignListItem = CampaignDto & {
  clientName: string
  candidacyCount: number
  approvedCount: number
  pendingApprovalCount: number
}

/**
 * Claves por las que se puede ordenar la lista.
 *
 * El presupuesto NO está, y es a propósito: no todos ven ese campo, y ordenar
 * por una columna oculta la filtra igual -- se pide el orden y se deduce el
 * valor mirando dónde cae cada fila.
 */
export type OrdenDeCampanas = { clave: 'nombre' | 'cliente' | 'estado' | 'perfiles' | 'fechas'; direccion: 'asc' | 'desc' }

export async function listCampaigns(
  ctx: AuthContext,
  filters: CampaignFilters = {},
  pageInput?: { page?: number; pageSize?: number },
  orden?: OrdenDeCampanas,
): Promise<Paginated<CampaignListItem>> {
  // Un clientId recibido del navegador se valida contra el alcance antes de usarse.
  if (filters.clientId) assertClientInScope(ctx, filters.clientId)
  const scopeClientId = filters.clientId ?? ctx.activeClientId
  assertCan(ctx, 'campaign.view', scopeClientId)

  const pagination = normalizePagination(pageInput)
  const where = {
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.status && filters.status.length > 0 ? { status: { in: filters.status } } : {}),
    ...(filters.search
      ? { OR: [{ name: { contains: filters.search, mode: 'insensitive' as const } }, { description: { contains: filters.search, mode: 'insensitive' as const } }] }
      : {}),
  }

  return scoped(ctx, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.campaign.findMany({
        where,
        orderBy: ordenPrisma(orden),
        ...skipTake(pagination),
        include: {
          client: { select: { name: true } },
          candidacies: { select: { clientApproval: true, clientVisible: true } },
        },
      }),
      tx.campaign.count({ where }),
    ])

    const items = rows.map((row) => {
      const perms = fieldPermissionsFor(ctx, row.clientId)
      const visible = ctx.side === 'CLIENT' ? row.candidacies.filter((c) => c.clientVisible) : row.candidacies
      return {
        ...toCampaignDto(row, perms),
        clientName: row.client.name,
        candidacyCount: visible.length,
        approvedCount: visible.filter((c) => c.clientApproval === 'APPROVED').length,
        pendingApprovalCount: visible.filter((c) => c.clientApproval === 'PENDING' || c.clientApproval === 'NEEDS_REVIEW').length,
      }
    })
    return paginate(items, total, pagination)
  })
}

export type CampaignDetail = CampaignDto & {
  clientName: string
  clientSlug: string
  team: Array<{ userId: string; name: string; email: string; role: string }>
  links: Array<{ id: string; label: string; url: string; kind: string }>
}

/**
 * Trae una campaña por id. Si pertenece a otro tenant devuelve 404, no 403:
 * cambiar el id en la URL no permite descubrir que existe.
 */
export async function getCampaign(ctx: AuthContext, campaignId: string): Promise<CampaignDetail> {
  const row = await scoped(ctx, (tx) =>
    tx.campaign.findUnique({
      where: { id: campaignId },
      include: {
        client: { select: { name: true, slug: true } },
        assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
        links: true,
      },
    }),
  )
  if (!row) throw new NotFoundError()
  assertClientInScope(ctx, row.clientId)
  assertCan(ctx, 'campaign.view', row.clientId)

  const perms = fieldPermissionsFor(ctx, row.clientId)
  return {
    ...toCampaignDto(row, perms),
    clientName: row.client.name,
    clientSlug: row.client.slug,
    team: row.assignments.map((a) => ({ userId: a.user.id, name: a.user.name, email: a.user.email, role: a.role })),
    links: row.links.map((l) => ({ id: l.id, label: l.label, url: l.url, kind: l.kind })),
  }
}

export type CampaignWriteInput = {
  name: string
  description?: string | null
  objective?: string | null
  status?: CampaignStatus
  countries?: string[]
  platforms?: string[]
  startDate?: Date | null
  endDate?: Date | null
  currency?: string
  budgetEstimated?: number | null
  budgetCache?: number | null
  barterDescription?: string | null
}

function assertDateRange(start?: Date | null, end?: Date | null): void {
  if (start && end && end.getTime() < start.getTime()) {
    throw new ValidationError({ clave: 'fechaFinAntesDeInicio' }, {
      endDate: ['Debe ser posterior a la fecha de inicio.'],
    })
  }
}

export async function createCampaign(
  ctx: AuthContext,
  clientId: string,
  input: CampaignWriteInput,
): Promise<{ id: string; slug: string }> {
  assertClientInScope(ctx, clientId)
  assertCan(ctx, 'campaign.create', clientId)
  assertDateRange(input.startDate, input.endDate)

  const canBudget = capabilitiesFor(ctx, clientId).has('budget.manage')
  const baseSlug = slugify(input.name)
  if (!baseSlug) throw new ValidationError({ clave: 'campanaSinSlug' })

  return scoped(ctx, async (tx) => {
    let slug = baseSlug
    let attempt = 1
    while (await tx.campaign.findUnique({ where: { clientId_slug: { clientId, slug } } })) {
      attempt += 1
      slug = `${baseSlug}-${attempt}`
      if (attempt > 50) throw new ValidationError({ clave: 'sinIdentificadorUnico' })
    }
    const created = await tx.campaign.create({
      data: {
        clientId,
        slug,
        name: input.name.trim(),
        description: input.description ?? null,
        objective: input.objective ?? null,
        status: input.status ?? 'DRAFT',
        countries: input.countries ?? [],
        platforms: input.platforms ?? [],
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        currency: input.currency ?? 'USD',
        budgetEstimated: canBudget && input.budgetEstimated != null ? String(input.budgetEstimated) : null,
        budgetCache: canBudget && input.budgetCache != null ? String(input.budgetCache) : null,
        barterDescription: canBudget ? (input.barterDescription ?? null) : null,
        createdById: ctx.user.id,
      },
    })
    await tx.campaignAssignment.create({
      data: { campaignId: created.id, clientId, userId: ctx.user.id, role: 'OWNER' },
    })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.CAMPAIGN_CREATED,
      entityType: 'Campaign',
      entityId: created.id,
      clientId,
      after: { name: created.name, status: created.status },
    })
    return { id: created.id, slug: created.slug }
  })
}

export async function updateCampaign(
  ctx: AuthContext,
  campaignId: string,
  input: CampaignWriteInput & { version: number },
): Promise<void> {
  const current = await scoped(ctx, (tx) => tx.campaign.findUnique({ where: { id: campaignId } }))
  if (!current) throw new NotFoundError()
  assertClientInScope(ctx, current.clientId)

  const caps = capabilitiesFor(ctx, current.clientId)
  const canEditCampaign = caps.has('campaign.update')
  const canBudget = caps.has('budget.manage')
  // Finanzas administra presupuestos sin poder editar el resto de la campaña.
  if (!canEditCampaign && !canBudget) throw new ForbiddenError()
  assertDateRange(input.startDate, input.endDate)
  const budgetChanged =
    canBudget &&
    (String(current.budgetEstimated ?? '') !== String(input.budgetEstimated ?? '') ||
      String(current.budgetCache ?? '') !== String(input.budgetCache ?? ''))

  await scoped(ctx, async (tx) => {
    const result = await tx.campaign.updateMany({
      where: { id: campaignId, clientId: current.clientId, version: input.version },
      data: {
        ...(canEditCampaign
          ? {
              name: input.name?.trim(),
              description: input.description,
              objective: input.objective,
              status: input.status,
              countries: input.countries,
              platforms: input.platforms,
              startDate: input.startDate,
              endDate: input.endDate,
              currency: input.currency,
            }
          : {}),
        ...(canBudget
          ? {
              budgetEstimated: input.budgetEstimated == null ? null : String(input.budgetEstimated),
              budgetCache: input.budgetCache == null ? null : String(input.budgetCache),
              barterDescription: input.barterDescription ?? null,
            }
          : {}),
        version: { increment: 1 },
      },
    })
    assertUpdated(result.count)

    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.CAMPAIGN_UPDATED,
      entityType: 'Campaign',
      entityId: campaignId,
      clientId: current.clientId,
      before: { name: current.name, status: current.status },
      after: { name: input.name, status: input.status },
    })
    if (budgetChanged) {
      await recordAudit(tx, actorOf(ctx), {
        action: AUDIT.BUDGET_CHANGED,
        entityType: 'Campaign',
        entityId: campaignId,
        clientId: current.clientId,
        before: { estimated: current.budgetEstimated?.toString() ?? null, cache: current.budgetCache?.toString() ?? null },
        after: { estimated: input.budgetEstimated ?? null, cache: input.budgetCache ?? null },
      })
    }
  })
}

// ── Brief ────────────────────────────────────────────────────────────────────

export type BriefDto = {
  id: string | null
  campaignId: string
  country: string | null
  language: string | null
  followersMin: number | null
  followersMax: number | null
  engagementRateMin: number | null
  audienceAgeMin: number | null
  audienceAgeMax: number | null
  audienceGeoPredominance: string | null
  audienceGeoMinPercent: number | null
  platforms: string[]
  idealProfile: string | null
  contentIdeas: string | null
  realProductUses: string | null
  inclusionCriteria: string | null
  exclusionCriteria: string | null
  version: number
  niches: Array<{ id: string; label: string; mode: string; priority: number; idealProfile: string | null }>
  keywords: Array<{ id: string; category: string; term: string }>
  clusters: Array<{ id: string; key: string; label: string; emoji: string | null; targetPercent: number; description: string | null; order: number }>
  /** Sólo con `internal_notes.view`. */
  internalNotes?: string | null
}

export async function getBrief(ctx: AuthContext, campaignId: string): Promise<BriefDto | null> {
  const campaign = await scoped(ctx, (tx) => tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true } }))
  if (!campaign) throw new NotFoundError()
  assertClientInScope(ctx, campaign.clientId)
  assertCan(ctx, 'brief.view', campaign.clientId)

  const row = await scoped(ctx, (tx) =>
    tx.campaignBrief.findUnique({
      where: { campaignId },
      include: {
        niches: { orderBy: { order: 'asc' } },
        keywords: { orderBy: [{ category: 'asc' }, { order: 'asc' }] },
        clusters: { orderBy: { order: 'asc' } },
      },
    }),
  )
  if (!row) return null

  const perms = fieldPermissionsFor(ctx, campaign.clientId)
  const dto: BriefDto = {
    id: row.id,
    campaignId,
    country: row.country,
    language: row.language,
    followersMin: row.followersMin,
    followersMax: row.followersMax,
    engagementRateMin: row.engagementRateMin === null ? null : Number(row.engagementRateMin),
    audienceAgeMin: row.audienceAgeMin,
    audienceAgeMax: row.audienceAgeMax,
    audienceGeoPredominance: row.audienceGeoPredominance,
    audienceGeoMinPercent: row.audienceGeoMinPercent,
    platforms: row.platforms,
    idealProfile: row.idealProfile,
    contentIdeas: row.contentIdeas,
    realProductUses: row.realProductUses,
    inclusionCriteria: row.inclusionCriteria,
    exclusionCriteria: row.exclusionCriteria,
    version: row.version,
    niches: row.niches.map((n) => ({ id: n.id, label: n.label, mode: n.mode, priority: n.priority, idealProfile: n.idealProfile })),
    keywords: row.keywords.map((k) => ({ id: k.id, category: k.category, term: k.term })),
    clusters: row.clusters.map((c) => ({
      id: c.id,
      key: c.key,
      label: c.label,
      emoji: c.emoji,
      targetPercent: c.targetPercent,
      description: c.description,
      order: c.order,
    })),
  }
  if (perms.canViewInternalNotes) dto.internalNotes = row.internalNotes
  return dto
}

export type BriefWriteInput = {
  country?: string | null
  language?: string | null
  followersMin?: number | null
  followersMax?: number | null
  engagementRateMin?: number | null
  audienceAgeMin?: number | null
  audienceAgeMax?: number | null
  audienceGeoPredominance?: string | null
  audienceGeoMinPercent?: number | null
  platforms?: string[]
  idealProfile?: string | null
  contentIdeas?: string | null
  realProductUses?: string | null
  inclusionCriteria?: string | null
  exclusionCriteria?: string | null
  internalNotes?: string | null
  niches?: Array<{ label: string; mode: 'PRIORITY' | 'EXCLUDED'; priority: number; idealProfile?: string | null }>
  keywords?: Array<{ category: string; term: string }>
  clusters?: Array<{ key: string; label: string; emoji?: string | null; targetPercent: number; description?: string | null }>
  version?: number
}

export async function upsertBrief(ctx: AuthContext, campaignId: string, input: BriefWriteInput): Promise<void> {
  const campaign = await scoped(ctx, (tx) => tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true } }))
  if (!campaign) throw new NotFoundError()
  const clientId = campaign.clientId
  assertClientInScope(ctx, clientId)
  assertCan(ctx, 'brief.manage', clientId)

  if (input.followersMin != null && input.followersMax != null && input.followersMax < input.followersMin) {
    throw new ValidationError({ clave: 'rangoInvertido' }, { followersMax: ['Debe ser mayor al mínimo.'] })
  }
  if (input.clusters) {
    const total = input.clusters.reduce((sum, c) => sum + c.targetPercent, 0)
    if (total > 100) {
      throw new ValidationError({ clave: 'squadSupera100' }, {
        clusters: [`La suma de los clusters da ${total}%.`],
      })
    }
  }
  const canViewInternal = capabilitiesFor(ctx, clientId).has('internal_notes.view')

  await scoped(ctx, async (tx) => {
    const before = await tx.campaignBrief.findUnique({ where: { campaignId } })

    const data = {
      country: input.country ?? null,
      language: input.language ?? null,
      followersMin: input.followersMin ?? null,
      followersMax: input.followersMax ?? null,
      engagementRateMin: input.engagementRateMin == null ? null : String(input.engagementRateMin),
      audienceAgeMin: input.audienceAgeMin ?? null,
      audienceAgeMax: input.audienceAgeMax ?? null,
      audienceGeoPredominance: input.audienceGeoPredominance ?? null,
      audienceGeoMinPercent: input.audienceGeoMinPercent ?? null,
      platforms: input.platforms ?? [],
      idealProfile: input.idealProfile ?? null,
      contentIdeas: input.contentIdeas ?? null,
      realProductUses: input.realProductUses ?? null,
      inclusionCriteria: input.inclusionCriteria ?? null,
      exclusionCriteria: input.exclusionCriteria ?? null,
      // Las notas internas sólo se tocan si el usuario puede verlas.
      ...(canViewInternal ? { internalNotes: input.internalNotes ?? null } : {}),
    }

    let briefId: string
    if (before) {
      if (input.version !== undefined) {
        const result = await tx.campaignBrief.updateMany({
          where: { id: before.id, clientId, version: input.version },
          data: { ...data, version: { increment: 1 } },
        })
        assertUpdated(result.count)
      } else {
        await tx.campaignBrief.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 } } })
      }
      briefId = before.id
    } else {
      const created = await tx.campaignBrief.create({ data: { ...data, campaignId, clientId } })
      briefId = created.id
    }

    if (input.niches) {
      await tx.briefNiche.deleteMany({ where: { briefId, clientId } })
      await tx.briefNiche.createMany({
        data: input.niches.map((niche, index) => ({
          briefId,
          clientId,
          label: niche.label,
          mode: niche.mode,
          priority: niche.priority,
          idealProfile: niche.idealProfile ?? null,
          order: index,
        })),
      })
    }
    if (input.keywords) {
      await tx.briefKeyword.deleteMany({ where: { briefId, clientId } })
      const unique = new Map(input.keywords.map((k) => [`${k.category}::${k.term}`, k]))
      await tx.briefKeyword.createMany({
        data: [...unique.values()].map((keyword, index) => ({
          briefId,
          clientId,
          category: keyword.category,
          term: keyword.term,
          order: index,
        })),
      })
    }
    if (input.clusters) {
      const keys = input.clusters.map((c) => c.key)
      // No se borra un cluster con candidaturas asignadas: primero hay que moverlas.
      const orphaned = await tx.briefCluster.findMany({
        where: { briefId, clientId, key: { notIn: keys.length > 0 ? keys : ['__ninguno__'] } },
        include: { _count: { select: { candidacies: true } } },
      })
      const blocked = orphaned.filter((c) => c._count.candidacies > 0)
      if (blocked.length > 0) {
        throw new ValidationError({ clave: 'clustersConCandidaturas' }, {
          clusters: blocked.map((c) => `"${c.label}" tiene ${c._count.candidacies} candidatura(s). Reasignalas antes de borrarlo.`),
        })
      }
      await tx.briefCluster.deleteMany({ where: { id: { in: orphaned.map((c) => c.id) } } })
      for (const [index, cluster] of input.clusters.entries()) {
        await tx.briefCluster.upsert({
          where: { briefId_key: { briefId, key: cluster.key } },
          create: {
            briefId,
            clientId,
            key: cluster.key,
            label: cluster.label,
            emoji: cluster.emoji ?? null,
            targetPercent: cluster.targetPercent,
            description: cluster.description ?? null,
            order: index,
          },
          update: {
            label: cluster.label,
            emoji: cluster.emoji ?? null,
            targetPercent: cluster.targetPercent,
            description: cluster.description ?? null,
            order: index,
          },
        })
      }
    }

    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.BRIEF_UPDATED,
      entityType: 'CampaignBrief',
      entityId: briefId,
      clientId,
      before: before ? { followersMin: before.followersMin, followersMax: before.followersMax } : undefined,
      after: { followersMin: data.followersMin, followersMax: data.followersMax },
    })
  })
}

/**
 * Mueve una campaña de estado, sin tocar nada más.
 *
 * Es la operación más repetida sobre una campaña -- Brief → Scouting →
 * Propuesta → Cerrada -- y además es lo que ordena la lista. No tenía forma de
 * hacerse: el estado se elegía en el alta y quedaba congelado ahí.
 */
export async function changeCampaignStatus(
  ctx: AuthContext,
  campaignId: string,
  status: CampaignStatus,
  version: number,
): Promise<void> {
  const current = await scoped(ctx, (tx) => tx.campaign.findUnique({ where: { id: campaignId } }))
  if (!current) throw new NotFoundError()
  assertClientInScope(ctx, current.clientId)
  assertCan(ctx, 'campaign.update', current.clientId)
  if (current.status === status) return

  await scoped(ctx, async (tx) => {
    const result = await tx.campaign.updateMany({
      where: { id: campaignId, clientId: current.clientId, version },
      data: { status, version: { increment: 1 } },
    })
    // El bloqueo optimista existe para que dos personas no se pisen: si alguien
    // más la movió mientras tanto, se avisa en vez de sobrescribir.
    if (result.count === 0) throw new ConflictError()

    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.CAMPAIGN_UPDATED,
      entityType: 'Campaign',
      entityId: campaignId,
      clientId: current.clientId,
      before: { status: current.status },
      after: { status },
    })
  })
}
