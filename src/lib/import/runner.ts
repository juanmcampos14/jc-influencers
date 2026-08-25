import 'server-only'
import { createHash } from 'node:crypto'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { NotFoundError, ValidationError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import { consumeRateLimit } from '@/lib/auth/rate-limit'
import { fileStorage } from '@/lib/ports/storage'
import { cleanText, nameSimilarity, normalizeHandle, parseProfileUrl, slugify } from '@/lib/domain/normalize'
import { detectDuplicates } from '@/lib/repos/influencers'
import { actorOf, scoped, type Tx } from '@/lib/repos/base'
import { parseWorkbook, type ParsedPerson, type ParsedWorkbook } from './excel'

const IMPORT_TIMEOUT_MS = 300_000

export type ImportSummary = {
  importRunId: string
  filename: string
  fileHash: string
  sheets: ParsedWorkbook['sheetsSeen']
  decisions: string[]
  counts: {
    totalRows: number
    newInfluencers: number
    existingInfluencers: number
    possibleDuplicates: number
    incompleteRows: number
    unparseableValues: number
    sectionRows: number
    multiPersonRows: number
    conflictRows: number
    campaigns: number
    shortlist: number
  }
  duplicates: Array<{ sheetName: string; rowNumber: number; name: string; reason: string; existingName: string | null }>
  issues: Array<{ sheetName: string; rowNumber: number; outcome: string; message: string }>
  campaigns: Array<{ key: string; name: string; people: number }>
  brief: {
    followersMin: number | null
    followersMax: number | null
    engagementRateMin: number | null
    clusters: Array<{ label: string; targetPercent: number }>
    keywords: number
    niches: number
  }
}

/**
 * Busca a qué influencer existente corresponde una fila.
 *
 * Regla: la MISMA URL con un nombre claramente distinto NO se fusiona. En el
 * Excel real eso suele ser un error de copiado (dos personas con el link de
 * una sola), y fusionarlas destruiría el dato. Se crea un registro aparte y el
 * par queda marcado como posible duplicado para que una persona decida.
 */
const SAME_PERSON_THRESHOLD = 0.6

async function resolveExistingInfluencer(tx: Tx, person: ParsedPerson): Promise<{ id: string; displayName: string } | null> {
  const name = cleanText(person.displayName)

  for (const profile of person.profiles) {
    const parsed = parseProfileUrl(profile.url)
    if (parsed.kind !== 'value') continue
    const matches = await tx.socialProfile.findMany({
      where: { platform: parsed.value.platform, urlNormalized: parsed.value.urlNormalized },
      select: { influencer: { select: { id: true, displayName: true } } },
      take: 20,
    })
    let best: { id: string; displayName: string; score: number } | null = null
    for (const match of matches) {
      const score = nameSimilarity(name, match.influencer.displayName)
      if (!best || score > best.score) best = { ...match.influencer, score }
    }
    if (best && best.score >= SAME_PERSON_THRESHOLD) return { id: best.id, displayName: best.displayName }
  }

  if (!name) return null
  const byName = await tx.influencer.findFirst({
    where: { displayName: { equals: name, mode: 'insensitive' } },
    select: { id: true, displayName: true },
  })
  return byName
}

/** Posibles duplicados dentro del propio archivo y contra la base. */
async function findPossibleDuplicate(
  tx: Tx,
  person: ParsedPerson,
  seen: Map<string, ParsedPerson>,
): Promise<{ reason: string; existingName: string | null } | null> {
  for (const profile of person.profiles) {
    const parsed = parseProfileUrl(profile.url)
    if (parsed.kind !== 'value') continue
    const key = `url:${parsed.value.urlNormalized}`
    const earlier = seen.get(key)
    if (earlier && cleanText(earlier.displayName).toLowerCase() !== cleanText(person.displayName).toLowerCase()) {
      return {
        reason: `Misma URL que "${earlier.displayName}" (hoja ${earlier.sheetName}, fila ${earlier.rowNumber}) con otro nombre.`,
        existingName: earlier.displayName,
      }
    }
    if (parsed.value.handle) {
      const handleKey = `handle:${parsed.value.platform}:${parsed.value.handle}`
      const earlierHandle = seen.get(handleKey)
      if (
        earlierHandle &&
        cleanText(earlierHandle.displayName).toLowerCase() !== cleanText(person.displayName).toLowerCase()
      ) {
        return {
          reason: `Mismo handle @${parsed.value.handle} que "${earlierHandle.displayName}" (hoja ${earlierHandle.sheetName}, fila ${earlierHandle.rowNumber}).`,
          existingName: earlierHandle.displayName,
        }
      }
    }
  }

  for (const [key, earlier] of seen) {
    if (!key.startsWith('name:')) continue
    if (earlier.importKey === person.importKey) continue
    const score = nameSimilarity(earlier.displayName, person.displayName)
    if (score >= 0.88 && score < 1) {
      return {
        reason: `Nombre muy parecido a "${earlier.displayName}" (${Math.round(score * 100)}%, hoja ${earlier.sheetName} fila ${earlier.rowNumber}).`,
        existingName: earlier.displayName,
      }
    }
  }

  return null
}

function registerSeen(seen: Map<string, ParsedPerson>, person: ParsedPerson): void {
  seen.set(`name:${cleanText(person.displayName).toLowerCase()}`, person)
  for (const profile of person.profiles) {
    const parsed = parseProfileUrl(profile.url)
    if (parsed.kind !== 'value') continue
    seen.set(`url:${parsed.value.urlNormalized}`, person)
    if (parsed.value.handle) seen.set(`handle:${parsed.value.platform}:${parsed.value.handle}`, person)
  }
}

/**
 * Fase 1: leer el archivo y construir el reporte previo.
 * No escribe ninguna entidad de negocio; sólo el registro de importación.
 */
export async function previewImport(
  ctx: AuthContext,
  input: { clientId: string; filename: string; data: Buffer },
): Promise<ImportSummary> {
  assertClientInScope(ctx, input.clientId)
  assertCan(ctx, 'import.run', input.clientId)
  await consumeRateLimit('importRun', ctx.user.id)

  const parsed = await parseWorkbook(input.data)
  const fileHash = createHash('sha256').update(input.data).digest('hex')

  const stored = await fileStorage().put({
    filename: input.filename,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    data: input.data,
    prefix: `imports/${input.clientId}`,
    clientId: input.clientId,
  })

  return scoped(
    ctx,
    async (tx) => {
      const run = await tx.importRun.create({
        data: {
          clientId: input.clientId,
          filename: stored.filename,
          fileHash,
          storageKey: stored.key,
          status: 'PREVIEW',
          dryRun: true,
          createdById: ctx.user.id,
        },
      })

      const seen = new Map<string, ParsedPerson>()
      const duplicates: ImportSummary['duplicates'] = []
      let newInfluencers = 0
      let existingInfluencers = 0

      for (const person of parsed.people) {
        const existing = await resolveExistingInfluencer(tx, person)
        const duplicate = await findPossibleDuplicate(tx, person, seen)
        registerSeen(seen, person)

        if (duplicate) {
          duplicates.push({
            sheetName: person.sheetName,
            rowNumber: person.rowNumber,
            name: person.displayName,
            reason: duplicate.reason,
            existingName: duplicate.existingName,
          })
        }
        if (existing) existingInfluencers += 1
        else newInfluencers += 1

        await tx.importRowLog.create({
          data: {
            importRunId: run.id,
            clientId: input.clientId,
            sheetName: person.sheetName,
            rowNumber: person.rowNumber,
            outcome: duplicate ? 'POSSIBLE_DUPLICATE' : existing ? 'UNCHANGED' : 'CREATED',
            entityType: 'Influencer',
            entityId: existing?.id ?? null,
            message: duplicate?.reason ?? (existing ? `Coincide con "${existing.displayName}"` : 'Alta nueva'),
            rawValues: person.rawValues as never,
          },
        })
      }

      for (const issue of parsed.issues) {
        await tx.importRowLog.create({
          data: {
            importRunId: run.id,
            clientId: input.clientId,
            sheetName: issue.sheetName,
            rowNumber: issue.rowNumber,
            outcome: issue.outcome,
            message: issue.message,
            rawValues: issue.rawValues as never,
          },
        })
      }

      const campaignCounts = new Map<string, number>()
      for (const person of parsed.people) {
        campaignCounts.set(person.campaignKey, (campaignCounts.get(person.campaignKey) ?? 0) + 1)
      }

      const summary: ImportSummary = {
        importRunId: run.id,
        filename: stored.filename,
        fileHash,
        sheets: parsed.sheetsSeen,
        decisions: parsed.decisions,
        counts: {
          totalRows: parsed.people.length,
          newInfluencers,
          existingInfluencers,
          possibleDuplicates: duplicates.length,
          incompleteRows: parsed.issues.filter((i) => i.outcome === 'INCOMPLETE').length,
          unparseableValues: parsed.issues.filter((i) => i.outcome === 'UNPARSEABLE').length,
          sectionRows: parsed.issues.filter((i) => i.outcome === 'SECTION').length,
          multiPersonRows: parsed.issues.filter((i) => i.outcome === 'MULTI_PERSON').length,
          conflictRows: parsed.issues.filter((i) => i.outcome === 'CONFLICT').length,
          campaigns: parsed.campaigns.filter((c) => (campaignCounts.get(c.key) ?? 0) > 0).length,
          shortlist: parsed.shortlist.length,
        },
        duplicates: duplicates.slice(0, 200),
        issues: parsed.issues.slice(0, 500).map((i) => ({
          sheetName: i.sheetName,
          rowNumber: i.rowNumber,
          outcome: i.outcome,
          message: i.message,
        })),
        campaigns: parsed.campaigns
          .filter((c) => (campaignCounts.get(c.key) ?? 0) > 0)
          .map((c) => ({ key: c.key, name: c.name, people: campaignCounts.get(c.key) ?? 0 })),
        brief: {
          followersMin: parsed.brief.followersMin,
          followersMax: parsed.brief.followersMax,
          engagementRateMin: parsed.brief.engagementRateMin,
          clusters: parsed.brief.clusters.map((c) => ({ label: c.label, targetPercent: c.targetPercent })),
          keywords: parsed.brief.keywords.length,
          niches: parsed.brief.niches.length,
        },
      }

      await tx.importRun.update({ where: { id: run.id }, data: { summary: summary as never, finishedAt: new Date() } })
      await recordAudit(tx, actorOf(ctx), {
        action: AUDIT.IMPORT_PREVIEW,
        entityType: 'ImportRun',
        entityId: run.id,
        clientId: input.clientId,
        metadata: { filename: stored.filename, rows: parsed.people.length },
      })

      return summary
    },
    IMPORT_TIMEOUT_MS,
  )
}

export type ConfirmResult = { importRunId: string; created: number; updated: number; campaigns: number; shortlist: number }

/**
 * Fase 2: aplicar la importación. Todo dentro de una transacción.
 * Reejecutable: si el influencer o la candidatura ya existen, se actualizan.
 */
export async function confirmImport(ctx: AuthContext, importRunId: string): Promise<ConfirmResult> {
  const run = await scoped(ctx, (tx) => tx.importRun.findUnique({ where: { id: importRunId } }))
  if (!run) throw new NotFoundError()
  assertClientInScope(ctx, run.clientId)
  assertCan(ctx, 'import.run', run.clientId)
  if (run.status !== 'PREVIEW') throw new ValidationError('Esta importación ya se resolvió.')
  if (!run.storageKey) throw new ValidationError('No se encuentra el archivo original de esta importación.')

  const data = await fileStorage().get(run.storageKey, { clientId: run.clientId })
  const fileHash = createHash('sha256').update(data).digest('hex')
  if (fileHash !== run.fileHash) throw new ValidationError('El archivo cambió desde la previsualización. Volvé a subirlo.')

  const parsed = await parseWorkbook(data)
  const clientId = run.clientId

  return scoped(
    ctx,
    async (tx) => {
      let created = 0
      let updated = 0

      // ── Campañas ──
      const campaignIds = new Map<string, string>()
      const usedKeys = new Set(parsed.people.map((p) => p.campaignKey))
      for (const campaign of parsed.campaigns) {
        if (!usedKeys.has(campaign.key)) continue
        const slug = slugify(campaign.key) || slugify(campaign.name)
        const row = await tx.campaign.upsert({
          where: { clientId_slug: { clientId, slug } },
          create: {
            clientId,
            slug,
            name: campaign.name,
            description: campaign.description,
            status: campaign.key === 'scouting-actual' ? 'SCOUTING' : 'CLOSED',
            countries: parsed.brief.country ? [parsed.brief.country.toUpperCase().slice(0, 12)] : [],
            platforms: parsed.brief.platforms,
            currency: parsed.budget.currency ?? 'USD',
            ...(campaign.key === 'scouting-actual' && parsed.budget.amount != null
              ? { budgetCache: String(parsed.budget.amount), barterDescription: parsed.budget.barterRaw }
              : {}),
            createdById: ctx.user.id,
          },
          update: { description: campaign.description },
        })
        campaignIds.set(campaign.key, row.id)
      }

      // ── Brief y clusters sobre la campaña principal ──
      const mainCampaignId = campaignIds.get('scouting-actual')
      const clusterIds = new Map<string, string>()
      if (mainCampaignId) {
        const brief = await tx.campaignBrief.upsert({
          where: { campaignId: mainCampaignId },
          create: {
            campaignId: mainCampaignId,
            clientId,
            country: parsed.brief.country,
            language: parsed.brief.language,
            followersMin: parsed.brief.followersMin,
            followersMax: parsed.brief.followersMax,
            engagementRateMin: parsed.brief.engagementRateMin == null ? null : String(parsed.brief.engagementRateMin),
            audienceAgeMin: parsed.brief.audienceAgeMin,
            audienceAgeMax: parsed.brief.audienceAgeMax,
            audienceGeoPredominance: parsed.brief.audienceGeoPredominance,
            platforms: parsed.brief.platforms,
            idealProfile: parsed.brief.idealProfile,
            contentIdeas: parsed.brief.contentIdeas,
            realProductUses: parsed.brief.realProductUses,
            exclusionCriteria: parsed.brief.exclusionCriteria,
            internalNotes: parsed.brief.internalNotes,
          },
          update: {
            followersMin: parsed.brief.followersMin,
            followersMax: parsed.brief.followersMax,
            engagementRateMin: parsed.brief.engagementRateMin == null ? null : String(parsed.brief.engagementRateMin),
            idealProfile: parsed.brief.idealProfile,
            contentIdeas: parsed.brief.contentIdeas,
            exclusionCriteria: parsed.brief.exclusionCriteria,
            internalNotes: parsed.brief.internalNotes,
          },
        })

        for (const [index, cluster] of parsed.brief.clusters.entries()) {
          const row = await tx.briefCluster.upsert({
            where: { briefId_key: { briefId: brief.id, key: cluster.key } },
            create: {
              briefId: brief.id,
              clientId,
              key: cluster.key,
              label: cluster.label,
              emoji: cluster.emoji,
              targetPercent: cluster.targetPercent,
              order: index,
            },
            update: { label: cluster.label, targetPercent: cluster.targetPercent, order: index },
          })
          clusterIds.set(cluster.key, row.id)
        }

        for (const [index, niche] of parsed.brief.niches.entries()) {
          const existing = await tx.briefNiche.findFirst({ where: { briefId: brief.id, clientId, label: niche.label } })
          if (existing) {
            await tx.briefNiche.update({ where: { id: existing.id }, data: { priority: niche.priority, idealProfile: niche.idealProfile } })
          } else {
            await tx.briefNiche.create({
              data: {
                briefId: brief.id,
                clientId,
                label: niche.label,
                mode: niche.mode,
                priority: niche.priority,
                idealProfile: niche.idealProfile,
                order: index,
              },
            })
          }
        }

        const uniqueKeywords = new Map(parsed.brief.keywords.map((k) => [`${k.category}::${k.term}`, k]))
        for (const [index, keyword] of [...uniqueKeywords.values()].entries()) {
          await tx.briefKeyword.upsert({
            where: { briefId_category_term: { briefId: brief.id, category: keyword.category, term: keyword.term } },
            create: { briefId: brief.id, clientId, category: keyword.category, term: keyword.term, order: index },
            update: {},
          })
        }
      }

      // ── Personas ──
      const nicheRows = await tx.niche.findMany()
      const nicheByLabel = new Map(nicheRows.map((n) => [n.label.toLowerCase(), n.id]))
      const handleToInfluencer = new Map<string, string>()

      for (const person of parsed.people) {
        const campaignId = campaignIds.get(person.campaignKey)
        const existing = await resolveExistingInfluencer(tx, person)

        let influencerId: string
        if (existing) {
          influencerId = existing.id
          await tx.influencer.update({
            where: { id: influencerId },
            data: {
              country: person.country ?? undefined,
              city: person.city ?? undefined,
              bio: person.bio ?? undefined,
              primaryHandle: person.handle ?? undefined,
            },
          })
          updated += 1
        } else {
          const influencer = await tx.influencer.create({
            data: {
              displayName: person.displayName,
              primaryHandle: person.handle,
              country: person.country,
              city: person.city,
              bio: person.bio,
              status: person.campaignKey === 'backlog' ? 'BACKLOG' : 'NEW',
              adultStatus: 'NOT_CONFIRMED',
              createdById: ctx.user.id,
            },
          })
          influencerId = influencer.id
          created += 1
        }

        for (const key of person.niches) {
          const nicheId = nicheByLabel.get(key.toLowerCase())
          if (!nicheId) continue
          await tx.influencerNiche.upsert({
            where: { influencerId_nicheId: { influencerId, nicheId } },
            create: { influencerId, nicheId },
            update: {},
          })
        }

        for (const [index, profile] of person.profiles.entries()) {
          const parsedUrl = parseProfileUrl(profile.url)
          if (parsedUrl.kind !== 'value') continue
          const { platform, url, urlNormalized, handle } = parsedUrl.value
          const row = await tx.socialProfile.upsert({
            where: { influencerId_platform_urlNormalized: { influencerId, platform, urlNormalized } },
            create: {
              influencerId,
              platform,
              url,
              urlNormalized,
              handle,
              followers: profile.followers,
              followersRaw: profile.followersRaw,
              followersUnparsed: profile.followersUnparsed,
              engagementRate: profile.engagementRate == null ? null : String(profile.engagementRate),
              engagementRaw: profile.engagementRaw,
              metricSource: `Importación "${person.sheetName}" fila ${person.rowNumber}`,
              measuredAt: null,
              isPrimary: index === 0,
              verificationStatus: 'UNVERIFIED',
            },
            update: {
              handle,
              followers: profile.followers ?? undefined,
              followersRaw: profile.followersRaw ?? undefined,
              followersUnparsed: profile.followersUnparsed,
              engagementRate: profile.engagementRate == null ? undefined : String(profile.engagementRate),
              engagementRaw: profile.engagementRaw ?? undefined,
            },
          })
          if (handle) handleToInfluencer.set(handle, influencerId)

          // Un snapshot por fila de origen: el mismo Excel reimportado no agrega
          // lecturas nuevas. Filas distintas con valores contradictorios (el
          // Excel los tiene) sí conviven, y quedan visibles en el historial.
          if (profile.followers != null || profile.engagementRate != null) {
            const sourceLabel = `Excel "${person.sheetName}" fila ${person.rowNumber}`
            const already = await tx.metricSnapshot.findFirst({
              where: { socialProfileId: row.id, source: sourceLabel },
            })
            if (!already) {
              await tx.metricSnapshot.create({
                data: {
                  socialProfileId: row.id,
                  followers: profile.followers,
                  followersRaw: profile.followersRaw,
                  engagementRate: profile.engagementRate == null ? null : String(profile.engagementRate),
                  source: sourceLabel,
                  capturedById: ctx.user.id,
                },
              })
            }
          }

          await tx.sourceReference.upsert({
            where: { id: `${run.id}-${row.id}` },
            create: {
              id: `${run.id}-${row.id}`,
              influencerId,
              socialProfileId: row.id,
              url: person.sourceUrl ?? url,
              name: `Excel · ${person.sheetName}`,
              supports: 'seguidores y engagement rate',
              consultedAt: run.startedAt,
              verificationStatus: 'UNVERIFIED',
              notes: `Fila ${person.rowNumber}. Valores originales: seguidores "${profile.followersRaw ?? ''}", ER "${profile.engagementRaw ?? ''}".`,
              createdById: ctx.user.id,
            },
            update: {},
          })
        }

        if (campaignId) {
          const clusterId = person.clusterKey ? (clusterIds.get(person.clusterKey) ?? null) : null
          await tx.candidacy.upsert({
            where: { campaignId_influencerId: { campaignId, influencerId } },
            create: {
              clientId,
              campaignId,
              influencerId,
              clusterId,
              rank: person.rank,
              statusKey: person.statusKey,
              fitScore: person.fitScore,
              agencyRationale: person.agencyRationale,
              contentIdea: person.contentIdea,
              deliverablesSummary: person.deliverablesSummary,
              clientApproval: person.clientApproval,
              clientVisible: person.clientApproval !== 'PENDING' || person.statusKey === 'PROPUESTO',
              currency: parsed.budget.currency ?? 'USD',
              sourceSheet: person.sheetName,
              sourceRow: person.rowNumber,
              importRunId: run.id,
              createdById: ctx.user.id,
            },
            update: {
              clusterId: clusterId ?? undefined,
              rank: person.rank ?? undefined,
              statusKey: person.statusKey,
              fitScore: person.fitScore ?? undefined,
              agencyRationale: person.agencyRationale ?? undefined,
              contentIdea: person.contentIdea ?? undefined,
              deliverablesSummary: person.deliverablesSummary ?? undefined,
              clientApproval: person.clientApproval,
              sourceSheet: person.sheetName,
              sourceRow: person.rowNumber,
              importRunId: run.id,
            },
          })

          if (person.clientFeedback) {
            const candidacy = await tx.candidacy.findUnique({
              where: { campaignId_influencerId: { campaignId, influencerId } },
              select: { id: true },
            })
            if (candidacy) {
              const already = await tx.comment.findFirst({
                where: { candidacyId: candidacy.id, body: person.clientFeedback, visibility: 'CLIENT_AUTHORED' },
              })
              if (!already) {
                await tx.comment.create({
                  data: {
                    clientId,
                    campaignId,
                    candidacyId: candidacy.id,
                    authorSide: 'CLIENT',
                    visibility: 'CLIENT_AUTHORED',
                    body: person.clientFeedback,
                  },
                })
              }
            }
          }
        }

        await tx.importRowLog.create({
          data: {
            importRunId: run.id,
            clientId,
            sheetName: person.sheetName,
            rowNumber: person.rowNumber,
            outcome: existing ? 'UPDATED' : 'CREATED',
            entityType: 'Influencer',
            entityId: influencerId,
            message: existing ? 'Actualizado' : 'Creado',
          },
        })
      }

      // ── Shortlist ──
      let shortlistApplied = 0
      if (mainCampaignId) {
        for (const entry of parsed.shortlist) {
          const handle = normalizeHandle(entry.handle)
          if (!handle) continue
          const influencerId =
            handleToInfluencer.get(handle) ??
            (await tx.socialProfile.findFirst({ where: { handle }, select: { influencerId: true } }))?.influencerId
          if (!influencerId) continue
          const result = await tx.candidacy.updateMany({
            where: { campaignId: mainCampaignId, influencerId, clientId },
            data: { inShortlist: true, shortlistOrder: entry.order, clientVisible: true },
          })
          shortlistApplied += result.count
        }
      }

      // ── Duplicados: se marcan, nunca se fusionan ──
      const touched = await tx.candidacy.findMany({
        where: { importRunId: run.id },
        select: { influencerId: true },
        distinct: ['influencerId'],
        take: 1000,
      })
      for (const row of touched) await detectDuplicates(tx, row.influencerId)

      await tx.importRun.update({
        where: { id: run.id },
        data: { status: 'CONFIRMED', dryRun: false, finishedAt: new Date(), campaignId: mainCampaignId ?? null },
      })
      await recordAudit(tx, actorOf(ctx), {
        action: AUDIT.IMPORT_CONFIRMED,
        entityType: 'ImportRun',
        entityId: run.id,
        clientId,
        after: { created, updated, campaigns: campaignIds.size, shortlist: shortlistApplied },
      })

      return { importRunId: run.id, created, updated, campaigns: campaignIds.size, shortlist: shortlistApplied }
    },
    IMPORT_TIMEOUT_MS,
  )
}

export async function cancelImport(ctx: AuthContext, importRunId: string): Promise<void> {
  const run = await scoped(ctx, (tx) => tx.importRun.findUnique({ where: { id: importRunId } }))
  if (!run) throw new NotFoundError()
  assertClientInScope(ctx, run.clientId)
  assertCan(ctx, 'import.run', run.clientId)
  if (run.status !== 'PREVIEW') throw new ValidationError('Esta importación ya se resolvió.')

  await scoped(ctx, async (tx) => {
    await tx.importRun.update({ where: { id: importRunId }, data: { status: 'CANCELLED', finishedAt: new Date() } })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.IMPORT_CANCELLED,
      entityType: 'ImportRun',
      entityId: importRunId,
      clientId: run.clientId,
    })
  })
  if (run.storageKey) await fileStorage().remove(run.storageKey)
}

