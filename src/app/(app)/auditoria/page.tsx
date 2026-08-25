import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { listAudit } from '@/lib/repos/audit'
import { formatDateTime } from '@/lib/util/format'
import { AuditFilters } from './filters'

export const metadata: Metadata = { title: 'Auditoría' }
export const dynamic = 'force-dynamic'

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ accion?: string; entidad?: string; cliente?: string; pagina?: string }>
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
                          {row.actorRole ? <p className="text-ink-500">{row.actorRole}</p> : null}
                        </Td>
                        <Td>
                          <Badge tone={row.action.startsWith('auth.login.failure') ? 'rose' : 'slate'}>{row.action}</Badge>
                        </Td>
                        <Td className="text-xs">
                          <p className="text-ink-800">{row.entityType}</p>
                          {row.entityId ? <p className="font-mono text-[11px] text-ink-500">{row.entityId}</p> : null}
                        </Td>
                        <Td className="text-xs text-ink-600">{row.ip ?? '—'}</Td>
                        <Td className="font-mono text-[11px] text-ink-500">{row.correlationId?.slice(0, 8) ?? '—'}</Td>
                        <Td className="max-w-md text-xs">
                          {row.before || row.after ? (
                            <details>
                              <summary className="cursor-pointer text-brand-600">ver</summary>
                              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-ink-100 p-2 text-[11px]">
                                {JSON.stringify({ antes: row.before, despues: row.after, extra: row.metadata }, null, 2)}
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
              <div className="flex items-center justify-between border-t border-ink-200 px-5 py-3 text-sm">
                <p className="text-ink-500">
                  {page.total} eventos · página {page.page} de {page.pageCount}
                </p>
                <div className="flex gap-2">
                  {page.page > 1 ? (
                    <Link href={`/auditoria?pagina=${page.page - 1}`} className="rounded-md border border-ink-300 px-3 py-1.5 hover:bg-ink-100">
                      Anterior
                    </Link>
                  ) : null}
                  {page.page < page.pageCount ? (
                    <Link href={`/auditoria?pagina=${page.page + 1}`} className="rounded-md border border-ink-300 px-3 py-1.5 hover:bg-ink-100">
                      Siguiente
                    </Link>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  )
}
