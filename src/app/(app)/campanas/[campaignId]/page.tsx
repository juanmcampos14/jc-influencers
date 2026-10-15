import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/app-shell'
import { Badge } from '@/components/ui/badge'
import { Stat, StatStrip } from '@/components/ui/stat'
import { Button } from '@/components/ui/button'
import { InfoNote } from '@/components/ui/states'
import { EstadoDeCampana } from './estado-campana'
import { PestanasDeCampana } from './tabs'
import { PagosPanel } from './pagos-panel'
import { ReportingPanel } from './reporting-panel'
import { getPlan } from '@/lib/repos/pagos'
import { resumirResultados } from '@/lib/repos/reporting'
import { getObjetivos } from '@/lib/repos/objetivos'
import { PanelDeObjetivos } from '@/components/objetivos/panel-objetivos'
import { scoped } from '@/lib/repos/base'
import { requireContext } from '@/lib/auth/current'
import { can } from '@/lib/authz/context'
import { NotFoundError } from '@/lib/authz/errors'
import { getBrief, getCampaign } from '@/lib/repos/campaigns'
import { candidacySummary, duplicateWarnings, listCandidacies, perfilesPorCluster } from '@/lib/repos/candidacies'
import { listComments } from '@/lib/repos/comments'
import { getLocale, getTranslations } from 'next-intl/server'
import { platformLabel } from '@/lib/domain/labels'
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

/*
 * El nombre de cada pestaña se resuelve al pintar: la lista vive fuera del
 * componente y no puede leer traducciones, así que guarda la clave.
 */
