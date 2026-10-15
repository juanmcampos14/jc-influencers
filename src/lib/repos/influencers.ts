import 'server-only'
import type { AdultStatus, InfluencerStatus, Platform } from '@/generated/prisma/enums'
import type { Prisma } from '@/generated/prisma/client'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, capabilitiesFor } from '@/lib/authz/context'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import { motivoPorHandle, motivoPorNombre, motivoPorUrl } from '@/lib/domain/parecido'
import { fieldPermissionsFor, toInfluencerDto, type InfluencerDto } from '@/lib/domain/dto'
import { nameSimilarity, normalizeHandle, parseProfileUrl } from '@/lib/domain/normalize'
import { STALE_METRIC_DAYS } from '@/lib/domain/statuses'
import { actorOf, assertUpdated, normalizePagination, paginate, scoped, skipTake, type Paginated, type Tx } from './base'

const INCLUDE = {
  profiles: { orderBy: [{ isPrimary: 'desc' as const }, { followers: 'desc' as const }] },
  niches: { include: { niche: true } },
  tags: { include: { tag: true } },
}

/** La base global de influencers es de la agencia. Un usuario de cliente no la recorre. */
function assertAgency(ctx: AuthContext): void {
  if (ctx.side !== 'AGENCY') throw new NotFoundError()
}

export type InfluencerFilters = {
  search?: string | null
  countries?: string[] | null
  platforms?: Platform[] | null
  nicheKeys?: string[] | null
  tagKeys?: string[] | null
  minFollowers?: number | null
  maxFollowers?: number | null
  minEngagement?: number | null
  statuses?: InfluencerStatus[] | null
}

/**
 * Claves por las que se puede ordenar la base.
 *
 * "Seguidores" NO está todavía, y no es un descuido: el número que muestra la
 * lista es el del perfil principal, que vive en otra tabla. Ordenar sólo las
 * treinta filas de la página entre sí y titularlo "por seguidores" sería
 * mentir -- la página 2 arrancaría de nuevo desde arriba. Sale bien cuando la
 * cifra esté denormalizada en el influencer, no antes.
 */
export type OrdenDeInfluencers = {
  clave: 'nombre' | 'pais' | 'estado' | 'actualizado'
  direccion: 'asc' | 'desc'
}

function ordenPrisma(orden?: OrdenDeInfluencers) {
  if (!orden) return [{ displayName: 'asc' as const }]
  const dir = orden.direccion
  switch (orden.clave) {
    case 'pais':
      // Sin país no es "antes que Argentina": va al final en los dos sentidos.
      return [{ country: { sort: dir, nulls: 'last' as const } }, { displayName: 'asc' as const }]
    case 'estado':
      return [{ status: dir }, { displayName: 'asc' as const }]
    case 'actualizado':
      return [{ updatedAt: dir }]
    default:
      return [{ displayName: dir }]
  }
}

