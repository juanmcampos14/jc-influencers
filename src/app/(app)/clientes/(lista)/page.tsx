import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { PageHeader } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { Stat, StatStrip } from '@/components/ui/stat'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { ThOrdenable } from '@/components/ui/ordenar'
import { resolverOrden, type ColumnaOrdenable } from '@/lib/domain/orden'
import { hrefCon } from '@/lib/util/query'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { can } from '@/lib/authz/context'
import { listClients, pendientesPorCliente } from '@/lib/repos/clients'
import { NewClientDialog } from '../new-client-dialog'
import { CasillaDeFila, SeleccionDeClientes } from '../acciones-de-lote'

/**
 * El título de la pestaña también está traducido: se lee en el navegador, en
 * los favoritos y en el historial.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titulos')
  return { title: t('clientes') }
}
export const dynamic = 'force-dynamic'

type Clave = 'nombre' | 'activas' | 'pendientes' | 'accesos'

const COLUMNAS: ReadonlyArray<ColumnaOrdenable<Clave>> = [
  { clave: 'nombre' },
  { clave: 'activas', porDefecto: 'desc' },
  { clave: 'pendientes', porDefecto: 'desc' },
  { clave: 'accesos', porDefecto: 'desc' },
]

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const ctx = await requireContext()
  const t = await getTranslations('clientes')
  const idioma = await getLocale()
  const [clients, pendientes] = await loadPage(() =>
    Promise.all([listClients(ctx), pendientesPorCliente(ctx)]),
  )
  const canManage = ctx.allClients && can(ctx, 'client.manage', null)

  /*
   * Los archivados se esconden por defecto pero NO se descuentan en silencio:
   * si hay alguno, la pantalla dice cuántos y ofrece verlos. Un filtro que no
   * se anuncia hace que "5 clientes" signifique cosas distintas según quién
   * mire.
   */
  const verArchivados = params.estado === 'archivados'
  const archivados = clients.filter((client) => client.status === 'ARCHIVED')
  const visibles = verArchivados ? archivados : clients.filter((client) => client.status !== 'ARCHIVED')

  const orden = resolverOrden(COLUMNAS, params)
  const signo = orden.direccion === 'asc' ? 1 : -1
  const ordenados = [...visibles].sort((a, b) => {
    switch (orden.clave) {
      case 'activas':
        return signo * (a.activeCampaignCount - b.activeCampaignCount)
      case 'pendientes':
        return signo * ((pendientes.get(a.id) ?? 0) - (pendientes.get(b.id) ?? 0))
      case 'accesos':
        return signo * (a.userCount - b.userCount)
      default:
        return signo * a.name.localeCompare(b.name, idioma)
    }
  })

  // Las cifras miran lo que se está viendo, y el encabezado dice cuál es.
  const campanasActivas = visibles.reduce((suma, client) => suma + client.activeCampaignCount, 0)
  const totalPendientes = visibles.reduce((suma, client) => suma + (pendientes.get(client.id) ?? 0), 0)

  return (
    <>
      <PageHeader
        title={t('titulo')}
        description={t('bajada')}
        actions={canManage ? <NewClientDialog /> : null}
      />
      <div className="space-y-4 px-5 py-6 sm:px-8">
        <StatStrip>
          <Stat label={verArchivados ? t('statArchivados') : t('statActivos')} value={visibles.length} />
          <Stat label={t('statCampanasActivas')} value={campanasActivas} />
          <Stat
            label={t('statEsperandoDecision')}
            value={totalPendientes}
            tone="accent"
            hint={t('statEsperandoDecisionAyuda')}
          />
          {/*
            * "Accesos" y no "Usuarios": son membresías, y una persona que
            * trabaja en dos clientes cuenta dos veces.
            */}
          <Stat label={t('statAccesos')} value={visibles.reduce((s, c) => s + c.userCount, 0)} />
        </StatStrip>

        {archivados.length > 0 ? (
          <p className="text-xs text-ink-500">
            {verArchivados ? (
              <Link href={hrefCon('/clientes', params, { estado: null })} className="underline underline-offset-4">
                {t('volverActivos')}
              </Link>
            ) : (
              <Link href={hrefCon('/clientes', params, { estado: 'archivados' })} className="underline underline-offset-4">
                {t('verArchivados', { cantidad: archivados.length })}
              </Link>
            )}
          </p>
        ) : null}

        <Card>
          {ordenados.length === 0 ? (
            <EmptyState
              action={canManage ? <NewClientDialog /> : null}
              title={canManage ? t('vacioTitulo') : t('sinAsignadosTitulo')}
              description={canManage ? t('vacioBajada') : t('sinAsignadosBajada')}
            />
          ) : (
            <SeleccionDeClientes idsDeLaPagina={canManage ? ordenados.map((client) => client.id) : []}>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    {canManage ? <Th className="w-10"><span className="sr-only">{t('elegir')}</span></Th> : null}
                    <ThOrdenable columna={COLUMNAS[0]!} orden={orden} base="/clientes" params={params}>
                      {t('colCliente')}
                    </ThOrdenable>
                    <Th>{t('colPaisMercados')}</Th>
                    {/* "2 / 7" bajo un encabezado que decía sólo "Campañas" no
                        dejaba saber si el primero eran las activas o el total. */}
                    <ThOrdenable columna={COLUMNAS[1]!} orden={orden} base="/clientes" params={params} className="text-right" alineado="derecha">
                      {t('colCampanas')}
                    </ThOrdenable>
                    <ThOrdenable columna={COLUMNAS[2]!} orden={orden} base="/clientes" params={params} className="text-right" alineado="derecha">
                      {t('statEsperandoDecision')}
                    </ThOrdenable>
                    <ThOrdenable columna={COLUMNAS[3]!} orden={orden} base="/clientes" params={params} className="text-right" alineado="derecha">
                      {t('colAccesos')}
                    </ThOrdenable>
                    <Th>{t('colIdentidad')}</Th>
                    <Th>{t('colPermisos')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {ordenados.map((client) => (
                    <Tr key={client.id}>
                      {canManage ? (
                        <Td>
                          <CasillaDeFila id={client.id} nombre={client.name} />
                        </Td>
                      ) : null}
                      <Td>
                        <span className="flex items-center gap-2.5">
                          {/*
                            * Punto de color con la marca del cliente. Sin él no
                            * había forma de ver a cuáles les falta su identidad
                            * sin entrar uno por uno.
                            */}
                          <span
                            aria-hidden="true"
                            className="size-2.5 shrink-0 rounded-full border border-ink-300"
                            style={client.brandColor ? { backgroundColor: client.brandColor } : undefined}
                          />
                          <Link
                            href={`/clientes/${client.id}`}
                            className="font-medium text-ink-900 underline-offset-4 hover:underline"
                          >
                            {client.name}
                          </Link>
                          {client.status === 'ARCHIVED' ? <Badge tone="slate">{t('archivado')}</Badge> : null}
                        </span>
                        {/* El slug es un identificador técnico: se ve en el
                            detalle, no hace falta repetirlo en la lista. */}
                      </Td>
                      <Td>
                        <span className="text-sm">{client.country ?? '—'}</span>
                        {client.markets.length > 0 ? (
                          <p className="text-xs text-ink-500">{client.markets.join(', ')}</p>
                        ) : null}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {client.activeCampaignCount} / {client.campaignCount}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {(pendientes.get(client.id) ?? 0) > 0 ? (
                          <span className="font-medium text-amber-700">{pendientes.get(client.id)}</span>
                        ) : (
                          <span className="text-ink-400">0</span>
                        )}
                      </Td>
                      {/* Un cliente sin accesos no puede aprobar nada: es el
                          hallazgo más accionable de esta tabla. */}
                      <Td className="text-right tabular-nums">
                        {client.userCount === 0 ? (
                          <Link
                            href="/usuarios"
                            className="text-amber-700 underline decoration-amber-300 underline-offset-4 hover:decoration-amber-700"
                          >
                            {t('sinAccesos')}
                          </Link>
                        ) : (
                          client.userCount
                        )}
                      </Td>
                      <Td className="text-xs">
                        {client.brandColor ? (
                          <span className="text-ink-600">{t('identidadPropia')}</span>
                        ) : (
                          <Link
                            href={`/clientes/${client.id}/marca`}
                            className="text-amber-700 underline decoration-amber-300 underline-offset-4 hover:decoration-amber-700"
                          >
                            {t('identidadSinConfigurar')}
                          </Link>
                        )}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {client.allowClientUserInvites ? (
                            <Badge tone="blue">{t('puedeInvitar')}</Badge>
                          ) : (
                            <Badge tone="slate">{t('sinInvitaciones')}</Badge>
                          )}
                          {client.allowClientExports ? (
                            <Badge tone="blue">{t('exporta')}</Badge>
                          ) : (
                            <Badge tone="slate">{t('sinExportar')}</Badge>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            </SeleccionDeClientes>
          )}
        </Card>
      </div>
    </>
  )
}
