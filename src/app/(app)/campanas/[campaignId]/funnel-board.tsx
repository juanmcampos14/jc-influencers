"use client"

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/field'
import { ApprovalBadge, StarsLabel } from '@/components/status-badge'
import { CANDIDACY_STATUS_SEED, statusCategoryLabel } from '@/lib/domain/statuses'
import { cn, formatFollowers } from '@/lib/util/format'
import type { CandidacyDto } from '@/lib/domain/dto'
import { changeStatusAction } from '../../actions/candidacies'

const CATEGORIES = ['SCREENING', 'PROPOSAL', 'NEGOTIATION', 'PRODUCTION', 'CLOSED'] as const
const STATUS_BY_KEY = new Map(CANDIDACY_STATUS_SEED.map((status) => [status.key, status]))

/** Estados de una categoría, en el orden en que avanza el trabajo. */
const estadosDe = (category: string) =>
  CANDIDACY_STATUS_SEED.filter((status) => status.category === category).sort((a, b) => a.order - b.order)

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
 *
 * Las tarjetas se arrastran de una columna a otra. Arrastrar NO puede ser la
 * única forma de mover a alguien: no funciona con teclado, ni con un lector de
 * pantalla, ni bien en una pantalla táctil. Por eso cada tarjeta lleva además
 * un selector con todos los estados, que es el camino accesible y también el
 * más rápido cuando ya sabés a dónde va.
 */
export function FunnelBoard({
  items,
  byStatus,
  mostrando,
  total,
  campaignId,
  puedeMover,
}: {
  items: CandidacyDto[]
  /** Conteo real por estado, de toda la campaña. */
  byStatus: Record<string, number>
  mostrando: number
  total: number
  campaignId: string
  puedeMover: boolean
}) {
  const tEtiqueta = useTranslations('etiquetas')
  const router = useRouter()
  const [moviendo, setMoviendo] = React.useState<string | null>(null)
  const [encima, setEncima] = React.useState<string | null>(null)
  const [, startTransition] = React.useTransition()

  /**
   * Movimiento optimista: la tarjeta salta de columna al soltarla y se corrige
   * sola si el servidor dice que no. Esperar el ida y vuelta con la tarjeta
   * quieta hace que se suelte dos veces.
   */
  const [optimista, setOptimista] = React.useState<Record<string, string>>({})

  const estadoDe = (item: CandidacyDto): string => optimista[item.id] ?? item.statusKey

  function mover(item: CandidacyDto, statusKey: string) {
    const anterior = estadoDe(item)
    if (statusKey === anterior) return

    setOptimista((actual) => ({ ...actual, [item.id]: statusKey }))
    setMoviendo(item.id)

    startTransition(async () => {
      const resultado = await changeStatusAction({ candidacyId: item.id, campaignId, statusKey }).catch(() => null)
      setMoviendo(null)

      if (!resultado || !resultado.ok) {
        // Vuelve a donde estaba: dejarla en la columna nueva mostraría un
        // cambio que la base no tiene.
        setOptimista((actual) => ({ ...actual, [item.id]: anterior }))
        toast.error(resultado && !resultado.ok ? resultado.message : 'No se pudo mover. Reintentá en un momento.')
        return
      }

      toast.success(
        `${item.influencer.displayName} → ${STATUS_BY_KEY.get(statusKey)?.label ?? statusKey}.`,
        {
          action: {
            label: 'Deshacer',
            onClick: () => mover(item, anterior),
          },
        },
      )
      router.refresh()
    })
  }

  const totalDe = (category: string): number =>
    CANDIDACY_STATUS_SEED.filter((status) => status.category === category).reduce(
      (suma, status) => suma + (byStatus[status.key] ?? 0),
      0,
    )

  const columns = CATEGORIES.map((category) => ({
    category,
    label: statusCategoryLabel(tEtiqueta, category),
    total: totalDe(category),
    items: items.filter((item) => STATUS_BY_KEY.get(estadoDe(item))?.category === category),
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

      {puedeMover ? (
        <p className="text-xs text-ink-500">
          Arrastrá una tarjeta a otra columna para moverla, o usá el selector de cada una.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        {columns.map((column) => {
          const destino = estadosDe(column.category)[0]
          return (
            <section
              key={column.category}
              className={cn(
                'rounded-xl border border-ink-200 bg-surface transition-colors',
                encima === column.category && 'border-brand-400 bg-brand-50/40',
              )}
              onDragOver={(evento) => {
                if (!puedeMover || !destino) return
                // Sin esto el navegador no considera la columna una zona válida.
                evento.preventDefault()
                setEncima(column.category)
              }}
              onDragLeave={() => setEncima((actual) => (actual === column.category ? null : actual))}
              onDrop={(evento) => {
                if (!puedeMover || !destino) return
                evento.preventDefault()
                setEncima(null)
                const id = evento.dataTransfer.getData('text/plain')
                const item = items.find((candidato) => candidato.id === id)
                if (!item) return
                // Se cae al primer estado de la categoría: la columna es la
                // etapa, y dentro de la etapa el detalle se elige en la tarjeta.
                const yaEnLaEtapa = STATUS_BY_KEY.get(estadoDe(item))?.category === column.category
                if (yaEnLaEtapa) return
                mover(item, destino.key)
              }}
            >
              <header className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
                <h2 className="text-sm font-semibold text-ink-900">{column.label}</h2>
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700">
                  {column.total}
                </span>
              </header>
              <ul className="space-y-2 p-2">
                {column.items.length === 0 ? (
                  <li className="px-2 py-6 text-center text-xs text-ink-500">
                    {column.total === 0 ? 'Nadie en esta etapa' : `${column.total} sin mostrar acá`}
                  </li>
                ) : (
                  column.items.map((item) => {
                    const profile = item.influencer.profiles[0]
                    const actual = estadoDe(item)
                    return (
                      <li
                        key={item.id}
                        draggable={puedeMover}
                        onDragStart={(evento) => {
                          evento.dataTransfer.setData('text/plain', item.id)
                          evento.dataTransfer.effectAllowed = 'move'
                        }}
                        className={cn(
                          'rounded-lg border border-ink-200 p-2.5',
                          puedeMover && 'cursor-grab active:cursor-grabbing',
                          moviendo === item.id && 'opacity-60',
                        )}
                      >
                        <p className="text-sm font-medium text-ink-900">{item.influencer.displayName}</p>
                        <p className="text-xs text-ink-500">
                          {profile?.handle ? `@${profile.handle}` : '—'} · {formatFollowers(profile?.followers)}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <Badge tone={STATUS_BY_KEY.get(actual)?.color ?? 'slate'}>
                            {STATUS_BY_KEY.get(actual)?.label ?? actual}
                          </Badge>
                          <ApprovalBadge approval={item.clientApproval} />
                          {item.clusterLabel ? <Badge tone="slate">{item.clusterLabel}</Badge> : null}
                          <StarsLabel value={item.fitScore} />
                        </div>
                        {puedeMover ? (
                          <Select
                            aria-label={`Mover a ${item.influencer.displayName}`}
                            className="mt-2 h-8 text-xs"
                            value={actual}
                            disabled={moviendo === item.id}
                            onChange={(evento) => mover(item, evento.target.value)}
                          >
                            {CATEGORIES.map((category) => (
                              <optgroup key={category} label={statusCategoryLabel(tEtiqueta, category)}>
                                {estadosDe(category).map((status) => (
                                  <option key={status.key} value={status.key}>
                                    {status.label}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </Select>
                        ) : null}
                      </li>
                    )
                  })
                )}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