export async function searchInfluencers(
  ctx: AuthContext,
  filters: InfluencerFilters = {},
  pageInput?: { page?: number; pageSize?: number },
  orden?: OrdenDeInfluencers,
): Promise<Paginated<InfluencerDto>> {
  assertAgency(ctx)
  assertCan(ctx, 'influencer.view', null)
  const pagination = normalizePagination(pageInput)

  const profileConditions = {
    ...(filters.platforms?.length ? { platform: { in: filters.platforms } } : {}),
    ...(filters.minFollowers != null || filters.maxFollowers != null
      ? {
          followers: {
            ...(filters.minFollowers != null ? { gte: filters.minFollowers } : {}),
            ...(filters.maxFollowers != null ? { lte: filters.maxFollowers } : {}),
          },
        }
      : {}),
    ...(filters.minEngagement != null ? { engagementRate: { gte: String(filters.minEngagement) } } : {}),
  }
  const hasProfileFilter = Object.keys(profileConditions).length > 0

  const where = {
    ...(filters.statuses?.length ? { status: { in: filters.statuses } } : {}),
    ...(filters.countries?.length ? { country: { in: filters.countries } } : {}),
    ...(filters.nicheKeys?.length ? { niches: { some: { niche: { key: { in: filters.nicheKeys } } } } } : {}),
    ...(filters.tagKeys?.length ? { tags: { some: { tag: { key: { in: filters.tagKeys } } } } } : {}),
    ...(hasProfileFilter ? { profiles: { some: profileConditions } } : {}),
    ...(filters.search
      ? {
          OR: [
            { displayName: { contains: filters.search, mode: 'insensitive' as const } },
            { realName: { contains: filters.search, mode: 'insensitive' as const } },
            { primaryHandle: { contains: filters.search, mode: 'insensitive' as const } },
            { profiles: { some: { handle: { contains: filters.search.replace(/^@/, ''), mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  }

  const perms = fieldPermissionsFor(ctx, null)
  return scoped(ctx, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.influencer.findMany({ where, orderBy: ordenPrisma(orden), ...skipTake(pagination), include: INCLUDE }),
      tx.influencer.count({ where }),
    ])
    return paginate(rows.map((row) => toInfluencerDto(row, perms)), total, pagination)
  })
}

export type InfluencerDetail = InfluencerDto & {
  campaigns: Array<{
    candidacyId: string
    campaignId: string
    campaignName: string
    clientName: string
    statusKey: string
    clientApproval: string
    updatedAt: string
  }>
  duplicates: Array<{ id: string; otherId: string; otherName: string; reason: string; score: number; status: string }>
  history: Array<{
    profileId: string
    platform: string
    followers: number | null
    engagementRate: number | null
    source: string | null
    capturedAt: string
  }>
}

export async function getInfluencer(ctx: AuthContext, influencerId: string): Promise<InfluencerDetail> {
  assertAgency(ctx)
  assertCan(ctx, 'influencer.view', null)

  const row = await scoped(ctx, (tx) =>
    tx.influencer.findUnique({
      where: { id: influencerId },
      include: {
        ...INCLUDE,
        candidacies: {
          include: { campaign: { select: { id: true, name: true, client: { select: { name: true } } } } },
          orderBy: { updatedAt: 'desc' },
        },
        duplicatesA: { include: { influencerB: { select: { id: true, displayName: true } } } },
        duplicatesB: { include: { influencerA: { select: { id: true, displayName: true } } } },
      },
    }),
  )
  if (!row) throw new NotFoundError()

  const snapshots = await scoped(ctx, (tx) =>
    tx.metricSnapshot.findMany({
      where: { socialProfile: { influencerId } },
      orderBy: { capturedAt: 'desc' },
      take: 100,
      include: { socialProfile: { select: { id: true, platform: true } } },
    }),
  )

  const perms = fieldPermissionsFor(ctx, null)
  return {
    ...toInfluencerDto(row, perms),
    campaigns: row.candidacies.map((c) => ({
      candidacyId: c.id,
      campaignId: c.campaign.id,
      campaignName: c.campaign.name,
      clientName: c.campaign.client.name,
      statusKey: c.statusKey,
      clientApproval: c.clientApproval,
      updatedAt: c.updatedAt.toISOString(),
    })),
    duplicates: [
      ...row.duplicatesA.map((d) => ({
        id: d.id,
        otherId: d.influencerB.id,
        otherName: d.influencerB.displayName,
        reason: d.reason,
        score: d.score,
        status: d.status,
      })),
      ...row.duplicatesB.map((d) => ({
        id: d.id,
        otherId: d.influencerA.id,
        otherName: d.influencerA.displayName,
        reason: d.reason,
        score: d.score,
        status: d.status,
      })),
    ],
    history: snapshots.map((s) => ({
      profileId: s.socialProfile.id,
      platform: s.socialProfile.platform,
      followers: s.followers,
      engagementRate: s.engagementRate === null ? null : Number(s.engagementRate),
      source: s.source,
      capturedAt: s.capturedAt.toISOString(),
    })),
  }
}

export type InfluencerWriteInput = {
  displayName: string
  realName?: string | null
  primaryHandle?: string | null
  country?: string | null
  city?: string | null
  language?: string | null
  bio?: string | null
  status?: InfluencerStatus
  adultStatus?: AdultStatus
  representative?: string | null
  internalNotes?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  contactNotes?: string | null
  contactLegalBasis?: string | null
  nicheKeys?: string[]
  tagKeys?: string[]
}

export async function createInfluencer(ctx: AuthContext, input: InfluencerWriteInput): Promise<{ id: string }> {
  assertAgency(ctx)
  assertCan(ctx, 'influencer.manage', null)
  const caps = capabilitiesFor(ctx, null)

  if (!input.displayName.trim()) throw new ValidationError({ clave: 'nombreObligatorio' })
  if ((input.contactEmail || input.contactPhone) && !caps.has('influencer.contact.view')) {
    throw new ForbiddenError({ clave: 'sinPermisoContacto' })
  }

  return scoped(ctx, async (tx) => {
    const created = await tx.influencer.create({
      data: {
        displayName: input.displayName.trim(),
        realName: input.realName ?? null,
        primaryHandle: normalizeHandle(input.primaryHandle),
        country: input.country ?? null,
        city: input.city ?? null,
        language: input.language ?? null,
        bio: input.bio ?? null,
        status: input.status ?? 'NEW',
        adultStatus: input.adultStatus ?? 'NOT_CONFIRMED',
        representative: input.representative ?? null,
        ...(caps.has('internal_notes.view') ? { internalNotes: input.internalNotes ?? null } : {}),
        ...(caps.has('influencer.contact.view')
          ? {
              contactEmail: input.contactEmail ?? null,
              contactPhone: input.contactPhone ?? null,
              contactNotes: input.contactNotes ?? null,
              contactLegalBasis: input.contactLegalBasis ?? null,
            }
          : {}),
        createdById: ctx.user.id,
      },
    })
    await applyTaxonomy(tx, created.id, input)
    await detectDuplicates(tx, created.id)
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.INFLUENCER_CREATED,
      entityType: 'Influencer',
      entityId: created.id,
      after: { displayName: created.displayName },
    })
    return { id: created.id }
  })
}

export async function updateInfluencer(
  ctx: AuthContext,
  influencerId: string,
  input: InfluencerWriteInput & { version: number },
): Promise<void> {
  assertAgency(ctx)
  assertCan(ctx, 'influencer.manage', null)
  const caps = capabilitiesFor(ctx, null)

  await scoped(ctx, async (tx) => {
    const before = await tx.influencer.findUnique({ where: { id: influencerId } })
    if (!before) throw new NotFoundError()

    const result = await tx.influencer.updateMany({
      where: { id: influencerId, version: input.version },
      data: {
        displayName: input.displayName?.trim(),
        realName: input.realName,
        primaryHandle: normalizeHandle(input.primaryHandle),
        country: input.country,
        city: input.city,
        language: input.language,
        bio: input.bio,
        status: input.status,
        adultStatus: input.adultStatus,
        representative: input.representative,
        ...(caps.has('internal_notes.view') ? { internalNotes: input.internalNotes } : {}),
        ...(caps.has('influencer.contact.view')
          ? {
              contactEmail: input.contactEmail,
              contactPhone: input.contactPhone,
              contactNotes: input.contactNotes,
              contactLegalBasis: input.contactLegalBasis,
            }
          : {}),
        version: { increment: 1 },
      },
    })
    assertUpdated(result.count)
    await applyTaxonomy(tx, influencerId, input)
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.INFLUENCER_UPDATED,
      entityType: 'Influencer',
      entityId: influencerId,
      before: { displayName: before.displayName, status: before.status },
      after: { displayName: input.displayName, status: input.status },
    })
  })
}

