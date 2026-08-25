/**
 * Datos de demostración FICTICIOS.
 *
 * Los influencers reales NO viven acá: entran por el importador leyendo el
 * `.xlsx` de verdad (`npm run import:excel`). Este seed sólo crea catálogos,
 * usuarios de prueba y dos tenants de ejemplo para poder recorrer el producto.
 *
 * Es idempotente: correrlo dos veces no duplica nada.
 */
import '../src/lib/bootstrap-env'
import { withSystemScope, type Tx } from '../src/lib/db/scope'
import { hashPassword } from '../src/lib/auth/password'
import { CANDIDACY_STATUS_SEED, NICHE_SEED } from '../src/lib/domain/statuses'
import type { AgencyRole, ClientRole } from '../src/generated/prisma/enums'

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo.2026!seguro'

type AgencyUserSeed = { email: string; name: string; role: AgencyRole; clientSlugs: string[] }
type ClientUserSeed = { email: string; name: string; clientSlug: string; role: ClientRole; extras?: string[] }

const AGENCY_USERS: AgencyUserSeed[] = [
  { email: 'superadmin@jcmarketing.digital', name: 'Superadmin Plataforma', role: 'PLATFORM_SUPERADMIN', clientSlugs: [] },
  { email: 'admin@jcmarketing.digital', name: 'Ana Duarte', role: 'AGENCY_ADMIN', clientSlugs: [] },
  { email: 'account@jcmarketing.digital', name: 'Bruno Salas', role: 'ACCOUNT_MANAGER', clientSlugs: ['nordika-pay'] },
  { email: 'scout@jcmarketing.digital', name: 'Carla Ibáñez', role: 'SCOUT', clientSlugs: ['nordika-pay', 'aurora-retail'] },
  { email: 'finanzas@jcmarketing.digital', name: 'Diego Rossi', role: 'FINANCE', clientSlugs: ['nordika-pay', 'aurora-retail'] },
]

const CLIENT_USERS: ClientUserSeed[] = [
  { email: 'admin@nordika.demo', name: 'Elena Ferrer', clientSlug: 'nordika-pay', role: 'CLIENT_ADMIN' },
  { email: 'revisor@nordika.demo', name: 'Franco Beltrán', clientSlug: 'nordika-pay', role: 'CLIENT_REVIEWER' },
  { email: 'lector@nordika.demo', name: 'Gabi Núñez', clientSlug: 'nordika-pay', role: 'CLIENT_VIEWER' },
  { email: 'admin@aurora.demo', name: 'Hugo Prieto', clientSlug: 'aurora-retail', role: 'CLIENT_ADMIN' },
  { email: 'revisor@aurora.demo', name: 'Inés Cardozo', clientSlug: 'aurora-retail', role: 'CLIENT_REVIEWER' },
]

const CLIENTS = [
  {
    slug: 'nordika-pay',
    name: 'Nordika Pay',
    legalName: 'Nordika Pay S.A. (demo)',
    country: 'ARG',
    markets: ['ARG', 'LATAM'],
    description: 'Fintech ficticia de pagos internacionales. Cliente de demostración.',
    defaultCurrency: 'USD',
    allowClientUserInvites: true,
    allowClientExports: true,
  },
  {
    slug: 'aurora-retail',
    name: 'Aurora Retail',
    legalName: 'Aurora Retail SRL (demo)',
    country: 'ARG',
    markets: ['ARG'],
    description: 'Retail ficticio de indumentaria. Cliente de demostración.',
    defaultCurrency: 'ARS',
    allowClientUserInvites: false,
    allowClientExports: false,
  },
]

