import type { Prisma } from '@/generated/prisma/client'
import type { AuthContext } from '@/lib/authz/context'
import { capabilitiesFor } from '@/lib/authz/context'
import { isMetricStale } from './statuses'

/**
 * Serializadores hacia la interfaz.
 *
 * Regla: los DTO se CONSTRUYEN campo por campo (lista blanca). Nunca se
 * devuelve la fila de Prisma con campos borrados, porque un campo nuevo en el
 * modelo se filtraría solo. Si un campo interno no está permitido, la clave
 * directamente no existe en el objeto.
 */

export type FieldPermissions = {
  canViewInternalNotes: boolean
  canViewBudget: boolean
  canViewContact: boolean
}

export function fieldPermissionsFor(ctx: AuthContext, clientId: string | null): FieldPermissions {
  const caps = capabilitiesFor(ctx, clientId)
  return {
    canViewInternalNotes: caps.has('internal_notes.view'),
    canViewBudget: caps.has('budget.view'),
    canViewContact: caps.has('influencer.contact.view'),
  }
}

const toNumber = (value: Prisma.Decimal | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value)

// ── Perfiles sociales ────────────────────────────────────────────────────────

export type SocialProfileDto = {
  id: string
  platform: string
  url: string
  handle: string | null
  followers: number | null
  followersRaw: string | null
  followersUnparsed: boolean
  engagementRate: number | null
  engagementRaw: string | null
  avgViews: number | null
  audienceLocalPercent: number | null
  metricSource: string | null
  metricSourceUrl: string | null
  measuredAt: string | null
  verificationStatus: string
  isPrimary: boolean
  stale: boolean
}

type SocialProfileRow = {
  id: string
  platform: string
  url: string
  handle: string | null
  followers: number | null
  followersRaw: string | null
  followersUnparsed: boolean
  engagementRate: Prisma.Decimal | null
  engagementRaw: string | null
  avgViews: number | null
  audienceLocalPercent: Prisma.Decimal | null
  metricSource: string | null
  metricSourceUrl: string | null
  measuredAt: Date | null
  verificationStatus: string
  isPrimary: boolean
}

export function toSocialProfileDto(row: SocialProfileRow, now = new Date()): SocialProfileDto {
  return {
    id: row.id,
    platform: row.platform,
    url: row.url,
    handle: row.handle,
    followers: row.followers,
    followersRaw: row.followersRaw,
    followersUnparsed: row.followersUnparsed,
    engagementRate: toNumber(row.engagementRate),
    engagementRaw: row.engagementRaw,
    avgViews: row.avgViews,
    audienceLocalPercent: toNumber(row.audienceLocalPercent),
    metricSource: row.metricSource,
    metricSourceUrl: row.metricSourceUrl,
    measuredAt: row.measuredAt ? row.measuredAt.toISOString() : null,
    verificationStatus: row.verificationStatus,
    isPrimary: row.isPrimary,
    stale: isMetricStale(row.measuredAt, now),
  }
}

// ── Influencer ───────────────────────────────────────────────────────────────

export type InfluencerDto = {
  id: string
  displayName: string
  realName: string | null
  primaryHandle: string | null
  country: string | null
  city: string | null
  language: string | null
  bio: string | null
  status: string
  adultStatus: string
  representative: string | null
  niches: string[]
  tags: string[]
  profiles: SocialProfileDto[]
  version: number
  /** Sólo con `internal_notes.view`. */
  internalNotes?: string | null
  /** Sólo con `influencer.contact.view`. */
  contact?: { email: string | null; phone: string | null; notes: string | null; legalBasis: string | null }
}

type InfluencerRow = {
  id: string
  displayName: string
  realName: string | null
  primaryHandle: string | null
  country: string | null
  city: string | null
  language: string | null
  bio: string | null
  status: string
  adultStatus: string
  representative: string | null
  internalNotes: string | null
  contactEmail: string | null
  contactPhone: string | null
  contactNotes: string | null
  contactLegalBasis: string | null
  version: number
  profiles?: SocialProfileRow[]
  niches?: { niche: { label: string } }[]
  tags?: { tag: { label: string } }[]
}