async function applyTaxonomy(tx: Tx, influencerId: string, input: InfluencerWriteInput): Promise<void> {
  if (input.nicheKeys) {
    const niches = await tx.niche.findMany({ where: { key: { in: input.nicheKeys } }, select: { id: true } })
    await tx.influencerNiche.deleteMany({ where: { influencerId } })
    if (niches.length > 0) {
      await tx.influencerNiche.createMany({ data: niches.map((n) => ({ influencerId, nicheId: n.id })) })
    }
  }
  if (input.tagKeys) {
    const tags = await tx.tag.findMany({ where: { key: { in: input.tagKeys } }, select: { id: true } })
    await tx.influencerTag.deleteMany({ where: { influencerId } })
    if (tags.length > 0) {
      await tx.influencerTag.createMany({ data: tags.map((t) => ({ influencerId, tagId: t.id })) })
    }
  }
}

export type AddProfileInput = {
  url: string
  followersRaw?: string | null
  followers?: number | null
  engagementRate?: number | null
  engagementRaw?: string | null
  avgViews?: number | null
  audienceLocalPercent?: number | null
  metricSource?: string | null
  metricSourceUrl?: string | null
  measuredAt?: Date | null
  isPrimary?: boolean
}

/** Agrega o actualiza un perfil social y deja siempre un snapshot histórico. */
export async function upsertSocialProfile(
  ctx: AuthContext,
  influencerId: string,
  input: AddProfileInput,
): Promise<{ id: string }> {
  assertAgency(ctx)
  assertCan(ctx, 'influencer.manage', null)

  const parsed = parseProfileUrl(input.url)
  if (parsed.kind !== 'value') throw new ValidationError({ clave: 'urlDePerfilInvalida' }, { url: [parsed.reason] })
  const { platform, url, urlNormalized, handle } = parsed.value

  return scoped(ctx, async (tx) => {
    const influencer = await tx.influencer.findUnique({ where: { id: influencerId }, select: { id: true } })
    if (!influencer) throw new NotFoundError()

    const profile = await tx.socialProfile.upsert({
      where: { influencerId_platform_urlNormalized: { influencerId, platform, urlNormalized } },
      create: {
        influencerId,
        platform,
        url,
        urlNormalized,
        handle,
        followers: input.followers ?? null,
        followersRaw: input.followersRaw ?? null,
        followersUnparsed: input.followers == null && Boolean(input.followersRaw),
        engagementRate: input.engagementRate == null ? null : String(input.engagementRate),
        engagementRaw: input.engagementRaw ?? null,
        avgViews: input.avgViews ?? null,
        audienceLocalPercent: input.audienceLocalPercent == null ? null : String(input.audienceLocalPercent),
        metricSource: input.metricSource ?? null,
        metricSourceUrl: input.metricSourceUrl ?? null,
        measuredAt: input.measuredAt ?? new Date(),
        isPrimary: input.isPrimary ?? false,
      },
      update: {
        handle,
        followers: input.followers ?? undefined,
        followersRaw: input.followersRaw ?? undefined,
        engagementRate: input.engagementRate == null ? undefined : String(input.engagementRate),
        engagementRaw: input.engagementRaw ?? undefined,
        avgViews: input.avgViews ?? undefined,
        audienceLocalPercent: input.audienceLocalPercent == null ? undefined : String(input.audienceLocalPercent),
        metricSource: input.metricSource ?? undefined,
        metricSourceUrl: input.metricSourceUrl ?? undefined,
        measuredAt: input.measuredAt ?? new Date(),
        ...(input.isPrimary === undefined ? {} : { isPrimary: input.isPrimary }),
      },
    })

    // Las métricas no se pisan sin dejar rastro: cada carga deja su snapshot.
    if (input.followers != null || input.engagementRate != null) {
      await tx.metricSnapshot.create({
        data: {
          socialProfileId: profile.id,
          followers: input.followers ?? null,
          followersRaw: input.followersRaw ?? null,
          engagementRate: input.engagementRate == null ? null : String(input.engagementRate),
          avgViews: input.avgViews ?? null,
          audienceLocalPercent: input.audienceLocalPercent == null ? null : String(input.audienceLocalPercent),
          source: input.metricSource ?? null,
          sourceUrl: input.metricSourceUrl ?? null,
          capturedById: ctx.user.id,
        },
      })
    }

    await detectDuplicates(tx, influencerId)
    return { id: profile.id }
  })
}

