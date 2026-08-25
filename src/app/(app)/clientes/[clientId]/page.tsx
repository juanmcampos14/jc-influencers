import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/app-shell'
import { Card, CardDescription, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Palette } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Stat, StatStrip } from '@/components/ui/stat'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { CampaignStatusBadge } from '@/components/status-badge'
import { requireContext } from '@/lib/auth/current'
import { NotFoundError } from '@/lib/authz/errors'
import { can } from '@/lib/authz/context'
import { getClient } from '@/lib/repos/clients'
import { listCampaigns } from '@/lib/repos/campaigns'
import { listUsers } from '@/lib/repos/users'
import { dashboard } from '@/lib/repos/dashboard'
import { getBrand } from '@/lib/repos/brand'
import { Button } from '@/components/ui/button'
import { CLIENT_ROLE_LABELS } from '@/lib/authz/capabilities'
import { formatDate } from '@/lib/util/format'
import { ClientSettingsForm } from './settings-form'

export const metadata: Metadata = { title: 'Cliente' }
export const dynamic = 'force-dynamic'

export default async function ClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params
  const ctx = await requireContext()

  let client
  try {
    client = await getClient(ctx, clientId)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const [campaigns, users, brand, resumen] = await Promise.all([
    listCampaigns(ctx, { clientId }, { pageSize: 50 }),
    can(ctx, 'client.view', clientId) ? listUsers(ctx, clientId) : Promise.resolve([]),
    getBrand(ctx, clientId),
    // Ya existe y cuenta con `count` sobre todo, sin topes: no hace falta
    // inventar una consulta nueva para tener las cifras de este cliente.
    dashboard(ctx, clientId),
  ])
  const canManage = can(ctx, 'client.manage', clientId)

  return (
    <>
      <PageHeader
        title={client.name}
        variant="nombre"
        description={client.description ?? undefined}
        breadcrumb={
          <Link href="/clientes" className="hover:underline">
            Clientes
          </Link>
        }
        actions={
          canManage ? (
            <Button asChild variant={brand.status === 'APPROVED' ? 'secondary' : 'primary'} size="sm">
              <Link href={`/clientes/${clientId}/marca`}>
                <Palette className="size-4" aria-hidden="true" />
                {brand.status === 'APPROVED' ? 'Identidad visual' : 'Darle su identidad visual'}
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-6 px-5 py-6 sm:px-8 lg:grid-cols-3">
        <StatStrip>
          <Stat label="Campañas activas" value={resumen.totals.activeCampaigns} />
          <Stat
            label="Esperando al cliente"
            value={resumen.totals.awaitingClient}
            tone="accent"
            hint="Ya lo ve el cliente"
          />
          <Stat label="Aprobados" value={resumen.totals.approved} tone="good" />
          <Stat label="Perfiles propuestos" value={resumen.totals.proposedProfiles} />
        </StatStrip>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Campañas</CardTitle>
            {campaigns.items.length < campaigns.total ? (
              <CardDescription>
                Las {campaigns.items.length} más recientes de {campaigns.total}.{' '}
                <Link href={`/campanas?cliente=${clientId}`} className="underline underline-offset-2">
                  Ver todas
                </Link>
              </CardDescription>
            ) : null}
            </CardHeader>
            {campaigns.items.length === 0 ? (
              <EmptyState
                title="Sin campañas"
                description="Cuando crees la primera va a aparecer acá, con sus perfiles y su brief."
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/campanas">Ir a Campañas</Link>
                  </Button>
                }
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Campaña</Th>
                      <Th>Estado</Th>
                      <Th className="text-right">Perfiles</Th>
                      <Th className="text-right">Aprobados</Th>
                      <Th>Fechas</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.items.map((campaign) => (
                      <Tr key={campaign.id}>
                        <Td>
                          <Link href={`/campanas/${campaign.id}`} className="font-medium underline-offset-4 hover:underline">
                            {campaign.name}
                          </Link>
                        </Td>
                        <Td>
                          <CampaignStatusBadge status={campaign.status} />
                        </Td>
                        <Td className="text-right tabular-nums">{campaign.candidacyCount}</Td>
                        <Td className="text-right tabular-nums">{campaign.approvedCount}</Td>
                        <Td className="whitespace-nowrap text-xs text-ink-600">
                          {formatDate(campaign.startDate, ctx.user.timezone)} → {formatDate(campaign.endDate, ctx.user.timezone)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usuarios del cliente</CardTitle>
            </CardHeader>
            {users.length === 0 ? (
              <EmptyState
                title="Sin usuarios"
                description="Sin nadie del lado del cliente, nadie puede aprobar los perfiles que le propongas."
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/usuarios">Invitar a alguien</Link>
                  </Button>
                }
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Persona</Th>
                      <Th>Rol</Th>
                      <Th>Estado</Th>
                      <Th>Último acceso</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const membership = user.clients.find((entry) => entry.clientId === clientId)
                      return (
                        <Tr key={user.id}>
                          <Td>
                            <p className="font-medium text-ink-900">{user.name}</p>
                            <p className="text-xs text-ink-500">{user.email}</p>
                          </Td>
                          <Td>{membership ? CLIENT_ROLE_LABELS[membership.role] : '—'}</Td>
                          <Td>
                            {user.status === 'ACTIVE' ? (
                              <Badge tone="emerald" dot>Activo</Badge>
                            ) : (
                              <Badge tone="rose" dot>Desactivado</Badge>
                            )}
                          </Td>
                          <Td className="text-xs text-ink-600">{formatDate(user.lastLoginAt, ctx.user.timezone)}</Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Datos</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-ink-500">Identificador</dt>
                  <dd className="font-mono text-xs text-ink-800">{client.slug}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">Razón social</dt>
                  <dd className="text-ink-800">{client.legalName ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">País</dt>
                  <dd className="text-ink-800">{client.country ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">Mercados</dt>
                  <dd className="text-ink-800">{client.markets.length > 0 ? client.markets.join(', ') : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">Moneda</dt>
                  <dd className="text-ink-800">{client.defaultCurrency}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">Zona horaria</dt>
                  <dd className="text-ink-800">{client.timezone}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {can(ctx, 'brand.manage', clientId) ? (
            <Card>
              <CardHeader>
                <CardTitle>Identidad visual</CardTitle>
                <p className="text-xs text-ink-500">
                  Define cómo se ve el espacio de este cliente cuando entra a su portal.
                </p>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="flex items-center gap-3">
                  <span
                    className="size-8 rounded-lg border border-ink-200"
                    style={{ backgroundColor: brand.colors.primary }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-ink-800">
                      {brand.status === 'APPROVED' ? 'Identidad propia aplicada' : 'Usando el tema neutro de JC'}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {brand.sourceUrl ?? (brand.status === 'APPROVED' ? 'configurada a mano' : 'sin configurar')}
                    </p>
                  </div>
                </div>
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/clientes/${clientId}/marca`}>
                    {brand.status === 'APPROVED' ? 'Editar identidad' : 'Configurar identidad'}
                  </Link>
                </Button>
              </CardBody>
            </Card>
          ) : null}

          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>Visibilidad y permisos</CardTitle>
              </CardHeader>
              <CardBody>
                <ClientSettingsForm
                  clientId={client.id}
                  version={client.version}
                  name={client.name}
                  allowClientUserInvites={client.allowClientUserInvites}
                  allowClientExports={client.allowClientExports}
                />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  )
}