const DEMO_INFLUENCERS = [
  {
    displayName: 'Valentina Ruiz (demo)',
    country: 'ARG',
    city: 'Buenos Aires',
    language: 'es',
    niches: ['finanzas', 'criptomonedas'],
    bio: 'Perfil ficticio de educación financiera. Datos inventados para demo.',
    profile: { platform: 'INSTAGRAM' as const, handle: 'valen.demo', followers: 31600, raw: '31,6k', er: 1.5 },
  },
  {
    displayName: 'Bruno Pereyra (demo)',
    country: 'ARG',
    city: 'Rosario',
    language: 'es',
    niches: ['viajes', 'lifestyle'],
    bio: 'Perfil ficticio de viajes. Datos inventados para demo.',
    profile: { platform: 'TIKTOK' as const, handle: 'bruno.demo', followers: 24500, raw: '24,5k', er: 3.1 },
  },
  {
    displayName: 'Sol Miranda (demo)',
    country: 'ARG',
    city: 'Córdoba',
    language: 'es',
    niches: ['freelance', 'marketing'],
    bio: 'Perfil ficticio de trabajo remoto. Datos inventados para demo.',
    profile: { platform: 'INSTAGRAM' as const, handle: 'sol.demo', followers: 10200, raw: '10,2k', er: 4.0 },
  },
  {
    displayName: 'Tomás Aguirre (demo)',
    country: 'ARG',
    city: 'Mendoza',
    language: 'es',
    niches: ['tech', 'ia'],
    bio: 'Perfil ficticio de tecnología. Datos inventados para demo.',
    profile: { platform: 'YOUTUBE' as const, handle: 'tomas.demo', followers: 82000, raw: '82k', er: 0.9 },
  },
  {
    displayName: 'Lucía Bravo (demo)',
    country: 'ARG',
    city: 'La Plata',
    language: 'es',
    niches: ['business', 'inversion'],
    bio: 'Perfil ficticio de negocios. Datos inventados para demo.',
    profile: { platform: 'INSTAGRAM' as const, handle: 'lucia.demo', followers: 148000, raw: '148k', er: 0.6 },
  },
]

const CLUSTERS = [
  { key: 'crypto-web3', label: 'Crypto / Web3', emoji: '🪙', targetPercent: 35, order: 1 },
  { key: 'fintech', label: 'Fintech / Finanzas personales', emoji: '💳', targetPercent: 25, order: 2 },
  { key: 'travel', label: 'Viajes', emoji: '✈️', targetPercent: 20, order: 3 },
  { key: 'freelance', label: 'Freelancers / Trabajo remoto', emoji: '💻', targetPercent: 15, order: 4 },
  { key: 'tech-lifestyle', label: 'Tech / Lifestyle', emoji: '🚀', targetPercent: 5, order: 5 },
]

async function seedCatalogs(tx: Tx): Promise<void> {
  for (const [index, niche] of NICHE_SEED.entries()) {
    await tx.niche.upsert({
      where: { key: niche.key },
      create: { key: niche.key, label: niche.label, order: index },
      update: { label: niche.label, order: index },
    })
  }
  for (const status of CANDIDACY_STATUS_SEED) {
    await tx.candidacyStatusDef.upsert({
      where: { key: status.key },
      create: status,
      update: {
        label: status.label,
        category: status.category,
        color: status.color,
        order: status.order,
        clientVisible: status.clientVisible,
        isTerminal: status.isTerminal,
      },
    })
  }
  for (const tag of [
    { key: 'prioritario', label: 'Prioritario', color: 'emerald' },
    { key: 'auditar-engagement', label: 'Auditar engagement', color: 'amber' },
    { key: 'trabajo-previo', label: 'Trabajó con nosotros', color: 'blue' },
    { key: 'excepcion-rango', label: 'Excepción al rango', color: 'violet' },
  ]) {
    await tx.tag.upsert({ where: { key: tag.key }, create: tag, update: { label: tag.label, color: tag.color } })
  }
}