/**
 * Detección de posibles duplicados. Nunca fusiona: sólo deja el par marcado
 * para que una persona decida.
 */
export async function detectDuplicates(tx: Tx, influencerId: string): Promise<number> {
  const subject = await tx.influencer.findUnique({
    where: { id: influencerId },
    include: { profiles: { select: { platform: true, urlNormalized: true, handle: true } } },
  })
  if (!subject) return 0

  const candidates = new Map<string, { reason: string; score: number }>()

  for (const profile of subject.profiles) {
    const sameUrl = await tx.socialProfile.findMany({
      where: { urlNormalized: profile.urlNormalized, influencerId: { not: influencerId } },
      select: { influencerId: true },
    })
    for (const match of sameUrl) {
      candidates.set(match.influencerId, { reason: motivoPorUrl(profile.urlNormalized), score: 95 })
    }
    if (profile.handle) {
      const sameHandle = await tx.socialProfile.findMany({
        where: { platform: profile.platform, handle: profile.handle, influencerId: { not: influencerId } },
        select: { influencerId: true },
      })
      for (const match of sameHandle) {
        if (!candidates.has(match.influencerId)) {
          candidates.set(match.influencerId, {
            reason: motivoPorHandle(profile.handle, profile.platform),
            score: 90,
          })
        }
      }
    }
  }

  const byName = await tx.influencer.findMany({
    where: { id: { not: influencerId } },
    select: { id: true, displayName: true },
    take: 2000,
  })
  for (const other of byName) {
    const score = nameSimilarity(subject.displayName, other.displayName)
    if (score >= 0.86 && !candidates.has(other.id)) {
      candidates.set(other.id, {
        reason: motivoPorNombre(other.displayName, Math.round(score * 100)),
        score: Math.round(score * 100),
      })
    }
  }

  let created = 0
  for (const [otherId, info] of candidates) {
    const [a, b] = influencerId < otherId ? [influencerId, otherId] : [otherId, influencerId]
    const existing = await tx.influencerDuplicate.findUnique({
      where: { influencerAId_influencerBId: { influencerAId: a, influencerBId: b } },
    })
    if (existing) continue
    await tx.influencerDuplicate.create({
      data: { influencerAId: a, influencerBId: b, reason: info.reason, score: info.score },
    })
    created += 1
  }
  return created
}

