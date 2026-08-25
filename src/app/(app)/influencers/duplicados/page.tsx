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
import { DismissButton } from './dismiss-button'

export const metadata: Metadata = { title: 'Posibles duplicados' }
export const dynamic = 'force-dynamic'

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
        <Card>
          {page.items.length === 0 ? (
            <EmptyState title="No hay duplicados pendientes" description="Todo lo detectado ya fue resuelto." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {page.items.map((duplicate) => (
                <li key={duplicate.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-64">
                    <p className="text-sm font-medium text-ink-900">
                      <Link href={`/influencers/${duplicate.a.id}`} className="hover:text-brand-700">
                        {duplicate.a.displayName}
                      </Link>
                      <span className="mx-2 text-ink-400">vs</span>
                      <Link href={`/influencers/${duplicate.b.id}`} className="hover:text-brand-700">
                        {duplicate.b.displayName}
                      </Link>
                    </p>
                    <p className="text-xs text-ink-500">
                      {duplicate.reason} · detectado {formatDate(duplicate.detectedAt, ctx.user.timezone)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-ink-600">{duplicate.score}%</span>
                    {canManage ? <DismissButton duplicateId={duplicate.id} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