export async function listImportRuns(ctx: AuthContext, clientId: string) {
  assertClientInScope(ctx, clientId)
  assertCan(ctx, 'import.run', clientId)
  return scoped(ctx, async (tx) => {
    const rows = await tx.importRun.findMany({
      where: { clientId },
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: { _count: { select: { rows: true } } },
    })
    return rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
      /*
       * Las personas del archivo, no las filas del registro interno.
       *
       * `_count.rows` cuenta el log: una fila por persona MÁS una por problema
       * en la previsualización, y otra por persona al confirmar. Un Excel de
       * 120 personas con 15 problemas mostraba "Filas: 135" antes de confirmar
       * y "255" después. Ninguno de los dos era la cantidad de filas del
       * archivo, que es lo que alguien lee ahí.
       */
      rowCount: (row.summary as ImportSummary | null)?.counts?.totalRows ?? null,
      summary: row.summary as ImportSummary | null,
    }))
  })
}

export async function listImportRowLogs(ctx: AuthContext, importRunId: string, outcome?: string | null) {
  const run = await scoped(ctx, (tx) => tx.importRun.findUnique({ where: { id: importRunId } }))
  if (!run) throw new NotFoundError()
  assertClientInScope(ctx, run.clientId)
  assertCan(ctx, 'import.run', run.clientId)

  return scoped(ctx, async (tx) => {
    const rows = await tx.importRowLog.findMany({
      where: { importRunId, ...(outcome ? { outcome: outcome as never } : {}) },
      orderBy: [{ sheetName: 'asc' }, { rowNumber: 'asc' }],
      take: 2000,
    })
    return rows.map((row) => ({
      id: row.id,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      outcome: row.outcome,
      entityType: row.entityType,
      entityId: row.entityId,
      message: row.message,
    }))
  })
}
