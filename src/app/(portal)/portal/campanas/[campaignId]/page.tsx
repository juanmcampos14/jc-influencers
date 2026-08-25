import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { requireContext } from '@/lib/auth/current'
import { can } from '@/lib/authz/context'
import { NotFoundError } from '@/lib/authz/errors'
import { getBrief, getCampaign } from '@/lib/repos/campaigns'
import { candidacySummary, listCandidacies } from '@/lib/repos/candidacies'
import { listComments } from '@/lib/repos/comments'
import { formatDate, formatNumber } from '@/lib/util/format'
import { ActivityPanel } from '@/app/(app)/campanas/[campaignId]/activity-panel'
import { InsightView } from '@/components/insight-view'
import { listInsights } from '@/lib/repos/ai'
import { ProposalList } from './proposal-list'

export const metadata: Metadata = { title: 'Campaña' }
export const dynamic = 'force-dynamic'

export default async function PortalCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>
  searchParams: Promise<{ filtro?: string }>
}) {
  const { campaignId } = await params
  const { filtro } = await searchParams
  const ctx = await requireContext()

  let campaign
  try {
    campaign = await getCampaign(ctx, campaignId)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  /*
   * El cliente entra a decidir, así que si hay algo esperándolo se abre en esa
   * lista y no en "Todos". Antes aterrizaba sobre los doscientos perfiles y
   * tenía que encontrar solo los pendientes.
   *
   * El resumen se pide antes que el resto porque de él depende qué lista traer.
   */
  const summary = await candidacySummary(ctx, campaignId)
  const esperando = (summary.byApproval.PENDING ?? 0) + (summary.byApproval.NEEDS_REVIEW ?? 0)
  const filtroActivo = filtro ?? (esperando > 0 ? 'pendientes' : '')

  const [candidacies, brief, comments, insights] = await Promise.all([
    listCandidacies(
      ctx,
      campaignId,
      {
        clientApproval: filtroActivo === 'pendientes' ? ['PENDING', 'NEEDS_REVIEW'] : null,
        onlyShortlist: filtroActivo === 'shortlist',
      },
      { pageSize: 200 },
    ),
    getBrief(ctx, campaignId),
    listComments(ctx, { campaignId }),
    can(ctx, 'ai.view', campaign.clientId) ? listInsights(ctx, { campaignId }) : Promise.resolve([]),
  ])

  const canApprove = can(ctx, 'candidate.approve', campaign.clientId)
  const canComment = can(ctx, 'feedback.create', campaign.clientId)
  const canExport = can(ctx, 'export.create', campaign.clientId)

  const FILTERS = [
    { key: 'pendientes', label: `Esperan tu decisión (${esperando})` },
    { key: '', label: `Todos (${summary.total})` },
    { key: 'shortlist', label: `Shortlist (${summary.shortlist})` },
  ]

  const decididos = summary.total - esperando

  return (
    <>
      <PageHeader
        title={campaign.name}
        variant="nombre"
        description={campaign.objective ?? campaign.description ?? undefined}
        breadcrumb={
          <Link href="/portal" className="hover:underline">
            Mis campañas
          </Link>
        }
        actions={
          canExport ? (
            <Button asChild variant="secondary" size="sm">
              <a href={`/api/exportar/campana/${campaign.id}`}>Descargar CSV</a>
            </Button>
          ) : null
        }
      />

      <div className="space-y-6 px-5 py-6 sm:px-8">
        {brief ? (
          <Card>
            <CardHeader>
              <CardTitle>Qué estamos buscando</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-ink-500">País</dt>
                  <dd className="text-ink-800">{brief.country ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">Seguidores</dt>
                  <dd className="text-ink-800">
                    {brief.followersMin || brief.followersMax
                      ? `${formatNumber(brief.followersMin)} – ${formatNumber(brief.followersMax)}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">Engagement mínimo</dt>
                  <dd className="text-ink-800">{brief.engagementRateMin != null ? `${brief.engagementRateMin}%` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">Fechas</dt>
                  <dd className="text-ink-800">
                    {formatDate(campaign.startDate, ctx.user.timezone)} → {formatDate(campaign.endDate, ctx.user.timezone)}
                  </dd>
                </div>
              </dl>
              {brief.clusters.length > 0 ? (
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-medium text-ink-500">Distribución propuesta del squad</p>
                  <div className="flex flex-wrap gap-1.5">
                    {brief.clusters.map((cluster) => (
                      <Badge key={cluster.id} tone="blue">
                        {cluster.emoji ? `${cluster.emoji} ` : ''}
                        {cluster.label} · {cluster.targetPercent}%
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        <nav aria-label="Filtros de perfiles">
          {summary.total > 0 ? (
            /* Cuánto falta. Sale de los mismos conteos que los filtros. */
            <div className="mb-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-ink-700">
                  {esperando === 0
                    ? 'Decidiste todos los perfiles propuestos.'
                    : `Decidiste ${decididos} de ${summary.total}. Faltan ${esperando}.`}
                </span>
                <span className="tabular-nums text-ink-500">
                  {Math.round((decididos / summary.total) * 100)}%
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-ink-200"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={summary.total}
                aria-valuenow={decididos}
                aria-label="Perfiles decididos"
              >
                <div
                  className="h-full rounded-full bg-brand-600 transition-[width]"
                  style={{ width: `${(decididos / summary.total) * 100}%` }}
                />
              </div>
            </div>
          ) : null}

          <ul className="flex flex-wrap gap-2">
            {FILTERS.map((entry) => {
              const isActive = filtroActivo === entry.key
              return (
                <li key={entry.key || 'todos'}>
                  <Link
                    href={entry.key ? `/portal/campanas/${campaign.id}?filtro=${entry.key}` : `/portal/campanas/${campaign.id}`}
                    aria-current={isActive ? 'page' : undefined}
                    className={
                      isActive
                        ? 'inline-block rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-on-brand'
                        : 'inline-block rounded-lg border border-ink-300 bg-surface px-3 py-1.5 text-sm text-ink-700 hover:bg-ink-100'
                    }
                  >
                    {entry.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <ProposalList
          campaignId={campaign.id}
          items={candidacies.items}
          canApprove={canApprove}
          timezone={ctx.user.timezone}
        />

        {insights.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-ink-900">Análisis compartidos por la agencia</h2>
            {insights.map((insight) => (
              <InsightView key={insight.id} insight={insight} timezone={ctx.user.timezone} />
            ))}
          </section>
        ) : null}

        <ActivityPanel
          campaignId={campaign.id}
          comments={comments}
          canWriteInternal={false}
          canWriteClientVisible={canComment}
          canWriteBudget={false}
          side="CLIENT"
          timezone={ctx.user.timezone}
        />
      </div>
    </>
  )
}
