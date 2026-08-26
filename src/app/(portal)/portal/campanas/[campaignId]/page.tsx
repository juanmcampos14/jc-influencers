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
import { Pagination } from '@/components/ui/pagination'
import { Bandeja } from './bandeja'
import { Conjunto } from './conjunto'
import { SelectorDeVista } from '@/components/selector-vista'
import { PanelDeObjetivos } from '@/components/objetivos/panel-objetivos'
import { getObjetivos } from '@/lib/repos/objetivos'
import { getVistaPreferida, resolverVista } from '@/lib/repos/view-prefs'

export const metadata: Metadata = { title: 'Campaña' }
export const dynamic = 'force-dynamic'

export default async function PortalCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>
  searchParams: Promise<{ vista?: string; n?: string; foco?: string; pagina?: string }>
}) {
  const { campaignId } = await params
  const { vista: vistaPedida, foco, pagina } = await searchParams
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
  const aprobados = summary.byApproval.APPROVED ?? 0

  /*
   * Qué vista mostrar: lo que pide la URL, si no la preferencia guardada, si no
   * el tamaño de la cola. Sin `redirect()`: se resuelve en el servidor y se
   * renderiza, y los enlaces del switch siempre llevan `?vista=` explícito para
   * que la URL que el cliente comparte diga qué está mirando.
   */
  const preferida = await getVistaPreferida(ctx, campaign.clientId).catch(() => null)
  const vista = resolverVista({ pedida: vistaPedida, preferida, esperando })

  const [candidacies, brief, comments, insights, objetivos] = await Promise.all([
    listCandidacies(
      ctx,
      campaignId,
      {
        // La bandeja es la cola: sólo lo que espera decisión. El conjunto es el
        // equipo: todo, para poder ver de dónde sale cada elegido.
        clientApproval: vista === 'bandeja' ? ['PENDING', 'NEEDS_REVIEW'] : null,
      },
      { page: Number(pagina ?? 1) || 1, pageSize: 60 },
    ),
    getBrief(ctx, campaignId),
    listComments(ctx, { campaignId }),
    can(ctx, 'ai.view', campaign.clientId) ? listInsights(ctx, { campaignId }) : Promise.resolve([]),
    getObjetivos(ctx, campaignId).catch(() => null),
  ])

  const canApprove = can(ctx, 'candidate.approve', campaign.clientId)
  const canComment = can(ctx, 'feedback.create', campaign.clientId)
  const canExport = can(ctx, 'export.create', campaign.clientId)

  const decididos = summary.total - esperando

  /*
   * El objetivo de alcance sale de los objetivos de la campaña. Si no hay, el
   * panel no dibuja esa barra: sin denominador, una barra es decoración que se
   * lee como un dato.
   */
  const objetivoDeAlcance =
    objetivos?.objetivos.find((objetivo) => objetivo.metric === 'ALCANCE_ESTIMADO')?.target ?? null

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

        {objetivos && objetivos.objetivos.length > 0 ? (
          <PanelDeObjetivos
            objetivos={objetivos.objetivos}
            veredicto={objetivos.veredicto}
            campaignId={campaign.id}
            cerrada={objetivos.cerrada}
            puedeEditar={false}
            compacto
          />
        ) : null}

        {summary.total > 0 ? (
          <div className="space-y-3">
            <SelectorDeVista
              activa={vista}
              base={`/portal/campanas/${campaign.id}`}
              clientId={campaign.clientId}
              pendientes={esperando}
              aprobados={aprobados}
              total={summary.total}
            />

            {/* Cuánto falta. Sale de los mismos conteos que el switch. */}
            <div>
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
          </div>
        ) : null}

        {vista === 'bandeja' ? (
          <Bandeja
            campaignId={campaign.id}
            items={candidacies.items}
            canApprove={canApprove}
            decididos={decididos}
            total={summary.total}
          />
        ) : (
          <Conjunto
            campaignId={campaign.id}
            items={candidacies.items}
            clusters={(brief?.clusters ?? []).map((cluster) => ({
              id: cluster.id,
              label: cluster.label,
              emoji: cluster.emoji,
              targetPercent: cluster.targetPercent,
            }))}
            canApprove={canApprove}
            foco={foco ?? null}
            objetivoDeAlcance={objetivoDeAlcance}
          />
        )}

        {/* La bandeja avanza de a uno con `?n=`, así que sólo pagina el conjunto. */}
        {vista === 'conjunto' ? (
        <Pagination
          base={`/portal/campanas/${campaign.id}`}
          params={{ vista, pagina }}
          page={candidacies.page}
          pageCount={candidacies.pageCount}
          total={candidacies.total}
          unidad="perfiles"
        />
        ) : null}

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
