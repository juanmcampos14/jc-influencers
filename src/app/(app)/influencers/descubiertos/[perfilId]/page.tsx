import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/app-shell'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { EmptyState, InfoNote } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { NotFoundError } from '@/lib/authz/errors'
import { fichaDeBase } from '@/lib/repos/base-conocimiento'
import { formatDate, formatPercent } from '@/lib/util/format'
import { platformLabel } from '@/lib/domain/labels'
import { NavDeInfluencers } from '../../sub-nav'

export const metadata: Metadata = { title: 'Perfil en la base' }
export const dynamic = 'force-dynamic'

/*
 * La ficha muestra el número EXACTO de seguidores, no el abreviado de la lista:
 * ahí se escanea --"941 k" alcanza-- y acá se mira un perfil concreto. El resto
 * de los formatos son los compartidos, para que un porcentaje se escriba igual
 * en las dos pantallas.
 */
const exacto = (valor: number | null): string =>
  valor === null ? 'sin dato' : new Intl.NumberFormat('es-AR').format(valor)

const plata = (valor: number, moneda: string): string =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda }).format(valor)

/**
 * La ficha de un perfil de la base.
 *
 * Junta las dos mitades de lo que sabemos de alguien: lo que averiguamos
 * pagándole a un proveedor --sus números, y cómo fueron cambiando-- y lo que
 * aprendimos trabajando con él --campañas, plata--.
 *
 * La segunda mitad se LEE de las campañas, no se copia acá. Si se copiara,
 * tarde o temprano diría una cifra distinta a la de la pantalla de la campaña,
 * y entonces habría dos verdades sobre la misma plata.
 */
