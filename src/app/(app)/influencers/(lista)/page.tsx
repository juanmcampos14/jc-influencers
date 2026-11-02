import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { PageHeader } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { Stat, StatStrip } from '@/components/ui/stat'
import { Pagination } from '@/components/ui/pagination'
import { TamanoDePagina } from '@/components/ui/tamano-de-pagina'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { columnaFija, Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { ThOrdenable } from '@/components/ui/ordenar'
import { resolverOrden, type ColumnaOrdenable } from '@/lib/domain/orden'
import { ContactoDirecto } from '@/components/contacto-directo'
import { ExternalLink, InfluencerStatusBadge } from '@/components/status-badge'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { can } from '@/lib/authz/context'
import { listCampaigns } from '@/lib/repos/campaigns'
import { resumenDeLaBase, searchInfluencers } from '@/lib/repos/influencers'
import { scoped } from '@/lib/repos/base'
import { formatFollowers, formatNumber, formatPercent } from '@/lib/util/format'
import { InfluencerFilters } from '../filters'
import { CasillaDeFila, SeleccionDeInfluencers } from '../seleccion'
import { NewInfluencerDialog } from '../new-influencer-dialog'
import { NavDeInfluencers } from '../sub-nav'

/**
 * El título de la pestaña también está traducido: se lee en el navegador, en
 * los favoritos y en el historial.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titulos')
  return { title: t('influencers') }
}
export const dynamic = 'force-dynamic'

type SearchParams = {
  q?: string
  pais?: string
  plataforma?: string
  nicho?: string
  desde?: string
  hasta?: string
  er?: string
  estado?: string
  pagina?: string
  porPagina?: string
  orden?: string
  dir?: string
}

type Clave = 'nombre' | 'pais' | 'estado' | 'actualizado'

const COLUMNAS: ReadonlyArray<ColumnaOrdenable<Clave>> = [
  { clave: 'nombre' },
  { clave: 'pais' },
  { clave: 'estado' },
  { clave: 'actualizado', porDefecto: 'desc' },
]

const columna = (clave: Clave): ColumnaOrdenable<Clave> => COLUMNAS.find((c) => c.clave === clave)!

export default async function InfluencersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const ctx = await requireContext()
  const t = await getTranslations('influencers')
  const idioma = await getLocale()

  const orden = resolverOrden(COLUMNAS, params)

  // Un usuario sin acceso a la base global recibe 404, no una pantalla vacía.
  const { niches, countries, page, campanas, resumen } = await loadPage(async () => {
    const [nicheRows, countryRows] = await Promise.all([
      scoped(ctx, (tx) => tx.niche.findMany({ where: { active: true }, orderBy: { order: 'asc' } })),
      scoped(ctx, (tx) =>
        tx.influencer.findMany({
          where: { country: { not: null } },
          select: { country: true },
          distinct: ['country'],
          orderBy: { country: 'asc' },
          take: 60,
        }),
      ),
    ])
    const results = await searchInfluencers(
      ctx,
      {
        search: params.q?.trim() || null,
        countries: params.pais ? [params.pais] : null,
        platforms: params.plataforma ? [params.plataforma as never] : null,
        nicheKeys: params.nicho ? [params.nicho] : null,
        minFollowers: params.desde ? Number(params.desde) : null,
        maxFollowers: params.hasta ? Number(params.hasta) : null,
        minEngagement: params.er ? Number(params.er) : null,
        statuses: params.estado ? [params.estado as never] : null,
      },
      /*
       * Cuántos por página lo elige quien mira. Antes eran 30 fijos y revisar
       * una base de mil obligaba a pasar treinta y cuatro páginas: comparar
       * perfiles pide verlos juntos, y saltar de página pierde el hilo.
       */
      { page: Number(params.pagina ?? 1) || 1, pageSize: Number(params.porPagina ?? 30) || 30 },
      orden,
    )
    // Campañas abiertas donde este usuario puede sumar gente. Sin esto la base
    // era una lista para mirar: encontrabas a alguien útil y no podías hacer
    // nada con eso.
    const campanas = await listCampaigns(ctx, { status: ['DRAFT', 'BRIEFING', 'SCOUTING', 'PROPOSAL'] as never }, { pageSize: 50 })
    // Contadas en la base, no sumadas de la página que se está viendo.
    const resumen = await resumenDeLaBase(ctx, results.total)
    return { niches: nicheRows, countries: countryRows, page: results, campanas, resumen }
  })

  const canManage = can(ctx, 'influencer.manage', null)
  const verContactos = can(ctx, 'influencer.contact.view', null)
  const campanasElegibles = campanas.items
    .filter((campana) => can(ctx, 'candidate.manage', campana.clientId))
    .map((campana) => ({ id: campana.id, name: campana.name, clientName: campana.clientName }))
  const elegible = campanasElegibles.length > 0 || canManage
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => Boolean(value)) as [string, string][])

  return (
    <>
      <PageHeader
        title={t('titulo')}
        description={t('bajada')}
        actions={canManage ? <NewInfluencerDialog niches={niches.map((n) => ({ key: n.key, label: n.label }))} /> : null}
      />
      <div className="space-y-4 px-5 py-6 sm:px-8">
        {/*
          El acceso a Duplicados vivía en un botón del encabezado. Ahora está en
          la navegación de la sección, con su número al lado: dos caminos al
          mismo lugar hacían dudar de si eran lo mismo.
        */}
        <NavDeInfluencers ctx={ctx} activo="/influencers" />
        <StatStrip>
          <Stat
            label={t('statEnLaBase')}
            value={resumen.total}
            hint={
              resumen.filtrados !== resumen.total
                ? t('statConFiltros', { cantidad: formatNumber(resumen.filtrados, idioma) })
                : undefined
            }
          />
          <Stat label={t('statActivos')} value={resumen.activos} tone="good" />
          <Stat
            label={t('statSinActualizar')}
            value={resumen.sinActualizar}
            tone="warn"
            hint={t('statSinActualizarAyuda')}
          />
          <Stat label={t('statDuplicados')} value={resumen.duplicadosAbiertos} tone="accent" />
        </StatStrip>

        <InfluencerFilters
          niches={niches.map((n) => ({ key: n.key, label: n.label }))}
          countries={countries.map((c) => c.country).filter((c): c is string => Boolean(c))}
        />

        <Card>
          {page.items.length === 0 ? (
            <EmptyState
              title={t('vacioTitulo')}
              description={t('vacioBajada')}
            />
          ) : (
            <SeleccionDeInfluencers
              campanas={campanasElegibles}
              puedeGestionar={canManage}
              idsDeLaPagina={
                campanasElegibles.length > 0 || canManage ? page.items.map((influencer) => influencer.id) : []
              }
            >
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      {elegible ? <Th className="w-10" aria-label={t('elegir')} /> : null}
                      <ThOrdenable columna={columna('nombre')} orden={orden} base="/influencers" params={params} className={columnaFija}>
                        {t('colCreador')}
                      </ThOrdenable>
                      <ThOrdenable columna={columna('pais')} orden={orden} base="/influencers" params={params}>
                        {t('colPais')}
                      </ThOrdenable>
                      <Th>{t('colNichos')}</Th>
                      <Th>{t('colPerfiles')}</Th>
                      {/* Seguidores todavía no ordena: la cifra es la del perfil
                          principal y vive en otra tabla. Ver `OrdenDeInfluencers`. */}
                      <Th className="text-right">{t('colSeguidores')}</Th>
                      <Th className="text-right">{t('colEr')}</Th>
                      <ThOrdenable columna={columna('estado')} orden={orden} base="/influencers" params={params}>
                        {t('colEstado')}
                      </ThOrdenable>
                      {/*
                        * La columna sólo existe para quien puede ver contactos:
                        * el teléfono no viaja al navegador de quien no puede.
                        */}
                      {verContactos ? <Th className="w-12">{t('colContacto')}</Th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((influencer) => {
                      const main = influencer.profiles[0]
                      return (
                        <Tr key={influencer.id}>
                          {elegible ? (
                            <Td>
                              <CasillaDeFila id={influencer.id} nombre={influencer.displayName} />
                            </Td>
                          ) : null}
                          <Td className={columnaFija}>
                            <div className="flex items-center gap-2.5">
                              <Avatar name={influencer.displayName} />
                              <div className="min-w-0">
                                <Link
                                  href={`/influencers/${influencer.id}`}
                                  className="block truncate font-medium text-ink-900 underline-offset-4 hover:underline"
                                >
                                  {influencer.displayName}
                                </Link>
                                {influencer.primaryHandle &&
                                influencer.primaryHandle.toLowerCase() !==
                                  influencer.displayName.replace(/^@/, '').toLowerCase() ? (
                                  <p className="truncate text-xs text-ink-500">@{influencer.primaryHandle}</p>
                                ) : null}
                              </div>
                            </div>
                          </Td>
                          <Td className="text-sm">{influencer.country ?? '—'}</Td>
                          <Td>
                            <div className="flex flex-wrap gap-1">
                              {influencer.niches.slice(0, 3).map((niche) => (
                                <Badge key={niche} tone="slate">
                                  {niche}
                                </Badge>
                              ))}
                            </div>
                          </Td>
                          <Td className="text-xs">
                            <div className="flex flex-wrap gap-2">
                              {influencer.profiles.slice(0, 3).map((profile) => (
                                <ExternalLink key={profile.id} href={profile.url}>
                                  {profile.platform.toLowerCase()}
                                </ExternalLink>
                              ))}
                              {influencer.profiles.length === 0 ? <span className="text-ink-400">{t('sinPerfil')}</span> : null}
                            </div>
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatFollowers(main?.followers, idioma)}
                            {main?.stale ? (
                              <span
                                className="block text-[11px] font-medium text-amber-700"
                                title={t('sinActualizarTitulo')}
                              >
                                {t('sinActualizar')}
                              </span>
                            ) : null}
                          </Td>
                          <Td className="text-right tabular-nums">{formatPercent(main?.engagementRate, idioma)}</Td>
                          <Td>
                            <InfluencerStatusBadge status={influencer.status} />
                          </Td>
                          {verContactos ? (
                            <Td>
                              <ContactoDirecto
                                compacto
                                telefono={influencer.contact?.phone ?? null}
                                pais={influencer.country}
                                nombre={influencer.displayName}
                              />
                            </Td>
                          ) : null}
                        </Tr>
                      )
                    })}
                  </tbody>
                </Table>
              </TableWrap>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TamanoDePagina base="/influencers" params={query} actual={page.pageSize} total={page.total} />
                <Pagination
                  base="/influencers"
                  params={query}
                  page={page.page}
                  pageCount={page.pageCount}
                  total={page.total}
                  unidad={t('unidad')}
                />
              </div>
            </SeleccionDeInfluencers>
          )}
        </Card>
      </div>
    </>
  )
}
