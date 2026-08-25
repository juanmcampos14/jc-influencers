import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { can } from '@/lib/authz/context'
import { listClients } from '@/lib/repos/clients'
import { NewClientDialog } from './new-client-dialog'

export const metadata: Metadata = { title: 'Clientes' }
export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const ctx = await requireContext()
  const clients = await loadPage(() => listClients(ctx))
  const canManage = ctx.allClients && can(ctx, 'client.manage', null)

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Cada cliente es un espacio aislado. Los usuarios del cliente sólo ven lo suyo."
        actions={canManage ? <NewClientDialog /> : null}
      />
      <div className="px-5 py-6 sm:px-8">
        <Card>
          {clients.length === 0 ? (
            <EmptyState
              title="Todavía no tenés clientes asignados"
              description="Un administrador de agencia puede darte acceso a los clientes en los que trabajás."
            />
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th>País y mercados</Th>
                    <Th className="text-right">Campañas</Th>
                    <Th className="text-right">Usuarios</Th>
                    <Th>Permisos</Th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <Tr key={client.id}>
                      <Td>
                        <Link href={`/clientes/${client.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                          {client.name}
                        </Link>
                        <p className="text-xs text-ink-500">{client.slug}</p>
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
                      <Td className="text-right tabular-nums">{client.userCount}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {client.allowClientUserInvites ? (
                            <Badge tone="blue">Puede invitar</Badge>
                          ) : (
                            <Badge tone="slate">Sin invitaciones</Badge>
                          )}
                          {client.allowClientExports ? (
                            <Badge tone="blue">Exporta</Badge>
                          ) : (
                            <Badge tone="slate">Sin exportar</Badge>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  )
}
