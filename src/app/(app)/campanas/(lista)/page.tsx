import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { CampaignStatusBadge, CAMPAIGN_STATUS_LABELS } from '@/components/status-badge'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { can } from '@/lib/authz/context'
import { listCampaigns } from '@/lib/repos/campaigns'
import { formatDate, formatMoney } from '@/lib/util/format'
import { CampaignFilters } from '../filters'
import { NewCampaignDialog } from '../new-campaign-dialog'

export const metadata: Metadata = { title: 'Campañas' }
export const dynamic = 'force-dynamic'

type SearchParams = { q?: string; estado?: string; cliente?: string; pagina?: string }

const cerrada = (status: string): boolean => status === 'CLOSED' || status === 'CANCELLED'

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const ctx = await requireContext()

  const statusFilter = params.estado && params.estado in CAMPAIGN_STATUS_LABELS ? [params.estado] : null
  // El cliente del filtro se valida contra el alcance dentro del repositorio.
  const clientFilter = params.cliente && ctx.clients.some((c) => c.id === params.cliente) ? params.cliente : null

  const campaigns = await loadPage(() =>
    listCampaigns(
    ctx,
    {
      search: params.q?.trim() || null,
      status: statusFilter as never,
      clientId: clientFilter,
    },
      { page: Number(params.pagina ?? 1) || 1, pageSize: 25 },
    ),
  )

  const canCreate = ctx.clients.some((client) => can(ctx, 'campaign.create', client.id))

  return (
    <>
      <PageHeader
        title="Campañas"
        description="Todas las campañas de los clientes a los que tenés acceso."
        actions={canCreate ? <NewCampaignDialog clients={ctx.clients.map((c) => ({ id: c.id, name: c.name }))} /> : null}
      />
      <div className="space-y-4 px-5 py-6 sm:px-8">
        <CampaignFilters clients={ctx.clients.map((c) => ({ id: c.id, name: c.name }))} />

        <Card>
          {campaigns.items.length === 0 ? (
            <EmptyState
              title="No hay campañas que coincidan"
              description="Probá quitando filtros, o creá una campaña nueva."
            />
          ) : (
            <>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Campaña</Th>
                      <Th>Cliente</Th>
                      <Th>Estado</Th>
                      <Th className="text-right">Perfiles</Th>
                      <Th className="text-right">Aprobados</Th>
                      <Th className="text-right">Pendientes</Th>
                      <Th>Fechas</Th>
                      <Th className="text-right">Presupuesto</Th>
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
                        <Td className="text-ink-600">{campaign.clientName}</Td>
                        <Td>
                          <CampaignStatusBadge status={campaign.status} />
                        </Td>
                        <Td className="text-right tabular-nums">{campaign.candidacyCount}</Td>
                        <Td className="text-right tabular-nums text-emerald-700">{campaign.approvedCount}</Td>
                        {/*
                          * En una campaña cerrada, "pendientes" ya no espera a
                          * nadie: pintarlo de ámbar era una alerta que no lo es.
                          */}
                        <Td
                          className={
                            cerrada(campaign.status)
                              ? 'text-right tabular-nums text-ink-400'
                              : 'text-right tabular-nums text-amber-700'
                          }
                        >
                          {campaign.pendingApprovalCount}
                        </Td>
                        <Td className="whitespace-nowrap text-xs text-ink-600">
                          {formatDate(campaign.startDate, ctx.user.timezone)} → {formatDate(campaign.endDate, ctx.user.timezone)}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {campaign.budget ? formatMoney(campaign.budget.estimated, campaign.currency) : 'restringido'}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
              <Pagination
                base="/campanas"
                params={params as Record<string, string | undefined>}
                page={campaigns.page}
                pageCount={campaigns.pageCount}
                total={campaigns.total}
                unidad="campañas"
              />
            </>
          )}
        </Card>
      </div>
    </>
  )
}
