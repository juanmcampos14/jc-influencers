import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
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
import { VerComoElCliente } from './ver-como-el-cliente'
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
  const t = await getTranslations('clientes')
  const idioma = await getLocale()

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
            {t('titulo')}
          </Link>
        }
        actions={
          <>
            <VerComoElCliente clientId={clientId} nombre={client.name} />
            {canManage ? (
              <Button asChild variant={brand.status === 'APPROVED' ? 'secondary' : 'primary'} size="sm">
                <Link href={`/clientes/${clientId}/marca`}>
                  <Palette className="size-4" aria-hidden="true" />
                  {brand.status === 'APPROVED' ? t('identidadVisual') : t('darleIdentidad')}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="grid gap-6 px-5 py-6 sm:px-8 lg:grid-cols-3">
        <StatStrip>
          <Stat label={t('statCampanasActivas')} value={resumen.totals.activeCampaigns} />
          <Stat
            label={t('statEsperandoCliente')}
            value={resumen.totals.awaitingClient}
            tone="accent"
            hint={t('statEsperandoClienteAyuda')}
          />
          <Stat label={t('statAprobados')} value={resumen.totals.approved} tone="good" />
          <Stat label={t('statPerfilesPropuestos')} value={resumen.totals.proposedProfiles} />
        </StatStrip>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('campanas')}</CardTitle>
            {campaigns.items.length < campaigns.total ? (
              <CardDescription>
                {t('campanasRecientes', { mostradas: campaigns.items.length, total: campaigns.total })}{' '}
                <Link href={`/campanas?cliente=${clientId}`} className="underline underline-offset-2">
                  {t('verTodas')}
                </Link>
              </CardDescription>
            ) : null}
            </CardHeader>
            {campaigns.items.length === 0 ? (
              <EmptyState
                title={t('sinCampanasTitulo')}
                description={t('sinCampanasBajada')}
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/campanas">{t('irACampanas')}</Link>
                  </Button>
                }
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>{t('colCampana')}</Th>
                      <Th>{t('colEstado')}</Th>
                      <Th className="text-right">{t('colPerfiles')}</Th>
                      <Th className="text-right">{t('colAprobados')}</Th>
                      <Th>{t('colFechas')}</Th>
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
                          {formatDate(campaign.startDate, ctx.user.timezone, idioma)} → {formatDate(campaign.endDate, ctx.user.timezone, idioma)}
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
              <CardTitle>{t('usuariosDelCliente')}</CardTitle>
            </CardHeader>
            {users.length === 0 ? (
              <EmptyState
                title={t('sinUsuariosTitulo')}
                description={t('sinUsuariosBajada')}
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/usuarios">{t('invitarAAlguien')}</Link>
                  </Button>
                }
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>{t('colPersona')}</Th>
                      <Th>{t('colRol')}</Th>
                      <Th>{t('colEstado')}</Th>
                      <Th>{t('colUltimoAcceso')}</Th>
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
                              <Badge tone="emerald" dot>{t('activo')}</Badge>
                            ) : (
                              <Badge tone="rose" dot>{t('desactivado')}</Badge>
                            )}
                          </Td>
                          <Td className="text-xs text-ink-600">{formatDate(user.lastLoginAt, ctx.user.timezone, idioma)}</Td>
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
              <CardTitle>{t('datos')}</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-ink-500">{t('identificador')}</dt>
                  <dd className="font-mono text-xs text-ink-800">{client.slug}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">{t('razonSocial')}</dt>
                  <dd className="text-ink-800">{client.legalName ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">{t('pais')}</dt>
                  <dd className="text-ink-800">{client.country ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">{t('mercados')}</dt>
                  <dd className="text-ink-800">{client.markets.length > 0 ? client.markets.join(', ') : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">{t('moneda')}</dt>
                  <dd className="text-ink-800">{client.defaultCurrency}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">{t('zonaHoraria')}</dt>
                  <dd className="text-ink-800">{client.timezone}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {can(ctx, 'brand.manage', clientId) ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('identidadVisual')}</CardTitle>
                <p className="text-xs text-ink-500">{t('identidadBajadaFicha')}</p>
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
                      {brand.status === 'APPROVED' ? t('identidadPropiaAplicada') : t('usandoNeutro')}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {brand.sourceUrl ?? (brand.status === 'APPROVED' ? t('configuradaAMano') : t('sinConfigurarMinuscula'))}
                    </p>
                  </div>
                </div>
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/clientes/${clientId}/marca`}>
                    {brand.status === 'APPROVED' ? t('editarIdentidad') : t('configurarIdentidad')}
                  </Link>
                </Button>
              </CardBody>
            </Card>
          ) : null}

          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('visibilidadYPermisos')}</CardTitle>
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
