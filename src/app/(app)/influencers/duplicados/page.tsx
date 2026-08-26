import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { can } from '@/lib/authz/context'
import { listOpenDuplicates } from '@/lib/repos/influencers'
import { formatDate } from '@/lib/util/format'
import { ResolverDuplicado, type LadoDelPar } from './resolver'
import { CasillaDeFila, SeleccionDeDuplicados } from './seleccion'

export const metadata: Metadata = { title: 'Posibles duplicados' }
export const dynamic = 'force-dynamic'

/** Adapta lo que devuelve el repositorio a lo que la pantalla necesita mostrar. */
type LadoCrudo = Awaited<ReturnType<typeof listOpenDuplicates>>['items'][number]['a']
const aLado = (lado: LadoCrudo): LadoParaPantalla => ({
  id: lado.id,
  displayName: lado.displayName,
  primaryHandle: lado.primaryHandle,
  country: lado.country,
  status: lado.status,
  createdAt: lado.createdAt.toISOString(),
  profiles: lado.profiles,
  candidacies: lado._count.candidacies,
  totalProfiles: lado._count.profiles,
})
type LadoParaPantalla = LadoDelPar

export default async function DuplicatesPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const params = await searchParams
  const ctx = await requireContext()
  const page = await loadPage(() => listOpenDuplicates(ctx, { page: Number(params.pagina ?? 1) || 1, pageSize: 30 }))
  const canManage = can(ctx, 'influencer.manage', null)

  return (
    <>
      <PageHeader
        title="Posibles duplicados"
        description="Detectados por URL normalizada, handle y similitud de nombre. Nunca se fusionan solos."
        breadcrumb={
          <Link href="/influencers" className="hover:underline">
            Influencers
          </Link>
        }
      />
      <div className="px-5 py-6 sm:px-8">
        <Card className={canManage ? 'px-5 pt-4' : undefined}>
          {page.items.length === 0 ? (
            <EmptyState title="No hay duplicados pendientes" description="Todo lo detectado ya fue resuelto." />
          ) : (
            <SeleccionDeDuplicados idsDeLaPagina={canManage ? page.items.map((d) => d.id) : []}>
            <ul className="divide-y divide-ink-100">
              {page.items.map((duplicate) => (
                <li key={duplicate.id} className="px-5 py-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                    {canManage ? (
                      <CasillaDeFila
                        id={duplicate.id}
                        nombre={`el par ${duplicate.a.displayName} y ${duplicate.b.displayName}`}
                      />
                    ) : null}
                    <span className="font-semibold tabular-nums text-ink-800">{duplicate.score}% de parecido</span>
                    <span aria-hidden="true">·</span>
                    <span>{duplicate.reason}</span>
                    <span aria-hidden="true">·</span>
                    <span>detectado {formatDate(duplicate.detectedAt, ctx.user.timezone)}</span>
                  </div>
                  <ResolverDuplicado
                    duplicateId={duplicate.id}
                    puedeGestionar={canManage}
                    a={aLado(duplicate.a)}
                    b={aLado(duplicate.b)}
                  />
                </li>
              ))}
            </ul>
            </SeleccionDeDuplicados>
          )}
        </Card>
      </div>
    </>
  )
}