const TABS = [
  { key: 'perfiles', clave: 'tabPerfiles' },
  { key: 'funnel', clave: 'tabFunnel' },
  { key: 'shortlist', clave: 'tabShortlist' },
  { key: 'brief', clave: 'tabBrief' },
  { key: 'resultados', clave: 'tabResultados' },
  { key: 'pagos', clave: 'tabPagos' },
  { key: 'analisis', clave: 'tabAnalisis' },
  { key: 'actividad', clave: 'tabActividad' },
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
  const t = await getTranslations('campanas')
  const idioma = await getLocale()
  const tEtiqueta = await getTranslations('etiquetas')

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
            /*
             * Shortlist y Funnel NO heredan el filtro de la pestaña Perfiles.
             *
             * Los tabs conservan la query, que es lo correcto para volver a
             * Perfiles sin perder lo filtrado. Pero en Shortlist eso hacía que
             * guardar el orden sacara de la lista a los que el filtro escondía,
             * y en Funnel que las columnas dijeran "Vacío" sin que hubiera
             * ningún filtro a la vista para explicarlo.
             */
            statusKeys: tab === 'perfiles' && query.estado ? [query.estado] : null,
            search: tab === 'perfiles' ? query.q?.trim() || null : null,
            onlyShortlist: tab === 'shortlist',
          },
          { page: Number(query.pagina ?? 1) || 1, pageSize: tab === 'perfiles' ? 50 : 200 },
        )
      : null

  // El brief compara lo buscado contra lo que hay, así que necesita el conteo
  // real por cluster -- que no es lo mismo que el conteo por estado.
  const porCluster = tab === 'brief' ? await perfilesPorCluster(ctx, campaignId) : {}

  const comments = tab === 'actividad' ? await listComments(ctx, { campaignId }) : []

  /*
   * La pestaña de Pagos sólo se consulta si se está mirando Y si esta persona
   * puede ver presupuestos. Traer el plan igual y esconderlo en la interfaz
   * dejaría los márgenes de la agencia viajando al navegador de cualquiera.
   */
  const puedeVerPlata = can(ctx, 'budget.view', clientId)

  /*
   * Las migraciones de este proyecto se aplican a mano, a propósito. Entre que
   * sale el código y alguien corre el SQL hay minutos en los que estas tablas
   * no existen todavía, y una pantalla nueva no puede tumbar una campaña
   * entera por eso.
   *
   * El `try` va ACÁ y no adentro del repositorio: un componente de servidor que
   * lanza termina en la frontera de error igual, sin importar qué tipo de error
   * sea. Convertir una excepción en otra no cambia nada; hay que no lanzar.
   */
  const plan =
    tab === 'pagos' && puedeVerPlata
      ? await getPlan(ctx, campaignId).catch((error: unknown) => {
          console.error('[campaña] no se pudo leer el plan de pagos', { campaignId, error })
          return null
        })
      : null

  const resultados =
    tab === 'resultados'
      ? await resumirResultados(ctx, campaignId).catch((error: unknown) => {
          console.error('[campaña] no se pudieron leer los resultados', { campaignId, error })
          return null
        })
      : null
  /*
   * Sólo los confirmados: una publicación de alguien que quedó en screening no
   * existe, y ofrecerlo en el desplegable invita a cargar una entrega falsa.
   */
  const confirmados =
    tab === 'resultados' && resultados
      ? await scoped(ctx, (tx) =>
          tx.candidacy.findMany({
            where: {
              campaignId,
              statusKey: {
                in: ['CONFIRMADO', 'CONTENIDO_EN_PRODUCCION', 'CONTENIDO_PARA_APROBACION', 'PUBLICADO', 'FINALIZADO'],
              },
            },
            select: { id: true, influencer: { select: { displayName: true } } },
            orderBy: { influencer: { displayName: 'asc' } },
          }),
        ).then((filas) => filas.map((fila) => ({ candidacyId: fila.id, nombre: fila.influencer.displayName })))
      : []

  /*
   * Los objetivos se definen en el Brief --que es el plan-- y se evalúan en
   * Resultados --que es lo que pasó--. Es el mismo panel: separarlos en dos
   * componentes haría que el número prometido y el medido puedan divergir.
   */
  const objetivos =
    tab === 'brief' || tab === 'resultados'
      ? await getObjetivos(ctx, campaignId).catch((error: unknown) => {
          console.error('[campaña] no se pudieron leer los objetivos', { campaignId, error })
          return null
        })
      : null

  const insights = tab === 'analisis' ? await listInsights(ctx, { campaignId }) : []
  const aiSpend = tab === 'analisis' ? await aiSpendThisMonth(ctx) : { spent: 0, limit: 0 }

  return (
    <>
      <PageHeader
        title={campaign.name}
        variant="nombre"
        badge={
          <EstadoDeCampana
            campaignId={campaign.id}
            status={campaign.status}
            version={campaign.version}
            puedeEditar={can(ctx, 'campaign.update', clientId)}
          />
        }
        description={campaign.objective ?? campaign.description ?? undefined}
        breadcrumb={
          <span className="flex gap-1">
            <Link href="/campanas" className="hover:underline">
              {t('titulo')}
            </Link>
            <span>/</span>
            <Link href={`/clientes/${clientId}`} className="hover:underline">
              {campaign.clientName}
            </Link>
          </span>
        }
        actions={
          <>
            {canExport ? (
              <Button asChild variant="secondary" size="sm">
                <a href={`/api/exportar/campana/${campaign.id}`}>{t('exportarCsv')}</a>
              </Button>
            ) : null}
            {canManage ? <AddCandidacyDialog campaignId={campaign.id} clusters={brief?.clusters ?? []} /> : null}
          </>
        }
      />

      {/*
        * Antes esto era una tira de texto chico donde todo pesaba igual. Los
        * números de una campaña son lo primero que se mira al abrirla, así que
        * van como cifras. "Esperando al cliente" lleva el acento porque es lo
        * único que exige una acción.
        */}
      <div className="border-b border-ink-200 bg-surface px-5 pb-4 sm:px-8">
        <StatStrip>
          <Stat label={t('statPropuestos')} value={summary.total} />
          <Stat
            label={t('statEsperandoCliente')}
            value={(summary.byApproval.PENDING ?? 0) + (summary.byApproval.NEEDS_REVIEW ?? 0)}
            tone="accent"
          />
          <Stat label={t('statAprobados')} value={summary.byApproval.APPROVED ?? 0} tone="good" />
          <Stat label={t('statShortlist')} value={summary.shortlist} />
        </StatStrip>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-600">
          <span>
            {campaign.startDate || campaign.endDate ? (
              <>
                {formatDate(campaign.startDate, ctx.user.timezone, idioma)} → {formatDate(campaign.endDate, ctx.user.timezone, idioma)}
              </>
            ) : (
              <span className="text-ink-500">{t('sinFechas')}</span>
            )}
          </span>
          {canSeeBudget && campaign.budget && campaign.budget.estimated != null ? (
            <span>
              {t('presupuestoEstimado')}{' '}
              <strong className="text-ink-900">
                {formatMoney(campaign.budget.estimated, campaign.currency, idioma)}
              </strong>
              {campaign.budget.cache != null
                ? t('cache', { monto: formatMoney(campaign.budget.cache, campaign.currency, idioma) })
                : null}
              {campaign.budget.barterDescription
                ? t('canje', { detalle: campaign.budget.barterDescription })
                : null}
            </span>
          ) : null}
          {campaign.platforms.length > 0 ? (
            <span className="flex items-center gap-1">
              {campaign.platforms.map((platform) => (
                <Badge key={platform} tone="slate">
                  {platformLabel(tEtiqueta, platform)}
                </Badge>
              ))}
            </span>
          ) : null}
        </div>
      </div>

      <PestanasDeCampana
        activa={tab}
        tabs={TABS.filter((entry) => entry.key !== 'pagos' || puedeVerPlata).map((entry) => ({
          key: entry.key,
          label: t(entry.clave),
          href: hrefCon(`/campanas/${campaign.id}`, query, {
            tab: entry.key,
            // Cambiar de sección arranca desde la primera página; el filtro se
            // conserva, la página no tendría sentido.
            pagina: null,
          }),
        }))}
      />

      <div className="space-y-4 px-5 py-6 sm:px-8">
        {duplicates.length > 0 && (tab === 'perfiles' || tab === 'shortlist') ? (
          <InfoNote>
            <p className="font-medium">{t('duplicadosAviso', { cantidad: duplicates.length })}</p>
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
              {t('noSeFusionanSolos')}{' '}
              <Link href="/influencers/duplicados" className="underline underline-offset-2">
                {t('resolverlos')}
              </Link>
              .
            </p>
          </InfoNote>
        ) : null}

        {tab === 'perfiles' && candidacies ? (
          <CandidacyTable
            campaignId={campaign.id}
            clientId={clientId}
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
              canRunScouting: can(ctx, 'scouting.run', clientId),
            }}
            filters={{ estado: query.estado ?? '', q: query.q ?? '' }}
          />
        ) : null}

        {tab === 'funnel' && candidacies ? (
          <FunnelBoard
            items={candidacies.items}
            byStatus={summary.byStatus}
            mostrando={candidacies.items.length}
            total={summary.total}
            campaignId={campaign.id}
            puedeMover={canManage}
          />
        ) : null}

        {tab === 'resultados' && !resultados ? (
          <InfoNote>{t('faltaMigracionResultados')}</InfoNote>
        ) : null}

        {tab === 'resultados' && objetivos ? (
          <PanelDeObjetivos
            objetivos={objetivos.objetivos}
            veredicto={objetivos.veredicto}
            campaignId={campaign.id}
            cerrada={objetivos.cerrada}
            puedeEditar={canEditBrief}
            puedeTopeDePlata={can(ctx, 'budget.manage', clientId)}
          />
        ) : null}

        {tab === 'resultados' && resultados ? (
          <ReportingPanel
            resumen={resultados}
            campaignId={campaign.id}
            talento={confirmados}
            puedeEditar={canManage}
          />
        ) : null}

        {tab === 'pagos' ? (
          plan ? (
            <PagosPanel plan={plan} campaignId={campaign.id} puedeEditar={can(ctx, 'budget.manage', clientId)} />
          ) : (
            <InfoNote>
              {puedeVerPlata ? t('faltaMigracionPagos') : t('sinPermisoPlata')}
            </InfoNote>
          )
        ) : null}

        {tab === 'shortlist' && candidacies ? (
          <ShortlistPanel campaignId={campaign.id} items={candidacies.items} canManage={canManage} />
        ) : null}

        {tab === 'brief' && objetivos ? (
          <div className="mb-4">
            <PanelDeObjetivos
              objetivos={objetivos.objetivos}
              veredicto={objetivos.veredicto}
              campaignId={campaign.id}
              cerrada={objetivos.cerrada}
              puedeEditar={canEditBrief}
              puedeTopeDePlata={can(ctx, 'budget.manage', clientId)}
            />
          </div>
        ) : null}

        {tab === 'brief' ? (
          <BriefPanel
            campaignId={campaign.id}
            brief={brief}
            canEdit={canEditBrief}
            canSeeInternal={canSeeInternal}
            clusterUsage={porCluster}
            totalCandidaturas={summary.total}
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
