import 'server-only'
import type { Tx } from '@/lib/db/scope'
import { isMetricStale } from '@/lib/domain/statuses'
import { CANDIDACY_STATUS_SEED } from '@/lib/domain/statuses'

/**
 * Arma el material que se le pasa al modelo.
 *
 * Todo lo que entra acá sale de la base. Cada número viaja con su fuente y su
 * antigüedad, y lo que falta se declara faltante en vez de omitirse en silencio:
 * si el modelo no sabe que un dato no está, lo va a completar solo.
 */

const STATUS_LABELS = new Map(CANDIDACY_STATUS_SEED.map((status) => [status.key, status.label]))

const value = (input: string | number | null | undefined): string =>
  input === null || input === undefined || input === '' ? 'sin dato' : String(input)

export async function buildBriefContext(tx: Tx, campaignId: string): Promise<string> {
  const campaign = await tx.campaign.findUnique({
    where: { id: campaignId },
    include: {
      client: { select: { name: true } },
      brief: { include: { clusters: { orderBy: { order: 'asc' } }, niches: true, keywords: true } },
    },
  })
  if (!campaign) return 'No hay campaña.'

  const brief = campaign.brief
  const lines = [
    `Cliente: ${campaign.client.name}`,
    `Campaña: ${campaign.name}`,
    `Objetivo: ${value(campaign.objective)}`,
    `Descripción: ${value(campaign.description)}`,
    `Estado de la campaña: ${campaign.status}`,
    `Países: ${campaign.countries.join(', ') || 'sin dato'}`,
    `Plataformas: ${campaign.platforms.join(', ') || 'sin dato'}`,
  ]

  if (!brief) {
    lines.push('', 'ATENCIÓN: esta campaña todavía no tiene brief cargado.')
    return lines.join('\n')
  }

  lines.push(
    '',
    '### Criterios de selección',
    `País: ${value(brief.country)}`,
    `Idioma: ${value(brief.language)}`,
    `Rango de seguidores: ${brief.followersMin ?? 'sin mínimo'} a ${brief.followersMax ?? 'sin máximo'}`,
    `Engagement rate mínimo: ${brief.engagementRateMin ? `${brief.engagementRateMin}%` : 'sin dato'}`,
    `Edad de audiencia: ${brief.audienceAgeMin ?? '?'} a ${brief.audienceAgeMax ?? '?'}`,
    `Audiencia predominante: ${value(brief.audienceGeoPredominance)}${brief.audienceGeoMinPercent ? ` (mínimo ${brief.audienceGeoMinPercent}%)` : ''}`,
    `Perfil ideal: ${value(brief.idealProfile)}`,
    `Criterios de inclusión: ${value(brief.inclusionCriteria)}`,
    `Criterios de exclusión: ${value(brief.exclusionCriteria)}`,
    `Usos reales del producto: ${value(brief.realProductUses)}`,
  )

  if (brief.clusters.length > 0) {
    lines.push('', '### Distribución deseada del squad')
    for (const cluster of brief.clusters) lines.push(`- ${cluster.label}: ${cluster.targetPercent}%`)
  }
  if (brief.niches.length > 0) {
    lines.push('', '### Nichos')
    for (const niche of brief.niches) {
      lines.push(`- ${niche.label} (prioridad ${niche.priority}/5, ${niche.mode === 'EXCLUDED' ? 'EXCLUIDO' : 'prioritario'})`)
    }
  }
  if (brief.keywords.length > 0) {
    const byCategory = new Map<string, string[]>()
    for (const keyword of brief.keywords) {
      byCategory.set(keyword.category, [...(byCategory.get(keyword.category) ?? []), keyword.term])
    }
    lines.push('', '### Palabras clave')
    for (const [category, terms] of byCategory) lines.push(`- ${category}: ${terms.join(', ')}`)
  }

  return lines.join('\n')
}