export default async function PerfilDeBasePage({ params }: { params: Promise<{ perfilId: string }> }) {
  const { perfilId } = await params
  const ctx = await requireContext()

  const ficha = await loadPage(async () => {
    try {
      return await fichaDeBase(ctx, perfilId)
    } catch (error) {
      if (error instanceof NotFoundError) return null
      throw error
    }
  })
  if (!ficha) notFound()

  const { perfil, historialDeMetricas, campanas } = ficha
  const nombre = perfil.handle ? `@${perfil.handle}` : (perfil.displayName ?? 'Perfil sin nombre')

  return (
    <>
      <PageHeader
        title={nombre}
        description={perfil.displayName && perfil.handle ? perfil.displayName : undefined}
      />
      <div className="space-y-4 px-5 py-6 sm:px-8">
        <NavDeInfluencers ctx={ctx} activo="/influencers/descubiertos" />
        <Button asChild variant="ghost" size="sm">
          <Link href="/influencers/descubiertos">← Volver a Descubiertos</Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Lo que sabemos</CardTitle>
            <CardDescription>
              {/*
                Cuando el primer y el último avistaje caen el mismo día, decir
                "entre el 27 y el 27" suena a error de cálculo.
              */}
              Visto {perfil.timesSeen} {perfil.timesSeen === 1 ? 'vez' : 'veces'}
              {formatDate(perfil.firstSeenAt) === formatDate(perfil.lastSeenAt)
                ? `, el ${formatDate(perfil.lastSeenAt)}.`
                : `, entre el ${formatDate(perfil.firstSeenAt)} y el ${formatDate(perfil.lastSeenAt)}.`}
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={perfil.displayName ?? perfil.handle ?? 'Perfil'} src={perfil.profileImageUrl} size="lg" />
              <div>
                <p className="text-sm font-medium text-ink-900">{perfil.displayName ?? '—'}</p>
                {perfil.handle ? <p className="text-xs text-ink-600">@{perfil.handle}</p> : null}
              </div>
            </div>

            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Dato titulo="Red" valor={platformLabel(perfil.platform)} />
              <Dato titulo="Seguidores" valor={exacto(perfil.followers)} />
              <Dato titulo="Engagement" valor={formatPercent(perfil.engagementRate)} />
              <Dato titulo="País" valor={perfil.country ?? 'no lo dice'} />
            </dl>

            {perfil.bio ? <p className="text-sm text-fg">{perfil.bio}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="secondary" size="sm">
                <a href={perfil.url} target="_blank" rel="noopener noreferrer nofollow">
                  Ver el perfil
                </a>
              </Button>
              {perfil.influencerId ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/influencers/${perfil.influencerId}`}>Ficha del influencer</Link>
                </Button>
              ) : (
                <Badge tone="slate">Todavía no está en el padrón</Badge>
              )}
            </div>

            {perfil.keywords.length > 0 ? (
              <Grupo titulo="Apareció buscando" items={perfil.keywords} />
            ) : null}
            {perfil.interests.length > 0 ? <Grupo titulo="Intereses" items={perfil.interests} /> : null}
            <Grupo titulo="Lo trajo" items={perfil.providers} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cómo fueron cambiando sus números</CardTitle>
            <CardDescription>
              Se anota cada vez que un proveedor lo mide y el número cambió. Con el tiempo esto contesta gratis si
              crece o cae.
            </CardDescription>
          </CardHeader>
          <CardBody className={historialDeMetricas.length > 0 ? 'p-0' : undefined}>
            {historialDeMetricas.length === 0 ? (
              <EmptyState
                title="Todavía no hay historia"
                description="Hace falta que otra búsqueda lo vuelva a encontrar con números distintos."
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <Tr>
                      <Th>Cuándo</Th>
                      <Th className="text-right">Seguidores</Th>
                      <Th className="text-right">Engagement</Th>
                      <Th>Quién lo midió</Th>
                    </Tr>
                  </thead>
                  <tbody>
                    {historialDeMetricas.map((m, indice) => {
                      const anterior = historialDeMetricas[indice - 1]
                      const delta =
                        anterior && anterior.followers !== null && m.followers !== null
                          ? m.followers - anterior.followers
                          : null
                      return (
                        <Tr key={`${m.seenAt.toISOString()}-${indice}`}>
                          <Td>{formatDate(m.seenAt)}</Td>
                          <Td className="text-right tabular-nums">
                            {exacto(m.followers)}
                            {delta !== null && delta !== 0 ? (
                              <span className={delta > 0 ? 'ml-2 text-xs text-green-600' : 'ml-2 text-xs text-red-600'}>
                                {delta > 0 ? '+' : ''}
                                {new Intl.NumberFormat('es-AR').format(delta)}
                              </span>
                            ) : null}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatPercent(m.engagementRate)}
                          </Td>
                          <Td>{m.provider}</Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historial de trabajo</CardTitle>
            <CardDescription>
              Campañas en las que participó y lo que se le pagó. Se lee de cada campaña, así que siempre coincide con
              lo que muestra la campaña.
            </CardDescription>
          </CardHeader>
          <CardBody className={campanas.length > 0 ? 'p-0' : undefined}>
            {campanas.length === 0 ? (
              <EmptyState
                title={perfil.influencerId ? 'Todavía no trabajó con nosotros' : 'Todavía no está en el padrón'}
                description={
                  perfil.influencerId
                    ? 'Cuando entre a una campaña, va a aparecer acá con sus pagos.'
                    : 'Importalo desde una búsqueda para poder sumarlo a una campaña. A partir de ahí, todo lo que pase con él se anota acá.'
                }
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <Tr>
                      <Th>Campaña</Th>
                      <Th>Cliente</Th>
                      <Th>Estado</Th>
                      <Th>Publicó</Th>
                      <Th className="text-right">Pagado</Th>
                      <Th className="text-right">Pendiente</Th>
                    </Tr>
                  </thead>
                  <tbody>
                    {campanas.map((c) => (
                      <Tr key={c.campaignId}>
                        <Td>
                          <Link href={`/campanas/${c.campaignId}`} className="font-medium hover:underline">
                            {c.campana}
                          </Link>
                        </Td>
                        <Td>{c.cliente}</Td>
                        <Td>{c.estado}</Td>
                        <Td>{c.publicadoEl ? formatDate(c.publicadoEl) : <span className="text-muted">todavía no</span>}</Td>
                        <Td className="text-right tabular-nums">
                          {c.pagos.length === 0 ? (
                            <span className="text-muted">sin movimientos</span>
                          ) : (
                            c.pagos.map((p) => <div key={`${p.moneda}-pagado`}>{plata(p.pagado, p.moneda)}</div>)
                          )}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {c.pagos.map((p) => (
                            <div key={`${p.moneda}-pendiente`}>{plata(p.pendiente, p.moneda)}</div>
                          ))}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </CardBody>
        </Card>

        <InfoNote>
          Los importes se muestran por moneda y no se suman entre sí: convertirlos a un tipo de cambio inventado
          daría una cifra que nadie puede verificar.
        </InfoNote>
      </div>
    </>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{titulo}</dt>
      <dd className="mt-1 text-sm font-medium text-fg tabular-nums">{valor}</dd>
    </div>
  )
}

function Grupo({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-muted">{titulo}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <Badge key={item} tone="slate">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  )
}
