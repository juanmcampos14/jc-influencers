import { Badge } from '@/components/ui/badge'
import { ApprovalBadge, StarsLabel } from '@/components/status-badge'
import { CANDIDACY_STATUS_SEED, STATUS_CATEGORY_LABELS } from '@/lib/domain/statuses'
import { formatFollowers } from '@/lib/util/format'
import type { CandidacyDto } from '@/lib/domain/dto'

const CATEGORIES = ['SCREENING', 'PROPOSAL', 'NEGOTIATION', 'PRODUCTION', 'CLOSED'] as const
const STATUS_BY_KEY = new Map(CANDIDACY_STATUS_SEED.map((status) => [status.key, status]))

/**
 * Vista funnel: la hoja "vista funnel" del Excel estaba vacía; acá existe de verdad.
 *
 * Los contadores de cada columna salen de `byStatus`, que es un conteo sobre
 * toda la campaña. Las tarjetas son una muestra, y cuando lo son se dice.
 *
 * Antes el contador era la cantidad de tarjetas dibujadas: sobre una lista
 * acotada a cien, una campaña de ciento ochenta mostraba columnas que sumaban
 * cien mientras el encabezado de la misma pantalla decía ciento ochenta. El
 * funnel es la pantalla de reunión -- la que se usa para decir "tenemos cuarenta
 * en negociación" -- así que un número recortado ahí es el peor lugar posible.
 */
export function FunnelBoard({
  items,
  byStatus,
  mostrando,
  total,
}: {
  items: CandidacyDto[]
  /** Conteo real por estado, de toda la campaña. */
  byStatus: Record<string, number>
  mostrando: number
  total: number
}) {
  const totalDe = (category: string): number =>
    CANDIDACY_STATUS_SEED.filter((status) => status.category === category).reduce(
      (suma, status) => suma + (byStatus[status.key] ?? 0),
      0,
    )

  const columns = CATEGORIES.map((category) => ({
    category,
    label: STATUS_CATEGORY_LABELS[category],
    total: totalDe(category),
    items: items.filter((item) => STATUS_BY_KEY.get(item.statusKey)?.category === category),
  }))

  const esMuestra = mostrando < total

  return (
    <div className="space-y-3">
      {esMuestra ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Los números de cada columna son de la campaña completa ({total} perfiles). Las tarjetas muestran{' '}
          {mostrando}: para ver el resto, entrá a Perfiles.
        </p>
      ) : null}

        <div className="grid gap-4 lg:grid-cols-5">
        {columns.map((column) => (
        <section key={column.category} className="rounded-xl border border-ink-200 bg-surface">
          <header className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
            <h2 className="text-sm font-semibold text-ink-900">{column.label}</h2>
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700">
              {column.total}
            </span>
          </header>
          <ul className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
            {column.items.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-ink-500">
                {column.total === 0 ? 'Nadie en esta etapa' : `${column.total} sin mostrar acá`}
              </li>
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
    </div>
  )
}