export async function buildProfileContext(tx: Tx, candidacyId: string, now = new Date()): Promise<string> {
  const candidacy = await tx.candidacy.findUnique({
    where: { id: candidacyId },
    include: {
      cluster: { select: { label: true } },
      influencer: {
        include: {
          profiles: { orderBy: [{ isPrimary: 'desc' }, { followers: 'desc' }] },
          niches: { include: { niche: true } },
          tags: { include: { tag: true } },
          sources: { take: 5, orderBy: { createdAt: 'desc' } },
        },
      },
    },
  })
  if (!candidacy) return 'No hay perfil.'

  const influencer = candidacy.influencer
  const lines = [
    `Nombre: ${influencer.displayName}`,
    `Handle principal: ${influencer.primaryHandle ? `@${influencer.primaryHandle}` : 'sin dato'}`,
    `País: ${value(influencer.country)} · Ciudad: ${value(influencer.city)} · Idioma: ${value(influencer.language)}`,
    `Nichos: ${influencer.niches.map((entry) => entry.niche.label).join(', ') || 'sin dato'}`,
    `Etiquetas: ${influencer.tags.map((entry) => entry.tag.label).join(', ') || 'ninguna'}`,
    `Bio: ${value(influencer.bio)}`,
    `Mayoría de edad: ${influencer.adultStatus}`,
    `Cluster asignado: ${value(candidacy.cluster?.label)}`,
    `Estado actual: ${STATUS_LABELS.get(candidacy.statusKey) ?? candidacy.statusKey}`,
    `Idea de contenido ya cargada: ${value(candidacy.contentIdea)}`,
    `Justificación ya cargada: ${value(candidacy.agencyRationale)}`,
  ]

  lines.push('', '### Perfiles sociales y métricas')
  if (influencer.profiles.length === 0) {
    lines.push('Sin perfiles sociales cargados. No hay métricas para evaluar.')
  }
  for (const profile of influencer.profiles) {
    const stale = isMetricStale(profile.measuredAt, now)
    lines.push(
      `- ${profile.platform} ${profile.handle ? `@${profile.handle}` : ''}: ` +
        `${profile.followers === null ? 'seguidores sin dato' : `${profile.followers} seguidores`}` +
        `${profile.followersRaw ? ` (valor de origen: "${profile.followersRaw}")` : ''}` +
        `${profile.followersUnparsed ? ' [el valor original NO se pudo normalizar]' : ''}` +
        `, ER ${profile.engagementRate === null ? 'sin dato' : `${profile.engagementRate}%`}` +
        `, audiencia local ${profile.audienceLocalPercent === null ? 'sin dato' : `${profile.audienceLocalPercent}%`}` +
        `, medido ${profile.measuredAt ? profile.measuredAt.toISOString().slice(0, 10) : 'sin fecha'}` +
        `${stale ? ' [DATO DESACTUALIZADO O SIN VERIFICAR]' : ''}` +
        `, fuente: ${value(profile.metricSource)}` +
        `, verificación: ${profile.verificationStatus}`,
    )
  }

  if (influencer.sources.length > 0) {
    lines.push('', '### Procedencia de los datos')
    for (const source of influencer.sources) {
      lines.push(`- ${source.name} respalda ${source.supports} (consultado ${source.consultedAt.toISOString().slice(0, 10)})`)
    }
  }

  return lines.join('\n')
}

export async function buildCampaignState(tx: Tx, campaignId: string, now = new Date()): Promise<string> {
  const campaign = await tx.campaign.findUnique({
    where: { id: campaignId },
    include: { brief: { include: { clusters: { orderBy: { order: 'asc' } } } } },
  })
  if (!campaign) return 'No hay campaña.'

  const candidacies = await tx.candidacy.findMany({
    where: { campaignId },
    include: {
      cluster: { select: { label: true } },
      influencer: { include: { profiles: { orderBy: [{ isPrimary: 'desc' }] } } },
    },
    orderBy: [{ inShortlist: 'desc' }, { shortlistOrder: 'asc' }],
    take: 300,
  })

  const lines: string[] = [`Perfiles en la campaña: ${candidacies.length}`]

  const byStatus = new Map<string, number>()
  const byApproval = new Map<string, number>()
  const byCluster = new Map<string, number>()
  let stale = 0
  let withoutMetrics = 0

  for (const candidacy of candidacies) {
    byStatus.set(candidacy.statusKey, (byStatus.get(candidacy.statusKey) ?? 0) + 1)
    byApproval.set(candidacy.clientApproval, (byApproval.get(candidacy.clientApproval) ?? 0) + 1)
    const clusterLabel = candidacy.cluster?.label ?? 'sin cluster'
    byCluster.set(clusterLabel, (byCluster.get(clusterLabel) ?? 0) + 1)
    const profile = candidacy.influencer.profiles[0]
    if (!profile || profile.followers === null) withoutMetrics += 1
    else if (isMetricStale(profile.measuredAt, now)) stale += 1
  }

  lines.push('', '### Por estado')
  for (const [key, count] of byStatus) lines.push(`- ${STATUS_LABELS.get(key) ?? key}: ${count}`)

  lines.push('', '### Aprobación del cliente')
  for (const [key, count] of byApproval) lines.push(`- ${key}: ${count}`)

  lines.push('', '### Distribución real por cluster contra la deseada')
  const total = candidacies.length || 1
  const targets = new Map(campaign.brief?.clusters.map((cluster) => [cluster.label, cluster.targetPercent]) ?? [])
  for (const [label, count] of byCluster) {
    const real = Math.round((count / total) * 100)
    const target = targets.get(label)
    lines.push(`- ${label}: ${count} perfiles (${real}% real${target === undefined ? '' : `, ${target}% deseado`})`)
  }
  for (const [label, target] of targets) {
    if (!byCluster.has(label)) lines.push(`- ${label}: 0 perfiles (0% real, ${target}% deseado)`)
  }

  lines.push(
    '',
    '### Calidad del dato',
    `Perfiles con métricas desactualizadas o sin verificar: ${stale}`,
    `Perfiles sin ninguna métrica cargada: ${withoutMetrics}`,
  )

  lines.push('', '### Detalle del squad')
  for (const candidacy of candidacies.slice(0, 60)) {
    const profile = candidacy.influencer.profiles[0]
    lines.push(
      `- ${candidacy.influencer.displayName} · ${candidacy.cluster?.label ?? 'sin cluster'} · ` +
        `${profile?.followers === null || profile === undefined ? 'seguidores sin dato' : `${profile.followers} seguidores`} · ` +
        `ER ${profile?.engagementRate === null || profile === undefined ? 'sin dato' : `${profile.engagementRate}%`} · ` +
        `${STATUS_LABELS.get(candidacy.statusKey) ?? candidacy.statusKey} · aprobación ${candidacy.clientApproval}` +
        `${candidacy.inShortlist ? ' · en shortlist' : ''}`,
    )
  }
  if (candidacies.length > 60) lines.push(`(y ${candidacies.length - 60} más)`)

  return lines.join('\n')
}
