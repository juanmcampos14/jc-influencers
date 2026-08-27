import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/app-shell'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Pagination } from '@/components/ui/pagination'
import { Stat, StatStrip } from '@/components/ui/stat'
import { columnaFija, Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { ThOrdenable } from '@/components/ui/ordenar'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { can } from '@/lib/authz/context'
import { resolverOrden, type ColumnaOrdenable } from '@/lib/domain/orden'
import { platformLabel } from '@/lib/domain/labels'
import { buscarEnBase, resumenDeDescubiertos, type ClaveDeOrden, type FiltrosDeBase } from '@/lib/repos/base-conocimiento'
import { formatFollowers, formatPercent } from '@/lib/util/format'
import type { Platform } from '@/generated/prisma/enums'
import { NavDeInfluencers } from '../../sub-nav'
import { FiltrosDeDescubiertos } from './filtros'

export const metadata: Metadata = { title: 'Descubiertos' }
export const dynamic = 'force-dynamic'

/**
 * Los perfiles que trajeron las búsquedas y todavía no incorporamos.
 *
 * Vive al lado del padrón porque es la misma gente en otra etapa: un
 * descubierto que se importa se convierte en influencer. Por eso comparte la
 * tabla, el orden por columnas y el formato de números con el padrón --antes
 * eran dos listas de personas con dos formas distintas de ordenar y filtrar lo
 * mismo--.
 */

const COLUMNAS: ReadonlyArray<ColumnaOrdenable<ClaveDeOrden>> = [
  { clave: 'visto', porDefecto: 'desc' },
  { clave: 'nombre' },
  { clave: 'seguidores', porDefecto: 'desc' },
  { clave: 'engagement', porDefecto: 'desc' },
  { clave: 'veces', porDefecto: 'desc' },
]

const columna = (clave: ClaveDeOrden): ColumnaOrdenable<ClaveDeOrden> =>
  COLUMNAS.find((c) => c.clave === clave)!

const REDES_VALIDAS = new Set<string>(['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'TWITCH', 'X'])

export default async function DescubiertosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const ctx = await requireContext()

  const orden = resolverOrden(COLUMNAS, params)
  const filtros = leerFiltros(params, orden)
  const pagina = Math.max(1, numero(params.pagina) ?? 1)

  const { resultados, resumen } = await loadPage(async () => ({
    resultados: await buscarEnBase(ctx, filtros, { page: pagina, pageSize: 25 }),
    resumen: await resumenDeDescubiertos(ctx),
  }))

  const puedeBuscar = ctx.clients.some((client) => can(ctx, 'scouting.run', client.id))

  return (
    <>
      <PageHeader
        title="Influencers"
        description="Perfiles que trajeron las búsquedas. Buscar acá no cuesta nada: esto ya está pago."
      />
      <div className="space-y-4 px-5 py-6 sm:px-8">
        <NavDeInfluencers ctx={ctx} activo="/influencers/descubiertos" />

        <StatStrip>
          <Stat label="En la base" value={resumen.total} />
          <Stat label="Con estos filtros" value={resultados.total} />
          <Stat label="Todavía sin incorporar" value={resumen.sinIncorporar} tone="accent" />
          <Stat label="Vistos en 30 días" value={resumen.recientes} />
        </StatStrip>

        <FiltrosDeDescubiertos filtros={filtros} />

        {resultados.items.length === 0 ? (
          <Card>
            {resumen.total === 0 ? (
              <EmptyState
                title="Todavía no descubrimos a nadie"
                description="Esto se llena solo: cada búsqueda guarda acá lo que encontró, junto con las palabras que usaste. La idea es que con el tiempo tengas que preguntarle cada vez menos a los proveedores."
                action={
                  puedeBuscar ? (
                    <Button asChild variant="secondary" size="sm">
                      <Link href="/influencers/buscar">Hacer la primera búsqueda</Link>
                    </Button>
                  ) : null
                }
              />
            ) : (
              <EmptyState
                title="Ninguno de los que tenemos cumple con eso"
                description="Probá aflojando algún filtro. Si de verdad no lo tenemos, hay que salir a buscarlo: eso sí cuesta."
                action={
                  puedeBuscar ? (
                    <Button asChild variant="secondary" size="sm">
                      <Link href="/influencers/buscar">Buscar con un proveedor</Link>
                    </Button>
                  ) : null
                }
              />
            )}
          </Card>
        ) : (
          <Card className="p-0">
            <TableWrap>
              <Table>
                <thead>
                  <Tr>
                    <ThOrdenable
                      columna={columna('nombre')}
                      orden={orden}
                      base="/influencers/descubiertos"
                      params={params}
                      className={columnaFija}
                    >
                      Perfil
                    </ThOrdenable>
                    <Th>Red</Th>
                    <Th>País</Th>
                    <ThOrdenable
                      columna={columna('seguidores')}
                      orden={orden}
                      base="/influencers/descubiertos"
                      params={params}
                      alineado="derecha"
                    >
                      Seguidores
                    </ThOrdenable>
                    <ThOrdenable
                      columna={columna('engagement')}
                      orden={orden}
                      base="/influencers/descubiertos"
                      params={params}
                      alineado="derecha"
                    >
                      ER
                    </ThOrdenable>
                    <Th>Apareció buscando</Th>
                    <ThOrdenable
                      columna={columna('veces')}
                      orden={orden}
                      base="/influencers/descubiertos"
                      params={params}
                      alineado="derecha"
                    >
                      Veces
                    </ThOrdenable>
                    <Th>Estado</Th>
                  </Tr>
                </thead>
                <tbody>
                  {resultados.items.map((perfil) => {
                    const nombre = perfil.displayName ?? perfil.handle ?? 'Sin nombre'
                    const ficha = `/influencers/descubiertos/${perfil.id}`
                    return (
                      <Tr key={perfil.id}>
                        <Td className={columnaFija}>
                          <Link href={ficha} className="flex items-center gap-3">
                            <Avatar name={nombre} src={perfil.profileImageUrl} size="sm" />
                            <span className="flex flex-col">
                              <span className="font-medium text-ink-900">{nombre}</span>
                              {perfil.handle ? (
                                <span className="text-xs text-ink-600">@{perfil.handle}</span>
                              ) : null}
                            </span>
                          </Link>
                        </Td>
                        <Td>{platformLabel(perfil.platform)}</Td>
                        <Td>{perfil.country ?? <span className="text-ink-600">no dice</span>}</Td>
                        <Td className="text-right tabular-nums">{formatFollowers(perfil.followers)}</Td>
                        <Td className="text-right tabular-nums">{formatPercent(perfil.engagementRate)}</Td>
                        <Td>
                          {perfil.keywords.length === 0 ? (
                            <span className="text-ink-600">—</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              {perfil.keywords.slice(0, 3).map((palabra) => (
                                <Badge key={palabra} tone="slate">
                                  {palabra}
                                </Badge>
                              ))}
                              {/*
                                El "+n" es un enlace a la ficha, donde están todas.
                                Un contador que sólo dice cuántas faltan esconde
                                valores sin dar forma de verlos.
                              */}
                              {perfil.keywords.length > 3 ? (
                                <Link href={ficha} className="text-xs text-ink-600 underline hover:text-ink-900">
                                  +{perfil.keywords.length - 3}
                                </Link>
                              ) : null}
                            </div>
                          )}
                        </Td>
                        <Td className="text-right tabular-nums">{perfil.timesSeen}</Td>
                        <Td>
                          {perfil.influencerId ? (
                            <div className="flex flex-col gap-1">
                              <Link href={`/influencers/${perfil.influencerId}`} className="w-fit">
                                <Badge tone="green">En el padrón</Badge>
                              </Link>
                              {perfil.campanas > 0 ? (
                                <span className="text-xs text-ink-600">
                                  {perfil.campanas} {perfil.campanas === 1 ? 'campaña' : 'campañas'}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <Badge tone="slate">Sin incorporar</Badge>
                          )}
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
        )}

        {resultados.pageCount > 1 ? (
          <Pagination
            base="/influencers/descubiertos"
            params={params}
            page={resultados.page}
            pageCount={resultados.pageCount}
            total={resultados.total}
            unidad="perfiles"
          />
        ) : null}
      </div>
    </>
  )
}

/** Un parámetro de la URL puede venir repetido; se toma el primero. */
function texto(valor: string | string[] | undefined): string | null {
  const crudo = Array.isArray(valor) ? valor[0] : valor
  const limpio = crudo?.trim()
  return limpio ? limpio : null
}

function numero(valor: string | string[] | undefined): number | null {
  const crudo = texto(valor)
  if (crudo === null) return null
  const n = Number(crudo)
  return Number.isFinite(n) ? n : null
}

function lista(valor: string | string[] | undefined): string[] {
  const crudo = texto(valor)
  if (crudo === null) return []
  return crudo
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

/**
 * Lee los filtros de la URL.
 *
 * Todo lo que viene de la barra de direcciones se valida contra una lista
 * cerrada. Un valor inventado se ignora en vez de llegar a la consulta: la URL
 * la escribe cualquiera.
 */
function leerFiltros(
  params: Record<string, string | string[] | undefined>,
  orden: FiltrosDeBase['orden'],
): FiltrosDeBase {
  const red = texto(params.red)
  const opcion = <T extends string>(valor: string | null, validos: readonly T[]): T | undefined =>
    valor !== null && (validos as readonly string[]).includes(valor) ? (valor as T) : undefined

  return {
    texto: texto(params.q),
    platform: red !== null && REDES_VALIDAS.has(red) ? (red as Platform) : null,
    pais: texto(params.pais),
    seguidoresDesde: numero(params.segDesde),
    seguidoresHasta: numero(params.segHasta),
    engagementDesde: numero(params.erDesde),
    engagementHasta: numero(params.erHasta),
    palabras: lista(params.palabras),
    intereses: lista(params.intereses),
    proveedor: opcion(texto(params.proveedor), ['apify', 'brightdata', 'hypeauditor'] as const) ?? null,
    enPadron: opcion(texto(params.padron), ['CUALQUIERA', 'SI', 'NO'] as const),
    conCampanas: opcion(texto(params.campanas), ['CUALQUIERA', 'SI', 'NO'] as const),
    visto: opcion(texto(params.visto), ['CUALQUIERA', 'ULTIMOS_30', 'ULTIMOS_90'] as const),
    orden,
  }
}