async function main(): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  await withSystemScope(
    async (tx) => {
      await seedCatalogs(tx)

      // ── Clientes ──
      const clientIds = new Map<string, string>()
      for (const client of CLIENTS) {
        const row = await tx.client.upsert({
          where: { slug: client.slug },
          create: client,
          update: { name: client.name, description: client.description },
        })
        clientIds.set(client.slug, row.id)
      }

      // ── Usuarios de agencia ──
      for (const seed of AGENCY_USERS) {
        const user = await tx.user.upsert({
          where: { email: seed.email },
          create: { email: seed.email, name: seed.name, passwordHash, passwordSetAt: new Date() },
          update: { name: seed.name },
        })
        await tx.agencyMembership.upsert({
          where: { userId: user.id },
          create: { userId: user.id, role: seed.role },
          update: { role: seed.role },
        })
        for (const slug of seed.clientSlugs) {
          const clientId = clientIds.get(slug)
          if (!clientId) continue
          await tx.agencyClientAssignment.upsert({
            where: { userId_clientId: { userId: user.id, clientId } },
            create: { userId: user.id, clientId },
            update: {},
          })
        }
      }

      // ── Usuarios de cliente ──
      for (const seed of CLIENT_USERS) {
        const clientId = clientIds.get(seed.clientSlug)
        if (!clientId) continue
        const user = await tx.user.upsert({
          where: { email: seed.email },
          create: { email: seed.email, name: seed.name, passwordHash, passwordSetAt: new Date() },
          update: { name: seed.name },
        })
        await tx.clientMembership.upsert({
          where: { userId_clientId: { userId: user.id, clientId } },
          create: { userId: user.id, clientId, role: seed.role, extraCapabilities: seed.extras ?? [] },
          update: { role: seed.role, extraCapabilities: seed.extras ?? [] },
        })
      }

      // ── Usuario desactivado (para probar la revocación de acceso) ──
      const disabled = await tx.user.upsert({
        where: { email: 'desactivado@nordika.demo' },
        create: {
          email: 'desactivado@nordika.demo',
          name: 'Usuario Desactivado',
          passwordHash,
          passwordSetAt: new Date(),
          status: 'DISABLED',
          disabledAt: new Date(),
        },
        update: { status: 'DISABLED' },
      })
      const nordikaId = clientIds.get('nordika-pay')
      if (nordikaId) {
        await tx.clientMembership.upsert({
          where: { userId_clientId: { userId: disabled.id, clientId: nordikaId } },
          create: { userId: disabled.id, clientId: nordikaId, role: 'CLIENT_REVIEWER' },
          update: {},
        })
      }

      // ── Campaña de demostración con brief y clusters ──
      if (!nordikaId) throw new Error('No se pudo crear el cliente de demo')
      const campaign = await tx.campaign.upsert({
        where: { clientId_slug: { clientId: nordikaId, slug: 'lanzamiento-tarjeta-global' } },
        create: {
          clientId: nordikaId,
          slug: 'lanzamiento-tarjeta-global',
          name: 'Lanzamiento tarjeta global',
          description: 'Campaña ficticia de demostración.',
          objective: 'Awareness y adquisición entre 25 y 45 años en Argentina.',
          status: 'SCOUTING',
          countries: ['ARG'],
          platforms: ['INSTAGRAM', 'TIKTOK'],
          currency: 'USD',
          budgetEstimated: '12000',
          budgetCache: '10000',
          barterDescription: 'Sin canje',
          startDate: new Date('2026-09-01T00:00:00Z'),
          endDate: new Date('2026-10-31T00:00:00Z'),
        },
        update: {},
      })

      const brief = await tx.campaignBrief.upsert({
        where: { campaignId: campaign.id },
        create: {
          campaignId: campaign.id,
          clientId: nordikaId,
          country: 'ARG',
          language: 'es',
          followersMin: 10_000,
          followersMax: 50_000,
          engagementRateMin: '3',
          audienceAgeMin: 25,
          audienceAgeMax: 45,
          audienceGeoPredominance: 'ARG',
          audienceGeoMinPercent: 60,
          platforms: ['INSTAGRAM', 'TIKTOK'],
          idealProfile: 'Creadores que puedan mostrar un uso real del producto en su vida cotidiana.',
          contentIdeas: 'Experiencia de uso real, comparativas honestas, tutoriales cortos.',
          realProductUses: 'Pagos en el exterior, cobros del exterior, gastos cotidianos.',
          inclusionCriteria: 'Audiencia mayoritariamente argentina. Credibilidad para recomendar productos financieros.',
          exclusionCriteria: 'Perfiles especulativos, cuentas con más del 40% de contenido patrocinado.',
          internalNotes: 'NOTA INTERNA DE DEMO: no debe verse desde el portal del cliente.',
        },
        update: {},
      })

      for (const cluster of CLUSTERS) {
        await tx.briefCluster.upsert({
          where: { briefId_key: { briefId: brief.id, key: cluster.key } },
          create: { ...cluster, briefId: brief.id, clientId: nordikaId },
          update: { label: cluster.label, targetPercent: cluster.targetPercent, order: cluster.order },
        })
      }
      const clusters = await tx.briefCluster.findMany({ where: { briefId: brief.id }, orderBy: { order: 'asc' } })

      for (const [category, terms] of Object.entries({
        CRYPTO: ['crypto', 'stablecoins', 'web3'],
        FINTECH: ['finanzas personales', 'dólar', 'apps financieras'],
        TRAVEL: ['viajes', 'nomadismo digital'],
        WORK: ['freelance', 'trabajo remoto', 'cobrar en dólares'],
      })) {
        for (const [index, term] of terms.entries()) {
          await tx.briefKeyword.upsert({
            where: { briefId_category_term: { briefId: brief.id, category, term } },
            create: { briefId: brief.id, clientId: nordikaId, category, term, order: index },
            update: {},
          })
        }
      }

      // ── Influencers de demo + candidaturas ──
      const niches = await tx.niche.findMany()
      const nicheByKey = new Map(niches.map((n) => [n.key, n.id]))
      const statusKeys = ['PROPUESTO', 'A_REVISAR', 'APROBADO', 'EN_SCREENING', 'CONTACTAR']

      for (const [index, seed] of DEMO_INFLUENCERS.entries()) {
        const urlNormalized = `${seed.profile.platform.toLowerCase()}.demo/${seed.profile.handle}`
        const existing = await tx.socialProfile.findFirst({ where: { urlNormalized } })
        let influencerId = existing?.influencerId ?? null

        if (!influencerId) {
          const influencer = await tx.influencer.create({
            data: {
              displayName: seed.displayName,
              primaryHandle: seed.profile.handle,
              country: seed.country,
              city: seed.city,
              language: seed.language,
              bio: seed.bio,
              status: 'ACTIVE',
              adultStatus: 'CONFIRMED',
              internalNotes: 'NOTA INTERNA DE DEMO: sólo visible para la agencia.',
              contactEmail: `contacto+${seed.profile.handle}@ejemplo.test`,
              contactLegalBasis: 'Interés legítimo declarado por la agencia (dato ficticio).',
            },
          })
          influencerId = influencer.id
          const profile = await tx.socialProfile.create({
            data: {
              influencerId,
              platform: seed.profile.platform,
              url: `https://www.${seed.profile.platform.toLowerCase()}.demo/${seed.profile.handle}`,
              urlNormalized,
              handle: seed.profile.handle,
              followers: seed.profile.followers,
              followersRaw: seed.profile.raw,
              engagementRate: String(seed.profile.er),
              engagementRaw: `${seed.profile.er}%`,
              metricSource: 'Seed de demostración',
              measuredAt: new Date(),
              isPrimary: true,
              verificationStatus: 'UNVERIFIED',
            },
          })
          await tx.metricSnapshot.create({
            data: {
              socialProfileId: profile.id,
              followers: seed.profile.followers,
              followersRaw: seed.profile.raw,
              engagementRate: String(seed.profile.er),
              source: 'Seed de demostración',
            },
          })
          for (const key of seed.niches) {
            const nicheId = nicheByKey.get(key)
            if (nicheId) {
              await tx.influencerNiche.upsert({
                where: { influencerId_nicheId: { influencerId, nicheId } },
                create: { influencerId, nicheId },
                update: {},
              })
            }
          }
        }

        const cluster = clusters[index % clusters.length]
        const statusKey = statusKeys[index % statusKeys.length] ?? 'NUEVO'
        await tx.candidacy.upsert({
          where: { campaignId_influencerId: { campaignId: campaign.id, influencerId } },
          create: {
            clientId: nordikaId,
            campaignId: campaign.id,
            influencerId,
            clusterId: cluster?.id ?? null,
            rank: index + 1,
            statusKey,
            fitScore: 5 - (index % 3),
            agencyRationale: 'Justificación de demostración: encaja con el cluster y el rango de seguidores del brief.',
            contentIdea: 'Idea de contenido de demostración.',
            currency: 'USD',
            budgetRequested: String(800 + index * 150),
            budgetNegotiated: index % 2 === 0 ? String(700 + index * 120) : null,
            budgetPrivateNotes: 'OBSERVACIÓN PRIVADA DE PRESUPUESTO (demo): no visible sin budget.view.',
            internalNotes: 'NOTA INTERNA DE CANDIDATURA (demo): no debe salir al cliente.',
            clientVisible: statusKey !== 'EN_SCREENING',
            inShortlist: index < 3,
            shortlistOrder: index < 3 ? index + 1 : null,
            clientApproval: statusKey === 'APROBADO' ? 'APPROVED' : 'PENDING',
            proposedAt: statusKey === 'EN_SCREENING' ? null : new Date(),
          },
          update: {},
        })
      }

      const candidacies = await tx.candidacy.findMany({ where: { campaignId: campaign.id }, take: 2 })
      const agencyUser = await tx.user.findUnique({ where: { email: 'account@jcmarketing.digital' } })
      const clientUser = await tx.user.findUnique({ where: { email: 'revisor@nordika.demo' } })
      for (const candidacy of candidacies) {
        const already = await tx.comment.findFirst({ where: { candidacyId: candidacy.id } })
        if (already) continue
        await tx.comment.create({
          data: {
            clientId: nordikaId,
            campaignId: campaign.id,
            candidacyId: candidacy.id,
            authorUserId: agencyUser?.id ?? null,
            authorSide: 'AGENCY',
            visibility: 'INTERNAL',
            body: 'NOTA INTERNA (demo): revisar autenticidad del engagement antes de avanzar.',
          },
        })
        await tx.comment.create({
          data: {
            clientId: nordikaId,
            campaignId: campaign.id,
            candidacyId: candidacy.id,
            authorUserId: agencyUser?.id ?? null,
            authorSide: 'AGENCY',
            visibility: 'CLIENT_VISIBLE',
            body: 'Este perfil encaja con el cluster principal del brief.',
          },
        })
        await tx.comment.create({
          data: {
            clientId: nordikaId,
            campaignId: campaign.id,
            candidacyId: candidacy.id,
            authorUserId: clientUser?.id ?? null,
            authorSide: 'CLIENT',
            visibility: 'CLIENT_AUTHORED',
            body: '¿Puede mostrar un uso cotidiano del producto?',
          },
        })
      }

      // ── Campaña del segundo tenant, para probar aislamiento ──
      const auroraId = clientIds.get('aurora-retail')
      if (auroraId) {
        await tx.campaign.upsert({
          where: { clientId_slug: { clientId: auroraId, slug: 'temporada-primavera' } },
          create: {
            clientId: auroraId,
            slug: 'temporada-primavera',
            name: 'Temporada primavera',
            description: 'Campaña ficticia del segundo tenant.',
            status: 'BRIEFING',
            countries: ['ARG'],
            platforms: ['INSTAGRAM'],
            currency: 'ARS',
          },
          update: {},
        })
      }
    },
    { timeoutMs: 120_000, maxWaitMs: 30_000 },
  )

  console.info('Seed listo.')
  console.info(`Contraseña de todos los usuarios de demo: ${DEMO_PASSWORD}`)
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