export async function listOpenDuplicates(ctx: AuthContext, pageInput?: { page?: number; pageSize?: number }) {
  assertAgency(ctx)
  assertCan(ctx, 'influencer.view', null)
  const pagination = normalizePagination(pageInput)
  return scoped(ctx, async (tx) => {
    const where = { status: 'OPEN' as const }
    const [rows, total] = await Promise.all([
      tx.influencerDuplicate.findMany({
        where,
        orderBy: { score: 'desc' },
        ...skipTake(pagination),
        include: {
          /*
           * Con el nombre solo no se puede decidir. Para elegir cuál sobrevive
           * hace falta ver quién tiene más información y quién participó de
           * campañas: fusionar hacia el vacío pierde trabajo hecho.
           */
          influencerA: { select: RESUMEN_PARA_COMPARAR },
          influencerB: { select: RESUMEN_PARA_COMPARAR },
        },
      }),
      tx.influencerDuplicate.count({ where }),
    ])
    return paginate(
      rows.map((row) => ({
        id: row.id,
        reason: row.reason,
        score: row.score,
        a: row.influencerA,
        b: row.influencerB,
        detectedAt: row.detectedAt.toISOString(),
      })),
      total,
      pagination,
    )
  })
}

/** Lo mínimo para poder decidir cuál de los dos se queda. */
const RESUMEN_PARA_COMPARAR = {
  id: true,
  displayName: true,
  primaryHandle: true,
  country: true,
  status: true,
  createdAt: true,
  profiles: {
    select: { platform: true, url: true, handle: true, followers: true },
    orderBy: [{ isPrimary: 'desc' }, { followers: 'desc' }],
    take: 3,
  },
  _count: { select: { candidacies: true, profiles: true } },
} satisfies Prisma.InfluencerSelect

export async function dismissDuplicate(ctx: AuthContext, duplicateId: string, notes?: string | null): Promise<void> {
  assertAgency(ctx)
  assertCan(ctx, 'influencer.manage', null)
  await scoped(ctx, async (tx) => {
    const result = await tx.influencerDuplicate.updateMany({
      where: { id: duplicateId, status: 'OPEN' },
      data: { status: 'DISMISSED', resolvedAt: new Date(), resolvedById: ctx.user.id, notes: notes ?? null },
    })
    if (result.count === 0) throw new NotFoundError()
  })
}

/**
 * Fusiona dos influencers que resultaron ser la misma persona.
 *
 * La pantalla de duplicados sólo dejaba decir "no son la misma persona". Cuando
 * sí lo eran, no había nada que hacer: el par volvía a aparecer para siempre.
 *
 * No se borra nada. El que absorbe se queda con los perfiles sociales, los
 * nichos, las etiquetas y las candidaturas del otro; el otro queda ARCHIVADO
 * con una nota que dice en quién se fusionó. Borrar a alguien que participó de
 * campañas destruiría la historia de esas campañas, que es lo que el producto
 * existe para conservar.
 *
 * Lo que no se puede mover se informa en vez de forzarse:
 *  - Un perfil social que el sobreviviente ya tiene (misma red y misma URL).
 *  - Una candidatura en una campaña donde el sobreviviente ya participa. Son
 *    dos participaciones distintas de la misma persona en la misma campaña:
 *    elegir cuál sobrevive no es algo que deba decidir un script.
 */
