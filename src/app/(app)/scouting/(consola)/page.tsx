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
import { scoutingProvider } from '@/lib/ports/scouting'
import { buscarEnBase, type FiltrosDeBase, type OrdenDeBase } from '@/lib/repos/base-conocimiento'
import { ScoutingConsole } from './scouting-console'
import { BaseDeConocimiento } from './base-de-conocimiento'
import type { Platform } from '@/generated/prisma/enums'

export const metadata: Metadata = { title: 'Scouting' }
export const dynamic = 'force-dynamic'

export default async function ScoutingPage({
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
        <PageHeader title="Scouting" />
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
  const provider = scoutingProvider()

  /*
   * Las dos pestañas son la misma pregunta hecha en dos lados: "¿a quién
   * necesito?". La diferencia es a quién se le pregunta --y cuánto cuesta--.
   * Buscar en lo que ya sabemos es gratis, así que va primero en la cabeza de
   * quien usa esto, aunque Buscar siga siendo la pestaña por defecto.
   */
  const tab = texto(params.tab) === 'base' ? 'base' : 'buscar'

  if (tab === 'base') {
    const filtros = leerFiltros(params)
    const { resultados, totalEnBase } = await loadPage(async () => ({
      resultados: await buscarEnBase(ctx, filtros, { page: numero(params.page) ?? 1, pageSize: 25 }),
      totalEnBase: (await buscarEnBase(ctx, {}, { page: 1, pageSize: 1 })).total,
    }))

    return (
      <>
        <PageHeader
          title="Scouting"
          description="Buscá primero en lo que ya sabemos. Pedirle a un proveedor cuesta plata; esto no."
        />
        <div className="px-5 py-6 sm:px-8">
          <Pestanas activa="base" />
          <BaseDeConocimiento
            resultados={resultados}
            filtros={filtros}
            params={params}
            totalEnBase={totalEnBase}
          />
        </div>
      </>
    )
  }

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
        <Pestanas activa="buscar" />
        <ScoutingConsole
          clients={usable.map((client) => ({ id: client.id, name: client.name }))}
          clientId={clientId}
          budget={budget}
          runs={runs}
          campaigns={campaigns.items.map((campaign) => ({ id: campaign.id, name: campaign.name }))}
          campaignId={campaigns.items.find((campaign) => campaign.id === texto(params.campana))?.id ?? null}
          provider={{ name: provider.name, configured: provider.configured }}
          canManageBudget={can(ctx, 'scouting.budget.manage', clientId)}
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

function numero(valor: string | string[] | undefined): number | null {
  const crudo = texto(valor)
  if (crudo === null) return null
  const n = Number(crudo)
  return Number.isFinite(n) ? n : null
}

function lista(valor: string | string[] | undefined): string[] {
  const crudo = texto(valor)
  if (crudo === null) return []
  return crudo
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

const REDES_VALIDAS = new Set<string>(['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'TWITCH', 'X'])
const ORDENES_VALIDOS = new Set<string>([
  'RECIENTE',
  'SEGUIDORES_DESC',
  'SEGUIDORES_ASC',
  'ENGAGEMENT_DESC',
  'VECES_VISTO',
  'NOMBRE',
])

/**
 * Lee los filtros de la URL.
 *
 * Todo lo que viene de la barra de direcciones se valida contra una lista
 * cerrada. Un valor inventado se ignora, no se pasa a la consulta: la URL la
 * escribe cualquiera.
 */
function leerFiltros(params: Record<string, string | string[] | undefined>): FiltrosDeBase {
  const red = texto(params.red)
  const orden = texto(params.orden)
  const opcion = <T extends string>(valor: string | null, validos: readonly T[]): T | undefined =>
    valor !== null && (validos as readonly string[]).includes(valor) ? (valor as T) : undefined

  return {
    texto: texto(params.q),
    platform: red !== null && REDES_VALIDAS.has(red) ? (red as Platform) : null,
    pais: texto(params.pais),
    seguidoresDesde: numero(params.segDesde),
    seguidoresHasta: numero(params.segHasta),
    engagementDesde: numero(params.erDesde),
    engagementHasta: numero(params.erHasta),
    palabras: lista(params.palabras),
    intereses: lista(params.intereses),
    enPadron: opcion(texto(params.padron), ['CUALQUIERA', 'SI', 'NO'] as const),
    conCampanas: opcion(texto(params.campanas), ['CUALQUIERA', 'SI', 'NO'] as const),
    visto: opcion(texto(params.visto), ['CUALQUIERA', 'ULTIMOS_30', 'ULTIMOS_90'] as const),
    orden: orden !== null && ORDENES_VALIDOS.has(orden) ? (orden as OrdenDeBase) : 'RECIENTE',
  }
}

function Pestanas({ activa }: { activa: 'buscar' | 'base' }) {
  const items = [
    { clave: 'buscar' as const, href: '/scouting', etiqueta: 'Buscar' },
    { clave: 'base' as const, href: '/scouting?tab=base', etiqueta: 'Base de datos' },
  ]
  return (
    <nav className="mb-4 flex gap-1 border-b border-line" aria-label="Secciones de scouting">
      {items.map((item) => (
        <Link
          key={item.clave}
          href={item.href}
          aria-current={activa === item.clave ? 'page' : undefined}
          className={
            activa === item.clave
              ? 'border-b-2 border-primary px-3 py-2 text-sm font-medium text-fg'
              : 'border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-fg'
          }
        >
          {item.etiqueta}
        </Link>
      ))}
    </nav>
  )
}
