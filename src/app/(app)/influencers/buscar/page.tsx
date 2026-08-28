import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { can } from '@/lib/authz/context'
import { getBudgetState, listScoutingRuns } from '@/lib/repos/scouting'
import { listCampaigns } from '@/lib/repos/campaigns'
import { hayProveedorConAudiencia, scoutingProviderFor } from '@/lib/ports/scouting'
import { ScoutingConsole } from './scouting-console'
import { NavDeInfluencers } from '../sub-nav'

export const metadata: Metadata = { title: 'Buscar influencers' }
export const dynamic = 'force-dynamic'

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const ctx = await requireContext()

  const usable = ctx.clients.filter((client) => can(ctx, 'scouting.run', client.id))
  if (usable.length === 0) {
    // Sin clientes no hay nada sobre lo que buscar, y decir "no tenés permiso"
    // sería falso: manda a pedir un acceso que ya se tiene.
    const sinClientes = ctx.clients.length === 0
    return (
      <>
        <PageHeader title="Influencers" description="Buscar gente nueva." />
        <div className="px-5 py-6 sm:px-8">
          <Card>
            {sinClientes ? (
              <EmptyState
                title="Todavía no hay clientes"
                description="El scouting busca perfiles para un cliente concreto. Creá el primero y volvé."
                action={
                  can(ctx, 'client.manage', null) ? (
                    <Button asChild variant="secondary" size="sm">
                      <Link href="/clientes">Ir a Clientes</Link>
                    </Button>
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

  const clientId = usable.find((client) => client.id === texto(params.cliente))?.id ?? ctx.activeClientId ?? usable[0]!.id
  /*
   * Qué proveedor hace el trabajo, por red.
   *
   * No es el mismo para todas: Bright Data no descubre por palabra clave en
   * Instagram, así que ahí entra otro. Mostrar el proveedor por defecto --y su
   * precio-- decía el nombre y el costo equivocados justo cuando importa, que
   * es antes de gastar.
   */
  const REDES = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE'] as const
  const proveedorPorRed = Object.fromEntries(
    REDES.map((red) => {
      const elegido = scoutingProviderFor(red, 'DISCOVER')
      return [
        red,
        {
          name: elegido.name,
          configured: elegido.configured,
          unitCostUsd: elegido.configured ? elegido.unitCostUsd(red) : 0,
        },
      ]
    }),
  )

  const { budget, runs, campaigns } = await loadPage(async () => ({
    budget: await getBudgetState(ctx, clientId),
    runs: await listScoutingRuns(ctx, clientId),
    campaigns: await listCampaigns(ctx, { clientId }, { pageSize: 50 }),
  }))

  return (
    <>
      <PageHeader
        title="Influencers"
        description="Buscar gente nueva con un proveedor externo. Tiene costo por registro, así que siempre te decimos cuánto va a salir antes de ejecutar. Antes de gastar, fijate en Descubiertos: eso ya está pago."
      />
      <div className="px-5 py-6 sm:px-8">
        <NavDeInfluencers ctx={ctx} activo="/influencers/buscar" />
        <ScoutingConsole
          clients={usable.map((client) => ({ id: client.id, name: client.name }))}
          clientId={clientId}
          budget={budget}
          runs={runs}
          campaigns={campaigns.items.map((campaign) => ({ id: campaign.id, name: campaign.name }))}
          campaignId={campaigns.items.find((campaign) => campaign.id === texto(params.campana))?.id ?? null}
          /*
           * El costo por perfil viaja a la pantalla para poder decirlo antes de
           * buscar, sin un viaje de ida y vuelta sólo para preguntarlo.
           */
          proveedorPorRed={proveedorPorRed}
          canManageBudget={can(ctx, 'scouting.budget.manage', clientId)}
          puedeFiltrarAudiencia={hayProveedorConAudiencia()}
        />
      </div>
    </>
  )
}

/** Un parámetro de la URL puede venir repetido; se toma el primero. */
function texto(valor: string | string[] | undefined): string | null {
  const crudo = Array.isArray(valor) ? valor[0] : valor
  const limpio = crudo?.trim()
  return limpio ? limpio : null
}