export type MergeResult = {
  survivorId: string
  movedProfiles: number
  movedCandidacies: number
  /** Candidaturas que quedaron en el archivado porque ya existía una equivalente. */
  conflictedCandidacies: number
  conflictedProfiles: number
}

export async function mergeInfluencers(
  ctx: AuthContext,
  input: { keepId: string; mergeId: string; duplicateId?: string | null },
): Promise<MergeResult> {
  assertAgency(ctx)
  assertCan(ctx, 'influencer.manage', null)
  if (input.keepId === input.mergeId) throw new ValidationError({ clave: 'fusionConsigoMismo' })

  return scoped(ctx, async (tx) => {
    const [sobrevive, absorbido] = await Promise.all([
      tx.influencer.findUnique({ where: { id: input.keepId }, select: { id: true, displayName: true } }),
      tx.influencer.findUnique({ where: { id: input.mergeId }, select: { id: true, displayName: true } }),
    ])
    if (!sobrevive || !absorbido) throw new NotFoundError()

    // Perfiles sociales: se mueven los que el sobreviviente no tenga ya.
    const perfilesDestino = await tx.socialProfile.findMany({
      where: { influencerId: sobrevive.id },
      select: { platform: true, urlNormalized: true },
    })
    const yaTiene = new Set(perfilesDestino.map((p) => `${p.platform}|${p.urlNormalized}`))
    const perfilesOrigen = await tx.socialProfile.findMany({
      where: { influencerId: absorbido.id },
      select: { id: true, platform: true, urlNormalized: true },
    })
    const perfilesAMover = perfilesOrigen.filter((p) => !yaTiene.has(`${p.platform}|${p.urlNormalized}`))
    if (perfilesAMover.length > 0) {
      await tx.socialProfile.updateMany({
        where: { id: { in: perfilesAMover.map((p) => p.id) } },
        // El principal del absorbido deja de serlo: ya hay uno en el destino.
        data: { influencerId: sobrevive.id, isPrimary: false },
      })
    }

    // Candidaturas: se mueven las de campañas donde el sobreviviente no esté.
    const campanasDestino = await tx.candidacy.findMany({
      where: { influencerId: sobrevive.id },
      select: { campaignId: true },
    })
    const yaParticipa = new Set(campanasDestino.map((c) => c.campaignId))
    const candidaturasOrigen = await tx.candidacy.findMany({
      where: { influencerId: absorbido.id },
      select: { id: true, campaignId: true },
    })
    const aMover = candidaturasOrigen.filter((c) => !yaParticipa.has(c.campaignId))
    for (const candidatura of aMover) {
      await tx.candidacy.update({ where: { id: candidatura.id }, data: { influencerId: sobrevive.id } })
    }

    // Nichos y etiquetas: se suman los que falten.
    const [nichosOrigen, nichosDestino] = await Promise.all([
      tx.influencerNiche.findMany({ where: { influencerId: absorbido.id }, select: { nicheId: true } }),
      tx.influencerNiche.findMany({ where: { influencerId: sobrevive.id }, select: { nicheId: true } }),
    ])
    const nichosYa = new Set(nichosDestino.map((n) => n.nicheId))
    for (const nicho of nichosOrigen.filter((n) => !nichosYa.has(n.nicheId))) {
      await tx.influencerNiche.create({ data: { influencerId: sobrevive.id, nicheId: nicho.nicheId } })
    }

    const [etiquetasOrigen, etiquetasDestino] = await Promise.all([
      tx.influencerTag.findMany({ where: { influencerId: absorbido.id }, select: { tagId: true } }),
      tx.influencerTag.findMany({ where: { influencerId: sobrevive.id }, select: { tagId: true } }),
    ])
    const etiquetasYa = new Set(etiquetasDestino.map((t) => t.tagId))
    for (const etiqueta of etiquetasOrigen.filter((t) => !etiquetasYa.has(t.tagId))) {
      await tx.influencerTag.create({ data: { influencerId: sobrevive.id, tagId: etiqueta.tagId } })
    }

    await tx.influencer.update({
      where: { id: absorbido.id },
      data: {
        status: 'ARCHIVED',
        internalNotes: `Fusionado en ${sobrevive.displayName} (${sobrevive.id}) el ${new Date().toISOString()}.`,
      },
    })

    // Cualquier par abierto entre estos dos deja de tener sentido.
    await tx.influencerDuplicate.updateMany({
      where: {
        status: 'OPEN',
        OR: [
          { influencerAId: sobrevive.id, influencerBId: absorbido.id },
          { influencerAId: absorbido.id, influencerBId: sobrevive.id },
          ...(input.duplicateId ? [{ id: input.duplicateId }] : []),
        ],
      },
      data: {
        status: 'MERGED',
        resolvedAt: new Date(),
        resolvedById: ctx.user.id,
        notes: `Fusionado en ${sobrevive.displayName}.`,
      },
    })

    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.INFLUENCER_MERGED,
      entityType: 'Influencer',
      entityId: sobrevive.id,
      before: { archivado: absorbido.displayName, archivadoId: absorbido.id },
      after: {
        perfilesMovidos: perfilesAMover.length,
        candidaturasMovidas: aMover.length,
        candidaturasEnConflicto: candidaturasOrigen.length - aMover.length,
      },
    })

    return {
      survivorId: sobrevive.id,
      movedProfiles: perfilesAMover.length,
      movedCandidacies: aMover.length,
      conflictedCandidacies: candidaturasOrigen.length - aMover.length,
      conflictedProfiles: perfilesOrigen.length - perfilesAMover.length,
    }
  })
}

