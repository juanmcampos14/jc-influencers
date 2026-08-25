import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/app-shell'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, InfoNote } from '@/components/ui/states'
import { CampaignStatusBadge, StatusBadge } from '@/components/status-badge'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { dashboard } from '@/lib/repos/dashboard'
import { formatMoney, relativeDays } from '@/lib/util/format'

export const metadata: Metadata = { title: 'Panel' }
export const dynamic = 'force-dynamic'

export default async function PanelPage() {
  const ctx = await requireContext()
  const data = await loadPage(() => dashboard(ctx, null))

  return (
    <>
      <PageHeader
        title={`Hola, ${ctx.user.name.split(' ')[0]}`}
        description="Estado de las campañas activas y lo que está esperando una decisión."
      />
      <div className="space-y-6 px-5 py-6 sm:px-8">
        {data.staleMetrics > 0 || data.openDuplicates > 0 ? (
          <InfoNote>
            <p className="font-medium">Calidad de datos</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {data.staleMetrics > 0 ? (
                <li>
                  {data.staleMetrics} perfiles con métricas sin medir o desactualizadas (más de 45 días).{' '}
                  <Link href="/influencers?metrica=desactualizada" className="underline underline-offset-2">
                    Revisar
                  </Link>
                </li>
              ) : null}
              {data.openDuplicates > 0 ? (
                <li>
                  {data.openDuplicates} posibles duplicados sin resolver.{' '}
                  <Link href="/influencers/duplicados" className="underline underline-offset-2">
                    Revisar
                  </Link>
                </li>
              ) : null}
            </ul>
          </InfoNote>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Campañas activas</CardTitle>
            </CardHeader>
            {data.campaigns.length === 0 ? (
              <EmptyState
                title="No hay campañas activas"
                description="Cuando crees una campaña o importes el Excel de scouting va a aparecer acá."
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {data.campaigns.map((campaign) => (
                  <li key={campaign.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/campanas/${campaign.id}`}
                          className="text-sm font-medium text-ink-900 hover:text-brand-700"
                        >
                          {campaign.name}
                        </Link>
                        <p className="text-xs text-ink-500">{campaign.clientName}</p>
                      </div>
                      <CampaignStatusBadge status={campaign.status} />
                    </div>
                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-600">
                      <div className="flex gap-1">
                        <dt>Perfiles:</dt>
                        <dd className="font-medium text-ink-800">{campaign.total}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt>Aprobados:</dt>
                        <dd className="font-medium text-emerald-700">{campaign.approved}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt>Esperando al cliente:</dt>
                        <dd className="font-medium text-amber-700">{campaign.pending}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt>Shortlist:</dt>
                        <dd className="font-medium text-ink-800">{campaign.shortlist}</dd>
                      </div>
                      {data.canSeeBudget && (campaign.planned !== null || campaign.committed) ? (
                        <div className="flex gap-1">
                          <dt>Presupuesto:</dt>
                          <dd className="font-medium text-ink-800">
                            {campaign.committed ? formatMoney(campaign.committed, campaign.currency) : 'sin asignar'}
                            {campaign.planned !== null ? (
                              <span className="font-normal text-ink-500">
                                {' '}
                                de {formatMoney(campaign.planned, campaign.currency)}
                              </span>
                            ) : null}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Esperando decisión del cliente</CardTitle>
              </CardHeader>
              {data.pendingApprovals.length === 0 ? (
                <EmptyState title="Nada pendiente" description="No hay perfiles esperando aprobación." />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {data.pendingApprovals.map((item) => (
                    <li key={item.candidacyId} className="px-5 py-3">
                      <Link
                        href={`/campanas/${item.campaignId}`}
                        className="text-sm font-medium text-ink-900 hover:text-brand-700"
                      >
                        {item.influencerName}
                      </Link>
                      <p className="text-xs text-ink-500">
                        {item.campaignName} · {item.clientName} · propuesto {relativeDays(item.since)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Influencers por estado</CardTitle>
              </CardHeader>
              <CardBody>
                {data.byStatus.length === 0 ? (
                  <p className="text-sm text-ink-500">Todavía no hay candidaturas cargadas.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {data.byStatus
                      .slice()
                      .sort((a, b) => b.count - a.count)
                      .map((row) => (
                        <li key={row.statusKey}>
                          <Badge tone="slate">
                            <StatusBadge statusKey={row.statusKey} />
                            <span className="ml-1 font-semibold">{row.count}</span>
                          </Badge>
                        </li>
                      ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
