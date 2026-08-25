import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { CampaignStatusBadge } from '@/components/status-badge'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { listCampaigns } from '@/lib/repos/campaigns'
import { formatDate } from '@/lib/util/format'

export const metadata: Metadata = { title: 'Mis campañas' }
export const dynamic = 'force-dynamic'

export default async function PortalHome() {
  const ctx = await requireContext()
  const clientId = ctx.activeClientId

  if (!clientId) {
    return (
      <>
        <PageHeader title="Mis campañas" />
        <div className="px-5 py-6 sm:px-8">
          <Card>
            <EmptyState
              title="Todavía no tenés acceso a ninguna campaña"
              description="Cuando la agencia te asigne un espacio de trabajo va a aparecer acá."
            />
          </Card>
        </div>
      </>
    )
  }

  const campaigns = await loadPage(() => listCampaigns(ctx, { clientId }, { pageSize: 50 }))
  const activeClient = ctx.clients.find((client) => client.id === clientId)

  return (
    <>
      <PageHeader
        title="Mis campañas"
        description={`Propuestas de perfiles de ${activeClient?.name ?? 'tu marca'} para revisar y aprobar.`}
      />
      <div className="px-5 py-6 sm:px-8">
        {campaigns.items.length === 0 ? (
          <Card>
            <EmptyState
              title="Sin campañas todavía"
              description="La agencia todavía no compartió ninguna campaña con vos."
            />
          </Card>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {campaigns.items.map((campaign) => (
              <li key={campaign.id}>
                <Link
                  href={`/portal/campanas/${campaign.id}`}
                  className="block h-full rounded-xl border border-ink-200 bg-white p-5 hover:border-brand-300 hover:shadow-sm"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h2 className="text-sm font-semibold text-ink-900">{campaign.name}</h2>
                    <CampaignStatusBadge status={campaign.status} />
                  </div>
                  {campaign.objective ? <p className="mb-3 text-sm text-ink-600">{campaign.objective}</p> : null}
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
                    <div className="flex gap-1">
                      <dt>Perfiles:</dt>
                      <dd className="font-medium text-ink-900">{campaign.candidacyCount}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Aprobados:</dt>
                      <dd className="font-medium text-emerald-700">{campaign.approvedCount}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Esperan tu decisión:</dt>
                      <dd className="font-medium text-amber-700">{campaign.pendingApprovalCount}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-ink-400">
                    {formatDate(campaign.startDate, ctx.user.timezone)} → {formatDate(campaign.endDate, ctx.user.timezone)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
