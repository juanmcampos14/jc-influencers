import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { listAudit } from '@/lib/repos/audit'
import { AGENCY_ROLE_LABELS, CLIENT_ROLE_LABELS } from '@/lib/authz/capabilities'
import { auditActionLabel, entityTypeLabel } from '@/lib/domain/labels'
import { formatDateTime } from '@/lib/util/format'
import { AuditFilters } from './filters'

export const metadata: Metadata = { title: 'Auditoría' }
export const dynamic = 'force-dynamic'

/**
 * El rol de quien hizo la acción, legible. Se guarda la clave del enum porque
 * es lo que hay que conservar; mostrarla cruda es otra cosa.
 */
const rolLegible = (rol: string): string =>
  (AGENCY_ROLE_LABELS as Record<string, string>)[rol] ??
  (CLIENT_ROLE_LABELS as Record<string, string>)[rol] ??
  rol

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ accion?: string; entidad?: string; cliente?: string; pagina?: string; desde?: string; hasta?: string }>
}) {
  const params = await searchParams
  const ctx = await requireContext()
  const clientFilter = params.cliente && ctx.clients.some((c) => c.id === params.cliente) ? params.cliente : null

  const page = await loadPage(() =>
    listAudit(
    ctx,
    {
      action: params.accion?.trim() || null,
      entityType: params.entidad?.trim() || null,
      // Las fechas llegan como AAAA-MM-DD; "hasta" incluye todo ese día.
      from: params.desde ? new Date(`${params.desde}T00:00:00`) : null,
      to: params.hasta ? new Date(`${params.hasta}T23:59:59.999`) : null,
      clientId: clientFilter,
    },
      { page: Number(params.pagina ?? 1) || 1, pageSize: 50 },
    ),
  )

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Registro inmutable. La base no permite modificar ni borrar estos eventos."
      />
      <div className="space-y-4 px-5 py-6 sm:px-8">
        <AuditFilters clients={ctx.clients.map((c) => ({ id: c.id, name: c.name }))} />
        <Card>
          {page.items.length === 0 ? (
            <EmptyState title="Sin eventos" description="No hay eventos que coincidan con el filtro." />
          ) : (
            <>
              <TableWrap className="max-h-[70vh]">
                <Table>
                  <thead>
                    <tr>
                      <Th>Fecha</Th>
                      <Th>Actor</Th>
                      <Th>Acción</Th>
                      <Th>Entidad</Th>
                      <Th>IP</Th>
                      <Th>Correlación</Th>
                      <Th>Cambios</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((row) => (
                      <Tr key={row.id}>
                        <Td className="whitespace-nowrap text-xs">{formatDateTime(row.occurredAt, ctx.user.timezone)}</Td>
                        <Td className="text-xs">
                          <p className="text-ink-800">{row.actorEmail ?? 'sistema'}</p>
                          {row.actorRole ? <p className="text-ink-500">{rolLegible(row.actorRole)}</p> : null}
                        </Td>
                        <Td>
                          {/* La clave técnica queda en el title: sirve para buscar, no para leer. */}
                          <Badge
                            tone={row.action.startsWith('auth.login.failure') ? 'rose' : 'slate'}
                            title={row.action}
                            dot
                          >
                            {auditActionLabel(row.action)}
                          </Badge>
                        </Td>
                        <Td className="text-xs">
                          <p className="text-ink-800">{entityTypeLabel(row.entityType)}</p>
                          {row.entityId ? <p className="font-mono text-[11px] text-ink-500">{row.entityId}</p> : null}
                        </Td>
                        <Td className="text-xs text-ink-600">{row.ip ?? '—'}</Td>
                        <Td className="font-mono text-[11px] text-ink-500">{row.correlationId?.slice(0, 8) ?? '—'}</Td>
                        <Td className="max-w-md text-xs">
                          {row.before || row.after ? (
                            <details>
                              <summary className="cursor-pointer text-ink-700 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-900">
                                Ver el cambio
                              </summary>
                              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-ink-100 p-2 text-[11px]">
                                {JSON.stringify({ antes: row.before, después: row.after, extra: row.metadata }, null, 2)}
                              </pre>
                            </details>
                          ) : (
                            '—'
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
              <Pagination
                base="/auditoria"
                params={params as Record<string, string | undefined>}
                page={page.page}
                pageCount={page.pageCount}
                total={page.total}
                unidad="eventos"
              />
            </>
          )}
        </Card>
      </div>
    </>
  )
}
