import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState, InfoNote } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import type { PerfilDeBase, FiltrosDeBase, OrdenDeBase } from '@/lib/repos/base-conocimiento'
import type { Paginated } from '@/lib/repos/base'

/**
 * La base de conocimiento, en pantalla.
 *
 * Los filtros viven en la URL a propósito: una búsqueda se puede guardar en
 * favoritos, mandar por mensaje y volver atrás sin perderla. Es un formulario
 * GET, sin estado en el navegador, que además la hace funcionar sin JavaScript.
 */

const REDES = [
  { valor: '', etiqueta: 'Todas' },
  { valor: 'INSTAGRAM', etiqueta: 'Instagram' },
  { valor: 'TIKTOK', etiqueta: 'TikTok' },
  { valor: 'YOUTUBE', etiqueta: 'YouTube' },
  { valor: 'TWITCH', etiqueta: 'Twitch' },
  { valor: 'X', etiqueta: 'X' },
]

const ORDENES: { valor: OrdenDeBase; etiqueta: string }[] = [
  { valor: 'RECIENTE', etiqueta: 'Visto más recientemente' },
  { valor: 'SEGUIDORES_DESC', etiqueta: 'Más seguidores' },
  { valor: 'SEGUIDORES_ASC', etiqueta: 'Menos seguidores' },
  { valor: 'ENGAGEMENT_DESC', etiqueta: 'Mejor engagement' },
  { valor: 'VECES_VISTO', etiqueta: 'Apareció más veces' },
  { valor: 'NOMBRE', etiqueta: 'Nombre' },
]

const numero = (valor: number | null): string =>
  valor === null ? '—' : new Intl.NumberFormat('es-AR').format(valor)

