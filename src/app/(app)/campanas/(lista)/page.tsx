import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { PageHeader } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { ThOrdenable } from '@/components/ui/ordenar'
import { resolverOrden, type ColumnaOrdenable } from '@/lib/domain/orden'
import { CampaignStatusBadge, CAMPAIGN_STATUS_TONES } from '@/components/status-badge'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { can } from '@/lib/authz/context'
import { listCampaigns } from '@/lib/repos/campaigns'
import { formatDate, formatMoney } from '@/lib/util/format'
import { CampaignFilters } from '../filters'
import { NewCampaignDialog } from '../new-campaign-dialog'
import { CasillaDeFila, SeleccionDeCampanas } from '../acciones-de-lote'

/**
 * El título de la pestaña también está traducido: se lee en el navegador, en
 * los favoritos y en el historial.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titulos')
  return { title: t('campanas') }
}
export const dynamic = 'force-dynamic'

type SearchParams = {
  q?: string
  estado?: string
  cliente?: string
  pagina?: string
  orden?: string
  dir?: string
  archivadas?: string
}

type Clave = 'nombre' | 'cliente' | 'estado' | 'perfiles' | 'fechas'

const COLUMNAS: ReadonlyArray<ColumnaOrdenable<Clave>> = [
  { clave: 'estado' },
  { clave: 'nombre' },
  { clave: 'cliente' },
  { clave: 'perfiles', porDefecto: 'desc' },
  { clave: 'fechas', porDefecto: 'desc' },
]

const columna = (clave: Clave): ColumnaOrdenable<Clave> => COLUMNAS.find((c) => c.clave === clave)!

const cerrada = (status: string): boolean => status === 'CLOSED' || status === 'CANCELLED'

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const ctx = await requireContext()
  const t = await getTranslations('campanas')
  const idioma = await getLocale()

  const orden = resolverOrden(COLUMNAS, params)
  const statusFilter = params.estado && params.estado in CAMPAIGN_STATUS_TONES ? [params.estado] : null
  // El cliente del filtro se valida contra el alcance dentro del repositorio.
  const clientFilter = params.cliente && ctx.clients.some((c) => c.id === params.cliente) ? params.cliente : null

  /*
   * Las archivadas son OTRA lista, no un filtro que se suma: archivar es
   * "sacala de ahí", y mezclarlas devolvería justo lo que alguien pidió no
   * ver. Se entra con `?archivadas=1` y la pantalla lo dice.
   */
  const verArchivadas = params.archivadas === '1'

  const campaigns = await loadPage(() =>
    listCampaigns(
    ctx,
    {
      search: params.q?.trim() || null,
      status: statusFilter as never,
      clientId: clientFilter,
      archivadas: verArchivadas,
    },
      { page: Number(params.pagina ?? 1) || 1, pageSize: 25 },
      // Sin `orden` en la URL, el repositorio usa su orden natural: vivas
      // primero. Pedirlo siempre lo pisaría con "por estado" de entrada.
      params.orden ? orden : undefined,
    ),
  )

  const canCreate = ctx.clients.some((client) => can(ctx, 'campaign.create', client.id))
  const canManage = campaigns.items.some((campaign) => can(ctx, 'campaign.update', campaign.clientId))
  const puedeArchivar = campaigns.items.some((campaign) => can(ctx, 'campaign.delete', campaign.clientId))

  return (
    <>
      <PageHeader
        title={verArchivadas ? t('tituloArchivadas') : t('titulo')}
        description={verArchivadas ? t('bajadaArchivadas') : t('bajada')}
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href={verArchivadas ? '/campanas' : '/campanas?archivadas=1'}>
                {verArchivadas ? t('verActivas') : t('verArchivadas')}
              </Link>
            </Button>
            {canCreate && !verArchivadas ? (
              <NewCampaignDialog clients={ctx.clients.map((c) => ({ id: c.id, name: c.name }))} />
            ) : null}
          </>
        }
      />
      <div className="space-y-4 px-5 py-6 sm:px-8">
        <CampaignFilters clients={ctx.clients.map((c) => ({ id: c.id, name: c.name }))} />

        <Card>
          {campaigns.items.length === 0 ? (
            <EmptyState
              title={t('vacioTitulo')}
              description={t('vacioBajada')}
            />
          ) : (
            <>
              <SeleccionDeCampanas
                idsDeLaPagina={canManage ? campaigns.items.map((c) => c.id) : []}
                archivadas={verArchivadas}
                puedeArchivar={puedeArchivar}
              >
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      {canManage ? <Th className="w-10"><span className="sr-only">{t('elegir')}</span></Th> : null}
                      <ThOrdenable columna={columna('nombre')} orden={orden} base="/campanas" params={params}>
                        {t('colCampana')}
                      </ThOrdenable>
                      <ThOrdenable columna={columna('cliente')} orden={orden} base="/campanas" params={params}>
                        {t('colCliente')}
                      </ThOrdenable>
                      <ThOrdenable columna={columna('estado')} orden={orden} base="/campanas" params={params}>
                        {t('colEstado')}
                      </ThOrdenable>
                      <ThOrdenable columna={columna('perfiles')} orden={orden} base="/campanas" params={params} className="text-right" alineado="derecha">
                        {t('colPerfiles')}
                      </ThOrdenable>
                      <Th className="text-right">{t('colAprobados')}</Th>
                      <Th className="text-right">{t('colPendientes')}</Th>
                      <ThOrdenable columna={columna('fechas')} orden={orden} base="/campanas" params={params}>
                        {t('colFechas')}
                      </ThOrdenable>
                      {/* El presupuesto no se puede ordenar: no todos lo ven, y
                          el orden filtraría igual una columna oculta. */}
                      <Th className="text-right">{t('colPresupuesto')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.items.map((campaign) => (
                      <Tr key={campaign.id}>
                        {canManage ? (
                          <Td>
                            <CasillaDeFila id={campaign.id} nombre={campaign.name} />
                          </Td>
                        ) : null}
                        <Td>
                          <Link href={`/campanas/${campaign.id}`} className="font-medium underline-offset-4 hover:underline">
                            {campaign.name}
                          </Link>
                        </Td>
                        <Td className="text-ink-600">{campaign.clientName}</Td>
                        <Td>
                          <CampaignStatusBadge status={campaign.status} />
                        </Td>
                        <Td className="text-right tabular-nums">{campaign.candidacyCount}</Td>
                        <Td className="text-right tabular-nums text-emerald-700">{campaign.approvedCount}</Td>
                        {/*
                          * En una campaña cerrada, "pendientes" ya no espera a
                          * nadie: pintarlo de ámbar era una alerta que no lo es.
                          */}
                        <Td
                          className={
                            cerrada(campaign.status)
                              ? 'text-right tabular-nums text-ink-400'
                              : 'text-right tabular-nums text-amber-700'
                          }
                        >
                          {campaign.pendingApprovalCount}
                        </Td>
                        <Td className="whitespace-nowrap text-xs text-ink-600">
                          {formatDate(campaign.startDate, ctx.user.timezone, idioma)} → {formatDate(campaign.endDate, ctx.user.timezone, idioma)}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {campaign.budget
                            ? formatMoney(campaign.budget.estimated, campaign.currency, idioma)
                            : t('restringido')}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
              </SeleccionDeCampanas>
              <Pagination
                base="/campanas"
                params={params as Record<string, string | undefined>}
                page={campaigns.page}
                pageCount={campaigns.pageCount}
                total={campaigns.total}
                unidad={t('unidad')}
              />
            </>
          )}
        </Card>
      </div>
    </>
  )
}
