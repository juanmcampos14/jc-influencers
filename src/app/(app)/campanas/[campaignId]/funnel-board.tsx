import { Badge } from '@/components/ui/badge'
import { ApprovalBadge, StarsLabel } from '@/components/status-badge'
import { CANDIDACY_STATUS_SEED, STATUS_CATEGORY_LABELS } from '@/lib/domain/statuses'
import { formatFollowers } from '@/lib/util/format'
import type { CandidacyDto } from '@/lib/domain/dto'

const CATEGORIES = ['SCREENING', 'PROPOSAL', 'NEGOTIATION', 'PRODUCTION', 'CLOSED'] as const
const STATUS_BY_KEY = new Map(CANDIDACY_STATUS_SEED.map((status) => [status.key, status]))

/** Vista funnel: la hoja "vista funnel" del Excel estaba vacía; acá existe de verdad. */
export function FunnelBoard({ items }: { items: CandidacyDto[] }) {
  const columns = CATEGORIES.map((category) => ({
    category,
    label: STATUS_CATEGORY_LABELS[category],
    items: items.filter((item) => STATUS_BY_KEY.get(item.statusKey)?.category === category),
  }))

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {columns.map((column) => (
        <section key={column.category} className="rounded-xl border border-ink-200 bg-surface">
          <header className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
            <h2 className="text-sm font-semibold text-ink-900">{column.label}</h2>
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700">
              {column.items.length}
            </span>
          </header>
          <ul className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
            {column.items.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-ink-400">Vacío</li>
            ) : (
              column.items.map((item) => {
                const profile = item.influencer.profiles[0]
                return (
                  <li key={item.id} className="rounded-lg border border-ink-200 p-2.5">
                    <p className="text-sm font-medium text-ink-900">{item.influencer.displayName}</p>
                    <p className="text-xs text-ink-500">
                      {profile?.handle ? `@${profile.handle}` : '—'} · {formatFollowers(profile?.followers)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <Badge tone={STATUS_BY_KEY.get(item.statusKey)?.color ?? 'slate'}>
                        {STATUS_BY_KEY.get(item.statusKey)?.label ?? item.statusKey}
                      </Badge>
                      <ApprovalBadge approval={item.clientApproval} />
                      {item.clusterLabel ? <Badge tone="slate">{item.clusterLabel}</Badge> : null}
                      <StarsLabel value={item.fitScore} />
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </section>
      ))}
    </div>
  )
}