export function BaseDeConocimiento({
  resultados,
  filtros,
  params,
  totalEnBase,
}: {
  resultados: Paginated<PerfilDeBase>
  filtros: FiltrosDeBase
  params: Record<string, string | string[] | undefined>
  /** Cuántos perfiles hay en total, sin filtrar. */
  totalEnBase: number
}) {
  const hayFiltros = Object.entries(filtros).some(
    ([clave, valor]) =>
      clave !== 'orden' &&
      valor !== null &&
      valor !== undefined &&
      valor !== '' &&
      valor !== 'CUALQUIERA' &&
      !(Array.isArray(valor) && valor.length === 0),
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Lo que ya sabemos</CardTitle>
          <CardDescription>
            {totalEnBase === 0
              ? 'Todavía está vacía. Cada búsqueda que ejecutes deja acá lo que encontró.'
              : `${numero(totalEnBase)} perfiles guardados de todas las búsquedas hechas hasta ahora. Buscar acá no cuesta nada.`}
          </CardDescription>
        </CardHeader>

        <CardBody>
          <form method="get" className="space-y-4">
            <input type="hidden" name="tab" value="base" />

            <Field label="Buscar" htmlFor="q" hint="Usuario, nombre o algo que diga su bio.">
              <Input id="q" name="q" defaultValue={filtros.texto ?? ''} placeholder="panadería, nutrición, Córdoba…" />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Red" htmlFor="red">
                <Select id="red" name="red" defaultValue={filtros.platform ?? ''}>
                  {REDES.map((r) => (
                    <option key={r.valor} value={r.valor}>
                      {r.etiqueta}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="País" htmlFor="pais">
                <Input id="pais" name="pais" defaultValue={filtros.pais ?? ''} placeholder="AR" maxLength={40} />
              </Field>

              <Field label="Seguidores desde" htmlFor="segDesde">
                <Input
                  id="segDesde"
                  name="segDesde"
                  type="number"
                  min={0}
                  defaultValue={filtros.seguidoresDesde ?? ''}
                />
              </Field>

              <Field label="Seguidores hasta" htmlFor="segHasta">
                <Input
                  id="segHasta"
                  name="segHasta"
                  type="number"
                  min={0}
                  defaultValue={filtros.seguidoresHasta ?? ''}
                />
              </Field>

              <Field label="Engagement mínimo" htmlFor="erDesde" hint="En porcentaje.">
                <Input id="erDesde" name="erDesde" type="number" min={0} step="0.1" defaultValue={filtros.engagementDesde ?? ''} />
              </Field>

              <Field label="Engagement máximo" htmlFor="erHasta" hint="En porcentaje.">
                <Input id="erHasta" name="erHasta" type="number" min={0} step="0.1" defaultValue={filtros.engagementHasta ?? ''} />
              </Field>

              <Field label="Palabras" htmlFor="palabras" hint="Con las que apareció. Separadas por coma.">
                <Input id="palabras" name="palabras" defaultValue={(filtros.palabras ?? []).join(', ')} />
              </Field>

              <Field label="Intereses" htmlFor="intereses" hint="Separados por coma.">
                <Input id="intereses" name="intereses" defaultValue={(filtros.intereses ?? []).join(', ')} />
              </Field>

              <Field label="Ya en el padrón" htmlFor="padron">
                <Select id="padron" name="padron" defaultValue={filtros.enPadron ?? 'CUALQUIERA'}>
                  <option value="CUALQUIERA">No importa</option>
                  <option value="SI">Sí, ya es influencer nuestro</option>
                  <option value="NO">Todavía no</option>
                </Select>
              </Field>

              <Field label="Trabajó en campañas" htmlFor="campanas">
                <Select id="campanas" name="campanas" defaultValue={filtros.conCampanas ?? 'CUALQUIERA'}>
                  <option value="CUALQUIERA">No importa</option>
                  <option value="SI">Sí</option>
                  <option value="NO">Nunca</option>
                </Select>
              </Field>

              <Field label="Visto" htmlFor="visto">
                <Select id="visto" name="visto" defaultValue={filtros.visto ?? 'CUALQUIERA'}>
                  <option value="CUALQUIERA">Alguna vez</option>
                  <option value="ULTIMOS_30">En los últimos 30 días</option>
                  <option value="ULTIMOS_90">En los últimos 90 días</option>
                </Select>
              </Field>

              <Field label="Ordenar por" htmlFor="orden">
                <Select id="orden" name="orden" defaultValue={filtros.orden ?? 'RECIENTE'}>
                  {ORDENES.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.etiqueta}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm">
                Buscar en la base
              </Button>
              {hayFiltros ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/scouting?tab=base">Limpiar filtros</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </CardBody>
      </Card>

      {resultados.items.length === 0 ? (
        <Card>
          <CardBody>
            {totalEnBase === 0 ? (
              <EmptyState
                title="La base todavía está vacía"
                description="Se llena sola: cada búsqueda que ejecutes en la pestaña Buscar guarda acá lo que encontró, con las palabras que usaste. La idea es que con el tiempo tengas que preguntarle cada vez menos a los proveedores."
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/scouting">Hacer la primera búsqueda</Link>
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="Ningún perfil guardado cumple con eso"
                description="Probá aflojando algún filtro. Si de verdad no lo tenemos, hay que buscarlo con un proveedor: eso sí cuesta."
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/scouting">Buscar con un proveedor</Link>
                  </Button>
                }
              />
            )}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="p-0">
            <TableWrap>
              <Table>
                <thead>
                  <Tr>
                    <Th>Perfil</Th>
                    <Th className="text-right">Seguidores</Th>
                    <Th className="text-right">Engagement</Th>
                    <Th>País</Th>
                    <Th>Apareció con</Th>
                    <Th className="text-right">Veces</Th>
                    <Th>Estado</Th>
                  </Tr>
                </thead>
                <tbody>
                  {resultados.items.map((perfil) => (
                    <Tr key={perfil.id}>
                      <Td>
                        <div className="flex flex-col">
                          <Link
                            href={`/scouting/base/${perfil.id}`}
                            className="font-medium text-fg hover:underline"
                          >
                            {perfil.handle ? `@${perfil.handle}` : (perfil.displayName ?? 'Sin nombre')}
                          </Link>
                          {perfil.displayName && perfil.handle ? (
                            <span className="text-xs text-muted">{perfil.displayName}</span>
                          ) : null}
                          <span className="text-xs text-muted">{perfil.platform}</span>
                        </div>
                      </Td>
                      <Td className="text-right tabular-nums">{numero(perfil.followers)}</Td>
                      <Td className="text-right tabular-nums">
                        {perfil.engagementRate === null ? '—' : `${perfil.engagementRate.toFixed(2)} %`}
                      </Td>
                      <Td>{perfil.country ?? <span className="text-muted">no dice</span>}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {perfil.keywords.slice(0, 4).map((palabra) => (
                            <Badge key={palabra} tone="slate">
                              {palabra}
                            </Badge>
                          ))}
                          {perfil.keywords.length > 4 ? (
                            <span className="text-xs text-muted">+{perfil.keywords.length - 4}</span>
                          ) : null}
                        </div>
                      </Td>
                      <Td className="text-right tabular-nums">{perfil.timesSeen}</Td>
                      <Td>
                        {perfil.influencerId ? (
                          <div className="flex flex-col gap-1">
                            <Link href={`/influencers/${perfil.influencerId}`}>
                              <Badge tone="green">En el padrón</Badge>
                            </Link>
                            {perfil.campanas > 0 ? (
                              <span className="text-xs text-muted">
                                {perfil.campanas} {perfil.campanas === 1 ? 'campaña' : 'campañas'}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <Badge tone="slate">Sólo descubierto</Badge>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </CardBody>
        </Card>
      )}

      {resultados.pageCount > 1 ? (
        <Pagination
          base="/scouting"
          params={params}
          page={resultados.page}
          pageCount={resultados.pageCount}
          total={resultados.total}
          unidad="perfiles"
        />
      ) : null}

      <InfoNote>
        Esta base es de la agencia y no la ve ningún cliente. Los números son los de la última vez que un proveedor
        miró ese perfil: cuando dice “—” es porque no lo informó, no porque sea cero.
      </InfoNote>
    </div>
  )
}
