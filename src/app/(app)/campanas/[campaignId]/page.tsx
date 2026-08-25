import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/app-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InfoNote } from '@/components/ui/states'
import { CampaignStatusBadge } from '@/components/status-badge'
import { requireContext } from '@/lib/auth/current'
import { can } from '@/lib/authz/context'
import { NotFoundError } from '@/lib/authz/errors'
import { getBrief, getCampaign } from '@/lib/repos/campaigns'
import { candidacySummary, duplicateWarnings, listCandidacies } from '@/lib/repos/candidacies'
import { listComments } from '@/lib/repos/comments'
import { formatDate, formatMoney } from '@/lib/util/format'
import { hrefCon } from '@/lib/util/query'
import { CandidacyTable } from './candidacy-table'
import { FunnelBoard } from './funnel-board'
import { ShortlistPanel } from './shortlist-panel'
import { BriefPanel } from './brief-panel'
import { ActivityPanel } from './activity-panel'
import { InsightsPanel } from './insights-panel'
import { aiSpendThisMonth, listInsights } from '@/lib/repos/ai'
import { aiProvider } from '@/lib/ports/ai'
import { AddCandidacyDialog } from './add-candidacy-dialog'

export const metadata: Metadata = { title: 'Campaña' }
export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'perfiles', label: 'Perfiles' },
  { key: 'funnel', label: 'Funnel' },
  { key: 'shortlist', label: 'Shortlist' },
  { key: 'brief', label: 'Brief' },
  { key: 'analisis', label: 'Análisis IA' },
  { key: 'actividad', label: 'Actividad' },
] as const

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>
  searchParams: Promise<{ tab?: string; estado?: string; q?: string; pagina?: string }>
}) {
  const { campaignId } = await params
  const query = await searchParams
  const ctx = await requireContext()

  let campaign
  try {
    campaign = await getCampaign(ctx, campaignId)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const tab = TABS.find((entry) => entry.key === query.tab)?.key ?? 'perfiles'
  const clientId = campaign.clientId
  const canManage = can(ctx, 'candidate.manage', clientId)
  const canExport = can(ctx, 'export.create', clientId)
  const canEditBrief = can(ctx, 'brief.manage', clientId)
  const canSeeInternal = can(ctx, 'internal_notes.view', clientId)
  const canSeeBudget = can(ctx, 'budget.view', clientId)
  const canEditBudget = can(ctx, 'budget.manage', clientId)

  const [summary, brief, duplicates] = await Promise.all([
    candidacySummary(ctx, campaignId),
    getBrief(ctx, campaignId),
    duplicateWarnings(ctx, campaignId),
  ])

  const candidacies =
    tab === 'perfiles' || tab === 'funnel' || tab === 'shortlist'
      ? await listCandidacies(
          ctx,
          campaignId,
          {
            statusKeys: query.estado ? [query.estado] : null,
            search: query.q?.trim() || null,
            onlyShortlist: tab === 'shortlist',
          },
          { page: Number(query.pagina ?? 1) || 1, pageSize: tab === 'perfiles' ? 50 : 200 },
        )
      : null

  const comments = tab === 'actividad' ? await listComments(ctx, { campaignId }) : []

  const insights = tab === 'analisis' ? await listInsights(ctx, { campaignId }) : []
  const aiSpend = tab === 'analisis' ? await aiSpendThisMonth(ctx) : { spent: 0, limit: 0 }

  return (
    <>
      <PageHeader
        title={campaign.name}
        variant="nombre"
        description={campaign.objective ?? campaign.description ?? undefined}
        breadcrumb={
          <span className="flex gap-1">
            <Link href="/campanas" className="hover:underline">
              Campañas
            </Link>
            <span>/</span>
            <Link href={`/clientes/${clientId}`} className="hover:underline">
              {campaign.clientName}
            </Link>
          </span>
        }
        actions={
          <>
            <CampaignStatusBadge status={campaign.status} />
            {canExport ? (
              <Button asChild variant="secondary" size="sm">
                <a href={`/api/exportar/campana/${campaign.id}`}>Exportar CSV</a>
              </Button>
            ) : null}
            {canManage ? <AddCandidacyDialog campaignId={campaign.id} clusters={brief?.clusters ?? []} /> : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-ink-200 bg-surface px-5 pb-3 text-xs text-ink-600 sm:px-8">
        <span>
          Perfiles: <strong className="text-ink-900">{summary.total}</strong>
        </span>
        <span>
          En shortlist: <strong className="text-ink-900">{summary.shortlist}</strong>
        </span>
        <span>
          Aprobados: <strong className="text-emerald-700">{summary.byApproval.APPROVED ?? 0}</strong>
        </span>
        <span>
          Pendientes: <strong className="text-amber-700">{summary.byApproval.PENDING ?? 0}</strong>
        </span>
        {canSeeBudget && campaign.budget ? (
          <span>
            Presupuesto estimado:{' '}
            <strong className="text-ink-900">{formatMoney(campaign.budget.estimated, campaign.currency)}</strong>
            {campaign.budget.cache != null ? (
              <> · caché {formatMoney(campaign.budget.cache, campaign.currency)}</>
            ) : null}
            {campaign.budget.barterDescription ? <> · canje: {campaign.budget.barterDescription}</> : null}
          </span>
        ) : null}
        <span>
          {formatDate(campaign.startDate, ctx.user.timezone)} → {formatDate(campaign.endDate, ctx.user.timezone)}
        </span>
        {campaign.platforms.length > 0 ? (
          <span className="flex items-center gap-1">
            {campaign.platforms.map((platform) => (
              <Badge key={platform} tone="slate">
                {platform}
              </Badge>
            ))}
          </span>
        ) : null}
      </div>

      <nav className="border-b border-ink-200 bg-surface px-5 sm:px-8" aria-label="Secciones de la campaña">
        <ul className="flex gap-1 overflow-x-auto">
          {TABS.map((entry) => (
            <li key={entry.key}>
              <Link
                href={hrefCon(`/campanas/${campaign.id}`, query, {
                  tab: entry.key,
                  // Cambiar de sección arranca desde la primera página; el
                  // filtro se conserva, la página no tendría sentido.
                  pagina: null,
                })}
                aria-current={tab === entry.key ? 'page' : undefined}
                className={
                  tab === entry.key
                    ? 'inline-block border-b-2 border-brand-600 px-3 py-2.5 text-sm font-medium text-brand-700'
                    : 'inline-block border-b-2 border-transparent px-3 py-2.5 text-sm text-ink-600 hover:text-ink-900'
                }
              >
                {entry.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-4 px-5 py-6 sm:px-8">
        {duplicates.length > 0 && (tab === 'perfiles' || tab === 'shortlist') ? (
          <InfoNote>
            <p className="font-medium">
              {duplicates.length === 1
                ? 'Hay 1 perfil de esta campaña marcado como posible duplicado.'
                : `Hay ${duplicates.length} perfiles de esta campaña marcados como posible duplicado.`}
            </p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {duplicates.slice(0, 5).map((warning, index) => (
                <li key={`${warning.influencerId}-${index}`}>
                  <Link href={`/influencers/${warning.influencerId}`} className="underline underline-offset-2">
                    {warning.displayName}
                  </Link>
                  {' — '}
                  {warning.reason}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              No se fusionan solos.{' '}
              <Link href="/influencers/duplicados" className="underline underline-offset-2">
                Resolverlos
              </Link>
              .
            </p>
          </InfoNote>
        ) : null}

        {tab === 'perfiles' && candidacies ? (
          <CandidacyTable
            campaignId={campaign.id}
            currency={campaign.currency}
            data={candidacies}
            clusters={brief?.clusters ?? []}
            team={campaign.team}
            permissions={{
              canManage,
              canSeeInternal,
              canSeeBudget,
              canEditBudget,
              canRunAi: can(ctx, 'ai.run', clientId),
              aiConfigured: aiProvider().configured,
            }}
            filters={{ estado: query.estado ?? '', q: query.q ?? '' }}
          />
        ) : null}

        {tab === 'funnel' && candidacies ? <FunnelBoard items={candidacies.items} /> : null}

        {tab === 'shortlist' && candidacies ? (
          <ShortlistPanel campaignId={campaign.id} items={candidacies.items} canManage={canManage} />
        ) : null}

        {tab === 'brief' ? (
          <BriefPanel
            campaignId={campaign.id}
            brief={brief}
            canEdit={canEditBrief}
            canSeeInternal={canSeeInternal}
            clusterUsage={summary.byStatus}
          />
        ) : null}

        {tab === 'analisis' ? (
          <InsightsPanel
            campaignId={campaign.id}
            insights={insights}
            canRun={can(ctx, 'ai.run', clientId)}
            configured={aiProvider().configured}
            spend={aiSpend}
            timezone={ctx.user.timezone}
          />
        ) : null}

        {tab === 'actividad' ? (
          <ActivityPanel
            campaignId={campaign.id}
            comments={comments}
            canWriteInternal={can(ctx, 'feedback.internal.create', clientId)}
            canWriteClientVisible={can(ctx, 'feedback.create', clientId)}
            canWriteBudget={canSeeBudget}
            side="AGENCY"
            timezone={ctx.user.timezone}
          />
        ) : null}
      </div>
    </>
  )
}
