import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/app-shell'
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, InfoNote } from '@/components/ui/states'
import { Stat, StatStrip } from '@/components/ui/stat'
import { Avatar } from '@/components/ui/avatar'
import { CampaignStatusBadge, StatusBadge } from '@/components/status-badge'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { dashboard } from '@/lib/repos/dashboard'
import { formatMoney, relativeDays } from '@/lib/util/format'

export const metadata: Metadata = { title: 'Panel' }
export const dynamic = 'force-dynamic'

export default async function PanelPage() {
  const ctx = await requireContext()
  const t = await getTranslations('panel')
  const idioma = await getLocale()
  /*
   * El panel sigue al selector de espacio de trabajo.
   *
   * Antes pedía `null`, que en el repositorio significa "sin filtro de
   * cliente": la barra decía "Espacio de trabajo: Aikestar" y "los datos nunca
   * se mezclan" mientras el panel listaba campañas y perfiles de todos los
   * clientes. Para un producto cuyo centro es el aislamiento, esa contradicción
   * en la primera pantalla no es un detalle.
   *
   * Quien tiene alcance sobre todos los clientes puede elegir "Todos" en el
   * selector; ahí `activeClientId` es null y el panel muestra el conjunto,
   * porque eso es lo que se pidió.
   */
  const data = await loadPage(() => dashboard(ctx, ctx.activeClientId))
  const espacio = ctx.clients.find((client) => client.id === ctx.activeClientId)?.name ?? null

  return (
    <>
      <PageHeader
        title={t('hola', { nombre: ctx.user.name.split(' ')[0] ?? '' })}
        description={
          espacio
            ? `Estado de ${espacio}: campañas activas y lo que está esperando una decisión.`
            : t('bajada')
        }
      />
      <div className="space-y-6 px-5 py-6 sm:px-8">
        {/*
          * Contadas en la base, no sumadas de la lista de abajo, que viene
          * acotada. Van de lo más urgente a lo más informativo, y cada una
          * lleva a su listado: ver "73 esperando" sin poder abrirlos no sirve.
          */}
        <StatStrip>
          <Stat
            label={t('esperandoAlCliente')}
            value={data.totals.awaitingClient}
            tone="accent"
            hint={t('yaLoVe')}
          />
          {data.totals.notSharedYet !== null ? (
            <Stat
              label={t('sinCompartir')}
              value={data.totals.notSharedYet}
              tone="warn"
              hint={t('todaviaNoLoVe')}
            />
          ) : (
            <Stat label={t('campanasActivas')} value={data.totals.activeCampaigns} />
          )}
          <Stat label={t('aprobados')} value={data.totals.approved} tone="good" />
          <Stat label={t('perfilesPropuestos')} value={data.totals.proposedProfiles} hint={t('enCampanasAbiertas')} />
        </StatStrip>

        {data.staleMetrics > 0 || data.openDuplicates > 0 ? (
          <InfoNote>
            <p className="font-medium">{t('calidadDeDatos')}</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {data.staleMetrics > 0 ? (
                <li>
                  {t('metricasViejas', { n: data.staleMetrics })}{' '}
                  <Link href="/influencers?metrica=desactualizada" className="underline underline-offset-2">
                    {t('revisar')}
                  </Link>
                </li>
              ) : null}
              {data.openDuplicates > 0 ? (
                <li>
                  {t('duplicadosAbiertos', { n: data.openDuplicates })}{' '}
                  <Link href="/influencers/duplicados" className="underline underline-offset-2">
                    {t('revisar')}
                  </Link>
                </li>
              ) : null}
            </ul>
          </InfoNote>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t('campanasActivas')}</CardTitle>
              {data.campaignsShown < data.totals.activeCampaigns ? (
                <CardDescription>
                  Las {data.campaignsShown} más recientes de {data.totals.activeCampaigns}.{' '}
                  <Link href="/campanas" className="underline underline-offset-2">
                    Ver todas
                  </Link>
                </CardDescription>
              ) : (
                <CardDescription>
                  {data.totals.activeCampaigns === 1 ? '1 campaña abierta' : `${data.totals.activeCampaigns} campañas abiertas`}
                </CardDescription>
              )}
            </CardHeader>
            {data.campaigns.length === 0 ? (
              <EmptyState
                title={t('sinCampanasTitulo')}
                description={t('sinCampanasBajada')}
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {data.campaigns.map((campaign) => (
                  <li key={campaign.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/campanas/${campaign.id}`}
                          className="text-sm font-medium text-ink-900 underline-offset-4 hover:underline"
                        >
                          {campaign.name}
                        </Link>
                        <p className="text-xs text-ink-500">{campaign.clientName}</p>
                      </div>
                      <CampaignStatusBadge status={campaign.status} />
                    </div>
                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-600">
                      <div className="flex gap-1">
                        <dt>{t('perfiles')}</dt>
                        <dd className="font-medium text-ink-800">{campaign.total}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt>{t('aprobadosDosPuntos')}</dt>
                        <dd className="font-medium text-emerald-700">{campaign.approved}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt>{t('esperandoDosPuntos')}</dt>
                        <dd className="font-medium text-amber-700">{campaign.pending}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt>{t('shortlist')}</dt>
                        <dd className="font-medium text-ink-800">{campaign.shortlist}</dd>
                      </div>
                      {data.canSeeBudget && (campaign.planned !== null || campaign.committed) ? (
                        <div className="flex gap-1">
                          <dt>{t('presupuesto')}</dt>
                          <dd className="font-medium text-ink-800">
                            {campaign.committed ? formatMoney(campaign.committed, campaign.currency, idioma) : 'sin asignar'}
                            {campaign.planned !== null ? (
                              <span className="font-normal text-ink-500">
                                {' '}
                                de {formatMoney(campaign.planned, campaign.currency, idioma)}
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
                <CardTitle>{t('esperandoDecision')}</CardTitle>
              </CardHeader>
              {data.pendingApprovals.length === 0 ? (
                <EmptyState title={t('nadaPendienteTitulo')} description={t('nadaPendienteBajada')} />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {data.pendingApprovals.map((item) => (
                    <li key={item.candidacyId} className="flex items-center gap-3 px-5 py-3">
                      <Avatar name={item.influencerName} size="sm" />
                      <div className="min-w-0">
                        <Link
                          href={`/campanas/${item.campaignId}`}
                          className="block truncate text-sm font-medium text-ink-900 underline-offset-4 hover:underline"
                        >
                          {item.influencerName}
                        </Link>
                        <p className="truncate text-xs text-ink-500">
                          {item.campaignName} · {item.clientName} · propuesto {relativeDays(item.since)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('influencersPorEstado')}</CardTitle>
              </CardHeader>
              <CardBody>
                {data.byStatus.length === 0 ? (
                  <p className="text-sm text-ink-500">{t('sinCandidaturas')}</p>
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
