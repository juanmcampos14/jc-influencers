import 'server-only'

/**
 * Tope de filas de una exportación.
 *
 * Existe para no armar un archivo de cien megas en memoria. Pero un CSV
 * incompleto que se descarga como si estuviera completo es peor que uno que no
 * se descarga: quien lo abre no tiene forma de saber que le faltan filas, así
 * que el archivo lo dice en su última línea.
 */
export const EXPORT_MAX_ROWS = 5000
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope, capabilitiesFor } from '@/lib/authz/context'
import { ForbiddenError, NotFoundError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import { consumeRateLimit } from '@/lib/auth/rate-limit'
import { fieldPermissionsFor, toCandidacyDto, type CandidacyDto } from '@/lib/domain/dto'
import { toCsv, type CsvColumn } from '@/lib/export/csv'
import { actorOf, scoped } from './base'

export type ExportResult = { filename: string; contentType: string; body: string }

const BASE_COLUMNS: CsvColumn<CandidacyDto>[] = [
  { header: 'Orden', value: (r) => r.rank ?? '' },
  { header: 'Cluster', value: (r) => r.clusterLabel ?? '' },
  { header: 'Creador', value: (r) => r.influencer.displayName },
  { header: 'Handle', value: (r) => (r.influencer.primaryHandle ? `@${r.influencer.primaryHandle}` : '') },
  { header: 'País', value: (r) => r.influencer.country ?? '' },
  { header: 'Plataforma principal', value: (r) => r.influencer.profiles[0]?.platform ?? '' },
  { header: 'URL', value: (r) => r.influencer.profiles[0]?.url ?? '' },
  { header: 'Seguidores', value: (r) => r.influencer.profiles[0]?.followers ?? '' },
  { header: 'Seguidores (origen)', value: (r) => r.influencer.profiles[0]?.followersRaw ?? '' },
  { header: 'ER %', value: (r) => r.influencer.profiles[0]?.engagementRate ?? '' },
  { header: 'Fit', value: (r) => (r.fitScore ? '*'.repeat(r.fitScore) : '') },
  { header: 'Estado', value: (r) => r.statusKey },
  { header: 'Aprobación cliente', value: (r) => r.clientApproval },
  { header: 'Idea de contenido', value: (r) => r.contentIdea ?? '' },
  { header: 'Justificación', value: (r) => r.agencyRationale ?? '' },
  { header: 'Entregables', value: (r) => r.deliverablesSummary ?? '' },
  { header: 'Stories', value: (r) => r.counts.stories },
  { header: 'Reels', value: (r) => r.counts.reels },
  { header: 'Posts', value: (r) => r.counts.posts },
  { header: 'TikToks', value: (r) => r.counts.tiktoks },
  { header: 'En shortlist', value: (r) => (r.inShortlist ? 'Sí' : 'No') },
  { header: 'Orden shortlist', value: (r) => r.shortlistOrder ?? '' },
]

const BUDGET_COLUMNS: CsvColumn<CandidacyDto>[] = [
  { header: 'Moneda', value: (r) => r.budget?.currency ?? '' },
  { header: 'Presupuesto solicitado', value: (r) => r.budget?.requested ?? '' },
  { header: 'Presupuesto negociado', value: (r) => r.budget?.negotiated ?? '' },
  { header: 'Caché', value: (r) => r.budget?.cache ?? '' },
  { header: 'Canje', value: (r) => r.budget?.barterDescription ?? '' },
]

const INTERNAL_COLUMNS: CsvColumn<CandidacyDto>[] = [
  { header: 'Notas internas', value: (r) => r.internalNotes ?? '' },
]

/**
 * Exporta las candidaturas de una campaña.
 * Las columnas se arman a partir de las MISMAS capacidades que la pantalla:
 * si el usuario no puede ver presupuesto, la columna no existe en el archivo.
 */
export async function exportCampaignCandidacies(ctx: AuthContext, campaignId: string): Promise<ExportResult> {
  const campaign = await scoped(ctx, (tx) =>
    tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true, slug: true, name: true } }),
  )
  if (!campaign) throw new NotFoundError()
  assertClientInScope(ctx, campaign.clientId)
  assertCan(ctx, 'export.create', campaign.clientId)
  assertCan(ctx, 'candidate.view', campaign.clientId)

  if (ctx.side === 'CLIENT') {
    const access = ctx.clients.find((c) => c.id === campaign.clientId)
    if (!access?.allowClientExports) throw new ForbiddenError({ clave: 'exportacionesNoHabilitadas' })
  }

  await consumeRateLimit('exportCreate', ctx.user.id)

  const perms = fieldPermissionsFor(ctx, campaign.clientId)
  const caps = capabilitiesFor(ctx, campaign.clientId)

  const rows = await scoped(ctx, (tx) =>
    tx.candidacy.findMany({
      where: {
        campaignId,
        clientId: campaign.clientId,
        ...(ctx.side === 'CLIENT' ? { clientVisible: true } : {}),
      },
      orderBy: [{ inShortlist: 'desc' }, { shortlistOrder: 'asc' }, { rank: 'asc' }],
      include: {
        influencer: {
          include: {
            profiles: { orderBy: [{ isPrimary: 'desc' }, { followers: 'desc' }] },
            niches: { include: { niche: true } },
            tags: { include: { tag: true } },
          },
        },
        cluster: { select: { label: true } },
      },
      take: EXPORT_MAX_ROWS,
    }),
  )

  const items = rows.map((row) => toCandidacyDto(row, perms))
  // Cuántas hay realmente, para poder avisar si el archivo salió recortado.
  const total = await scoped(ctx, (tx) => tx.candidacy.count({ where: { campaignId, clientId: campaign.clientId } }))
  const columns = [
    ...BASE_COLUMNS,
    ...(caps.has('budget.view') ? BUDGET_COLUMNS : []),
    ...(caps.has('internal_notes.view') ? INTERNAL_COLUMNS : []),
  ]

  await scoped(ctx, (tx) =>
    recordAudit(tx, actorOf(ctx), {
      action: AUDIT.EXPORT_CREATED,
      entityType: 'Campaign',
      entityId: campaignId,
      clientId: campaign.clientId,
      metadata: { rows: items.length, total, columns: columns.map((c) => c.header) },
    }),
  )

  const csv = toCsv(items, columns)
  return {
    filename: `${campaign.slug}-candidaturas.csv`,
    contentType: 'text/csv; charset=utf-8',
    /*
     * Si el archivo salió recortado, lo dice en su última línea.
     *
     * Un CSV incompleto que se descarga como si estuviera completo es peor que
     * uno que no se descarga: quien lo abre en una planilla no tiene forma de
     * saber que le faltan filas, y va a sacar conclusiones sobre un subconjunto
     * creyendo que es todo.
     */
    body:
      total > items.length
        ? `${csv}\n"ATENCIÓN: este archivo tiene ${items.length} de ${total} perfiles. El tope por exportación es ${EXPORT_MAX_ROWS}."`
        : csv,
  }
}
