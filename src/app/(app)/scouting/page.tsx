import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { can } from '@/lib/authz/context'
import { getBudgetState, listScoutingRuns } from '@/lib/repos/scouting'
import { listCampaigns } from '@/lib/repos/campaigns'
import { scoutingProvider } from '@/lib/ports/scouting'
import { ScoutingConsole } from './scouting-console'

export const metadata: Metadata = { title: 'Scouting' }
export const dynamic = 'force-dynamic'

export default async function ScoutingPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const params = await searchParams
  const ctx = await requireContext()

  const usable = ctx.clients.filter((client) => can(ctx, 'scouting.run', client.id))
  if (usable.length === 0) {
    // Sin clientes no hay nada sobre lo que buscar, y decir "no tenés permiso"
    // sería falso: manda a pedir un acceso que ya se tiene.
    const sinClientes = ctx.clients.length === 0
    return (
      <>
        <PageHeader title="Scouting" />
        <div className="px-5 py-6 sm:px-8">
          <Card>
            {sinClientes ? (
              <EmptyState
                title="Todavía no hay clientes"
                description="El scouting busca perfiles para un cliente concreto. Creá el primero y volvé."
                action={
                  can(ctx, 'client.manage', null) ? (
                    <Link href="/clientes" className="text-sm font-medium text-brand-700 underline underline-offset-2">
                      Ir a Clientes
                    </Link>
                  ) : null
                }
              />
            ) : (
              <EmptyState
                title="No tenés permiso para ejecutar scouting"
                description="Esta función tiene costo por uso, así que está limitada a la agencia. Pedísela a un administrador."
              />
            )}
          </Card>
        </div>
      </>
    )
  }

  const clientId = usable.find((client) => client.id === params.cliente)?.id ?? ctx.activeClientId ?? usable[0]!.id
  const provider = scoutingProvider()

  const { budget, runs, campaigns } = await loadPage(async () => ({
    budget: await getBudgetState(ctx, clientId),
    runs: await listScoutingRuns(ctx, clientId),
    campaigns: await listCampaigns(ctx, { clientId }, { pageSize: 50 }),
  }))

  return (
    <>
      <PageHeader
        title="Scouting"
        description="Busca perfiles nuevos y actualiza métricas con el proveedor externo. Tiene costo por registro, así que siempre te decimos cuánto va a salir antes de ejecutar."
      />
      <div className="px-5 py-6 sm:px-8">
        <ScoutingConsole
          clients={usable.map((client) => ({ id: client.id, name: client.name }))}
          clientId={clientId}
          budget={budget}
          runs={runs}
          campaigns={campaigns.items.map((campaign) => ({ id: campaign.id, name: campaign.name }))}
          provider={{ name: provider.name, configured: provider.configured }}
          canManageBudget={can(ctx, 'scouting.budget.manage', clientId)}
        />
      </div>
    </>
  )
}
