import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Stat, StatStrip } from '@/components/ui/stat'
import { Pagination } from '@/components/ui/pagination'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { columnaFija, Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { ThOrdenable } from '@/components/ui/ordenar'
import { resolverOrden, type ColumnaOrdenable } from '@/lib/domain/orden'
import { ExternalLink, InfluencerStatusBadge } from '@/components/status-badge'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { can } from '@/lib/authz/context'
import { listCampaigns } from '@/lib/repos/campaigns'
import { resumenDeLaBase, searchInfluencers } from '@/lib/repos/influencers'
import { scoped } from '@/lib/repos/base'
import { formatFollowers, formatPercent } from '@/lib/util/format'
import { InfluencerFilters } from '../filters'
import { CasillaDeFila, SeleccionDeInfluencers } from '../seleccion'
import { NewInfluencerDialog } from '../new-influencer-dialog'

export const metadata: Metadata = { title: 'Influencers' }
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
      { page: Number(params.pagina ?? 1) || 1, pageSize: 30 },
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
  const campanasElegibles = campanas.items
    .filter((campana) => can(ctx, 'candidate.manage', campana.clientId))
    .map((campana) => ({ id: campana.id, name: campana.name, clientName: campana.clientName }))
  const elegible = campanasElegibles.length > 0 || canManage
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => Boolean(value)) as [string, string][])

  return (
    <>
      <PageHeader
        title="Base de influencers"
        description="Base única de la agencia. Un influencer existe una sola vez y participa en varias campañas."
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href="/influencers/duplicados">Posibles duplicados</Link>
            </Button>
            {canManage ? <NewInfluencerDialog niches={niches.map((n) => ({ key: n.key, label: n.label }))} /> : null}
          </>
        }
      />
      <div className="space-y-4 px-5 py-6 sm:px-8">
        <StatStrip>
          <Stat
            label="En la base"
            value={resumen.total}
            hint={resumen.filtrados !== resumen.total ? `${resumen.filtrados} con los filtros puestos` : undefined}
          />
          <Stat label="Activos" value={resumen.activos} tone="good" />
          <Stat
            label="Sin actualizar"
            value={resumen.sinActualizar}
            tone="warn"
            hint="Perfiles medidos hace más de 45 días"
          />
          <Stat label="Duplicados sin resolver" value={resumen.duplicadosAbiertos} tone="accent" />
        </StatStrip>

        <InfluencerFilters
          niches={niches.map((n) => ({ key: n.key, label: n.label }))}
          countries={countries.map((c) => c.country).filter((c): c is string => Boolean(c))}
        />

        <Card>
          {page.items.length === 0 ? (
            <EmptyState
              title="No hay influencers que coincidan"
              description="Probá con menos filtros, o importá el Excel de scouting desde Importación."
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
                      {elegible ? <Th className="w-10" aria-label="Elegir" /> : null}
                      <ThOrdenable columna={columna('nombre')} orden={orden} base="/influencers" params={params} className={columnaFija}>
                        Creador
                      </ThOrdenable>
                      <ThOrdenable columna={columna('pais')} orden={orden} base="/influencers" params={params}>
                        País
                      </ThOrdenable>
                      <Th>Nichos</Th>
                      <Th>Perfiles</Th>
                      {/* Seguidores todavía no ordena: la cifra es la del perfil
                          principal y vive en otra tabla. Ver `OrdenDeInfluencers`. */}
                      <Th className="text-right">Seguidores</Th>
                      <Th className="text-right">ER</Th>
                      <ThOrdenable columna={columna('estado')} orden={orden} base="/influencers" params={params}>
                        Estado
                      </ThOrdenable>
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
                              {influencer.profiles.length === 0 ? <span className="text-ink-400">sin perfil</span> : null}
                            </div>
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatFollowers(main?.followers)}
                            {main?.stale ? (
                              <span
                                className="block text-[11px] font-medium text-amber-700"
                                title="La última medición tiene más de 45 días"
                              >
                                sin actualizar
                              </span>
                            ) : null}
                          </Td>
                          <Td className="text-right tabular-nums">{formatPercent(main?.engagementRate)}</Td>
                          <Td>
                            <InfluencerStatusBadge status={influencer.status} />
                          </Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Table>
              </TableWrap>
              <Pagination
                base="/influencers"
                params={query}
                page={page.page}
                pageCount={page.pageCount}
                total={page.total}
                unidad="influencers"
              />
            </SeleccionDeInfluencers>
          )}
        </Card>
      </div>
    </>
  )
}
