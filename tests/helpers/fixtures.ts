import { randomUUID } from 'node:crypto'
import { Client as PgClient } from 'pg'
import type { AgencyRole, ClientRole } from '@/generated/prisma/enums'
import { withSystemScope } from '@/lib/db/scope'
import { hashPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'
import { buildAuthContext, type AuthContext } from '@/lib/authz/context'
import { CANDIDACY_STATUS_SEED, NICHE_SEED } from '@/lib/domain/statuses'

export const TEST_PASSWORD = 'Prueba.Segura.2026'

/**
 * Vacía la base entre archivos de test.
 *
 * Usa el rol PROPIETARIO a propósito: el rol de aplicación no tiene permiso de
 * TRUNCATE sobre `audit_logs` (la auditoría es inmutable también en la base),
 * así que no podría limpiarla ni queriendo.
 */
export async function resetDatabase(): Promise<void> {
  const url = process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('Falta TEST_MIGRATION_DATABASE_URL para limpiar la base de test')
  const client = new PgClient({ connectionString: url })
  await client.connect()
  try {
    await client.query(`
      TRUNCATE TABLE
        audit_logs, import_row_logs, import_runs, source_references, comments,
        candidacy_status_events, deliverables, candidacies, brief_clusters,
        brief_keywords, brief_niches, campaign_briefs, campaign_documents,
        campaign_links, campaign_assignments, campaigns,
        metric_snapshots, social_profiles, influencer_duplicates,
        influencer_niches, influencer_tags, influencers,
        agency_client_assignments, client_memberships, agency_memberships,
        invitations, password_resets, saved_views, sessions, clients, users,
        rate_limit_counters, email_outbox, niches, tags, candidacy_status_defs
      RESTART IDENTITY CASCADE
    `)
  } finally {
    await client.end()
  }
}

export async function seedCatalogs(): Promise<void> {
  await withSystemScope(async (tx) => {
    for (const [index, niche] of NICHE_SEED.entries()) {
      await tx.niche.upsert({
        where: { key: niche.key },
        create: { key: niche.key, label: niche.label, order: index },
        update: {},
      })
    }
    for (const status of CANDIDACY_STATUS_SEED) {
      await tx.candidacyStatusDef.upsert({ where: { key: status.key }, create: status, update: {} })
    }
  })
}

export async function createClientTenant(name: string): Promise<{ id: string; slug: string }> {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`
  return withSystemScope(async (tx) => {
    const client = await tx.client.create({
      data: { slug, name, defaultCurrency: 'USD', allowClientUserInvites: true, allowClientExports: true },
    })
    return { id: client.id, slug: client.slug }
  })
}

type UserSpec = {
  email?: string
  name?: string
  agencyRole?: AgencyRole
  agencyClientIds?: string[]
  clientMemberships?: Array<{ clientId: string; role: ClientRole; extras?: string[] }>
  status?: 'ACTIVE' | 'DISABLED'
}

export async function createUser(spec: UserSpec): Promise<{ id: string; email: string }> {
  const email = spec.email ?? `u-${randomUUID()}@test.local`
  const passwordHash = await hashPassword(TEST_PASSWORD)
  return withSystemScope(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: spec.name ?? 'Persona de prueba',
        passwordHash,
        passwordSetAt: new Date(),
        status: spec.status ?? 'ACTIVE',
      },
    })
    if (spec.agencyRole) {
      await tx.agencyMembership.create({ data: { userId: user.id, role: spec.agencyRole } })
    }
    for (const clientId of spec.agencyClientIds ?? []) {
      await tx.agencyClientAssignment.create({ data: { userId: user.id, clientId } })
    }
    for (const membership of spec.clientMemberships ?? []) {
      await tx.clientMembership.create({
        data: {
          userId: user.id,
          clientId: membership.clientId,
          role: membership.role,
          extraCapabilities: membership.extras ?? [],
        },
      })
    }
    return { id: user.id, email: user.email }
  })
}

/** Contexto de autorización real: crea una sesión y la resuelve como en producción. */
export async function contextFor(userId: string): Promise<AuthContext> {
  const session = await withSystemScope((tx) =>
    createSession(tx, userId, { ip: '127.0.0.1', userAgent: 'vitest' }),
  )
  const ctx = await buildAuthContext(session.token, { ip: '127.0.0.1', userAgent: 'vitest' })
  if (!ctx) throw new Error('No se pudo construir el contexto de test')
  return ctx
}

export async function createCampaignFor(clientId: string, name: string): Promise<{ id: string; slug: string }> {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 6)}`
  return withSystemScope(async (tx) => {
    const campaign = await tx.campaign.create({
      data: { clientId, slug, name, status: 'SCOUTING', currency: 'USD', budgetEstimated: '10000' },
    })
    return { id: campaign.id, slug: campaign.slug }
  })
}

export async function createInfluencerWithProfile(displayName: string, handle: string): Promise<string> {
  return withSystemScope(async (tx) => {
    const influencer = await tx.influencer.create({
      data: {
        displayName,
        primaryHandle: handle,
        country: 'ARG',
        status: 'ACTIVE',
        internalNotes: 'NOTA INTERNA SECRETA',
        contactEmail: `${handle}@contacto.test`,
      },
    })
    await tx.socialProfile.create({
      data: {
        influencerId: influencer.id,
        platform: 'INSTAGRAM',
        url: `https://www.instagram.com/${handle}`,
        urlNormalized: `instagram.com/${handle}`,
        handle,
        followers: 25_000,
        followersRaw: '25k',
        engagementRate: '3.2',
        measuredAt: new Date(),
        isPrimary: true,
      },
    })
    return influencer.id
  })
}

export async function createCandidacyFor(options: {
  clientId: string
  campaignId: string
  influencerId: string
  clientVisible?: boolean
  statusKey?: string
}): Promise<string> {
  return withSystemScope(async (tx) => {
    const candidacy = await tx.candidacy.create({
      data: {
        clientId: options.clientId,
        campaignId: options.campaignId,
        influencerId: options.influencerId,
        statusKey: options.statusKey ?? 'PROPUESTO',
        clientVisible: options.clientVisible ?? true,
        agencyRationale: 'Encaja con el brief.',
        internalNotes: 'NOTA INTERNA DE CANDIDATURA',
        budgetPrivateNotes: 'MARGEN INTERNO 40%',
        budgetRequested: '1200',
        budgetNegotiated: '900',
        currency: 'USD',
      },
    })
    return candidacy.id
  })
}
