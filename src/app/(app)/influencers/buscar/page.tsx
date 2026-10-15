import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
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

/**
 * El título de la pestaña también está traducido: se lee en el navegador, en
 * los favoritos y en el historial.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titulos')
  return { title: t('buscarInfluencers') }
}
export const dynamic = 'force-dynamic'

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const ctx = await requireContext()
  const t = await getTranslations('scouting')

  const usable = ctx.clients.filter((client) => can(ctx, 'scouting.run', client.id))
  if (usable.length === 0) {
    // Sin clientes no hay nada sobre lo que buscar, y decir "no tenés permiso"
    // sería falso: manda a pedir un acceso que ya se tiene.
    const sinClientes = ctx.clients.length === 0
    return (
      <>
        <PageHeader title={t('titulo')} description={t('bajadaCorta')} />
        <div className="px-5 py-6 sm:px-8">
          <Card>
            {sinClientes ? (
              <EmptyState
                title={t('sinClientesTitulo')}
                description={t('sinClientesBajada')}
                action={
                  can(ctx, 'client.manage', null) ? (
                    <Button asChild variant="secondary" size="sm">
                      <Link href="/clientes">{t('irAClientes')}</Link>
                    </Button>
                  ) : null
                }
              />
            ) : (
              <EmptyState
                title={t('sinPermisoTitulo')}
                description={t('sinPermisoBajada')}
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
        title={t('titulo')}
        description={t('bajada')}
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