export function toInfluencerDto(row: InfluencerRow, perms: FieldPermissions, now = new Date()): InfluencerDto {
  const dto: InfluencerDto = {
    id: row.id,
    displayName: row.displayName,
    realName: row.realName,
    primaryHandle: row.primaryHandle,
    country: row.country,
    city: row.city,
    language: row.language,
    bio: row.bio,
    status: row.status,
    adultStatus: row.adultStatus,
    representative: row.representative,
    niches: (row.niches ?? []).map((n) => n.niche.label),
    tags: (row.tags ?? []).map((t) => t.tag.label),
    profiles: (row.profiles ?? []).map((p) => toSocialProfileDto(p, now)),
    version: row.version,
  }
  if (perms.canViewInternalNotes) dto.internalNotes = row.internalNotes
  if (perms.canViewContact) {
    dto.contact = {
      email: row.contactEmail,
      phone: row.contactPhone,
      notes: row.contactNotes,
      legalBasis: row.contactLegalBasis,
    }
  }
  return dto
}

// ── Candidatura ──────────────────────────────────────────────────────────────

export type CandidacyDto = {
  id: string
  campaignId: string
  clientId: string
  influencer: InfluencerDto
  clusterId: string | null
  clusterLabel: string | null
  rank: number | null
  statusKey: string
  fitScore: number | null
  agencyRationale: string | null
  contentIdea: string | null
  deliverablesSummary: string | null
  counts: { stories: number; reels: number; posts: number; tiktoks: number; videos: number }
  availability: string
  contactStatus: string
  negotiationStatus: string
  clientApproval: string
  clientApprovalAt: string | null
  inShortlist: boolean
  shortlistOrder: number | null
  clientVisible: boolean
  rejectionReason: string | null
  ownerUserId: string | null
  proposedAt: string | null
  contactedAt: string | null
  confirmedAt: string | null
  publishedAt: string | null
  closedAt: string | null
  version: number
  updatedAt: string
  /** Sólo con `budget.view`. */
  budget?: {
    currency: string
    requested: number | null
    negotiated: number | null
    cache: number | null
    barterDescription: string | null
    privateNotes: string | null
  }
  /** Sólo con `internal_notes.view`. */
  internalNotes?: string | null
}

type CandidacyRow = {
  id: string
  campaignId: string
  clientId: string
  clusterId: string | null
  rank: number | null
  statusKey: string
  fitScore: number | null
  agencyRationale: string | null
  contentIdea: string | null
  deliverablesSummary: string | null
  storiesCount: number
  reelsCount: number
  postsCount: number
  tiktoksCount: number
  videosCount: number
  currency: string
  budgetRequested: Prisma.Decimal | null
  budgetNegotiated: Prisma.Decimal | null
  cacheAmount: Prisma.Decimal | null
  barterDescription: string | null
  budgetPrivateNotes: string | null
  availability: string
  contactStatus: string
  negotiationStatus: string
  clientApproval: string
  clientApprovalAt: Date | null
  inShortlist: boolean
  shortlistOrder: number | null
  clientVisible: boolean
  rejectionReason: string | null
  internalNotes: string | null
  ownerUserId: string | null
  proposedAt: Date | null
  contactedAt: Date | null
  confirmedAt: Date | null
  publishedAt: Date | null
  closedAt: Date | null
  version: number
  updatedAt: Date
  influencer: InfluencerRow
  cluster?: { label: string } | null
}