/**
 * Borra un influencer, de verdad.
 *
 * Existe para lo que la fusión no resuelve: filas basura de una importación --
 * un nombre mal parseado, una fila de encabezado que entró como persona -- que
 * no son duplicado de nadie y sólo ensucian la base.
 *
 * Se niega si participó de alguna campaña, y eso NO es una precaución de más:
 * la base tiene la relación en `Restrict`, así que el borrado fallaría igual,
 * pero con un error de motor en vez de una explicación. Para esos casos está la
 * fusión, que conserva la historia.
 */
export async function deleteInfluencer(ctx: AuthContext, influencerId: string): Promise<{ displayName: string }> {
  assertAgency(ctx)
  assertCan(ctx, 'influencer.manage', null)

  return scoped(ctx, async (tx) => {
    const influencer = await tx.influencer.findUnique({
      where: { id: influencerId },
      select: { id: true, displayName: true, _count: { select: { candidacies: true } } },
    })
    if (!influencer) throw new NotFoundError()

    if (influencer._count.candidacies > 0) {
      throw new ValidationError({
        clave: 'influencerConCampanas',
        valores: { nombre: influencer.displayName, cantidad: influencer._count.candidacies },
      })
    }

    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.INFLUENCER_DELETED,
      entityType: 'Influencer',
      entityId: influencer.id,
      before: { displayName: influencer.displayName },
    })
    await tx.influencer.delete({ where: { id: influencer.id } })
    return { displayName: influencer.displayName }
  })
}

/**
 * Cifras de la base de influencers.
 *
 * Se cuentan en la base, no sobre la página que se está viendo: sumar treinta
 * filas y llamar a eso "total" es la forma más silenciosa de mentir.
 */
export type ResumenDeLaBase = {
  total: number
  /** Coinciden con los filtros aplicados ahora mismo. */
  filtrados: number
  activos: number
  /** Perfiles cuya última medición tiene más de 45 días, o que nunca se midió. */
  sinActualizar: number
  duplicadosAbiertos: number
}

export async function resumenDeLaBase(
  ctx: AuthContext,
  filtrados: number,
): Promise<ResumenDeLaBase> {
  assertAgency(ctx)
  assertCan(ctx, 'influencer.view', null)
  const desactualizadoAntesDe = new Date(Date.now() - STALE_METRIC_DAYS * 24 * 60 * 60 * 1000)

  return scoped(ctx, async (tx) => {
    const [total, activos, sinActualizar, duplicadosAbiertos] = await Promise.all([
      tx.influencer.count(),
      tx.influencer.count({ where: { status: 'ACTIVE' } }),
      tx.socialProfile.count({
        where: { OR: [{ measuredAt: null }, { measuredAt: { lt: desactualizadoAntesDe } }] },
      }),
      tx.influencerDuplicate.count({ where: { status: 'OPEN' } }),
    ])
    return { total, filtrados, activos, sinActualizar, duplicadosAbiertos }
  })
}