export function toCandidacyDto(row: CandidacyRow, perms: FieldPermissions, now = new Date()): CandidacyDto {
  const dto: CandidacyDto = {
    id: row.id,
    campaignId: row.campaignId,
    clientId: row.clientId,
    influencer: toInfluencerDto(row.influencer, perms, now),
    clusterId: row.clusterId,
    clusterLabel: row.cluster?.label ?? null,
    rank: row.rank,
    statusKey: row.statusKey,
    fitScore: row.fitScore,
    agencyRationale: row.agencyRationale,
    contentIdea: row.contentIdea,
    deliverablesSummary: row.deliverablesSummary,
    counts: {
      stories: row.storiesCount,
      reels: row.reelsCount,
      posts: row.postsCount,
      tiktoks: row.tiktoksCount,
      videos: row.videosCount,
    },
    availability: row.availability,
    contactStatus: row.contactStatus,
    negotiationStatus: row.negotiationStatus,
    clientApproval: row.clientApproval,
    clientApprovalAt: row.clientApprovalAt ? row.clientApprovalAt.toISOString() : null,
    inShortlist: row.inShortlist,
    shortlistOrder: row.shortlistOrder,
    clientVisible: row.clientVisible,
    rejectionReason: row.rejectionReason,
    ownerUserId: row.ownerUserId,
    proposedAt: row.proposedAt ? row.proposedAt.toISOString() : null,
    contactedAt: row.contactedAt ? row.contactedAt.toISOString() : null,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  }
  if (perms.canViewBudget) {
    dto.budget = {
      currency: row.currency,
      requested: toNumber(row.budgetRequested),
      negotiated: toNumber(row.budgetNegotiated),
      cache: toNumber(row.cacheAmount),
      barterDescription: row.barterDescription,
      privateNotes: row.budgetPrivateNotes,
    }
  }
  if (perms.canViewInternalNotes) dto.internalNotes = row.internalNotes
  return dto
}

// ── Comentarios ──────────────────────────────────────────────────────────────

export type CommentDto = {
  id: string
  visibility: string
  authorSide: string
  authorName: string | null
  body: string
  createdAt: string
  candidacyId: string | null
  campaignId: string | null
}

type CommentRow = {
  id: string
  visibility: string
  authorSide: string
  body: string
  createdAt: Date
  candidacyId: string | null
  campaignId: string | null
  author: { name: string } | null
}

/**
 * Visibilidades que cada lado puede leer. Se aplica también en la consulta SQL;
 * esto es el segundo filtro, por si alguien arma un `where` incompleto.
 */
export function visibleCommentFilter(perms: FieldPermissions, side: 'AGENCY' | 'CLIENT'): string[] {
  if (side === 'CLIENT') return ['CLIENT_VISIBLE', 'CLIENT_AUTHORED']
  const allowed = ['CLIENT_VISIBLE', 'CLIENT_AUTHORED']
  if (perms.canViewInternalNotes) allowed.push('INTERNAL')
  if (perms.canViewBudget) allowed.push('BUDGET_PRIVATE')
  return allowed
}

export function toCommentDto(row: CommentRow): CommentDto {
  return {
    id: row.id,
    visibility: row.visibility,
    authorSide: row.authorSide,
    authorName: row.author?.name ?? null,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    candidacyId: row.candidacyId,
    campaignId: row.campaignId,
  }
}

// ── Campaña ──────────────────────────────────────────────────────────────────

export type CampaignDto = {
  id: string
  clientId: string
  slug: string
  name: string
  description: string | null
  objective: string | null
  status: string
  countries: string[]
  platforms: string[]
  startDate: string | null
  endDate: string | null
  currency: string
  version: number
  /** Cuándo se archivó. Nulo = a la vista. */
  archivedAt: string | null
  /** Sólo con `budget.view`. */
  budget?: { estimated: number | null; cache: number | null; barterDescription: string | null }
}

type CampaignRow = {
  id: string
  clientId: string
  slug: string
  name: string
  description: string | null
  objective: string | null
  status: string
  countries: string[]
  platforms: string[]
  startDate: Date | null
  endDate: Date | null
  currency: string
  archivedAt: Date | null
  budgetEstimated: Prisma.Decimal | null
  budgetCache: Prisma.Decimal | null
  barterDescription: string | null
  version: number
}

export function toCampaignDto(row: CampaignRow, perms: FieldPermissions): CampaignDto {
  const dto: CampaignDto = {
    id: row.id,
    clientId: row.clientId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    objective: row.objective,
    status: row.status,
    countries: row.countries,
    platforms: row.platforms,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    endDate: row.endDate ? row.endDate.toISOString() : null,
    currency: row.currency,
    version: row.version,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  }
  if (perms.canViewBudget) {
    dto.budget = {
      estimated: toNumber(row.budgetEstimated),
      cache: toNumber(row.budgetCache),
      barterDescription: row.barterDescription,
    }
  }
  return dto
}
