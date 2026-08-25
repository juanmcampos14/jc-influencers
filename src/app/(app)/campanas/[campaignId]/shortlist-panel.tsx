"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/states'
import { ApprovalBadge, StarsLabel } from '@/components/status-badge'
import { formatFollowers, formatPercent } from '@/lib/util/format'
import type { CandidacyDto } from '@/lib/domain/dto'
import { shortlistAction } from '../../actions/candidacies'

/** Shortlist ordenada. El orden es el que ve el cliente en su portal. */
export function ShortlistPanel({
  campaignId,
  items,
  canManage,
}: {
  campaignId: string
  items: CandidacyDto[]
  canManage: boolean
}) {
  const router = useRouter()
  const [orders, setOrders] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((item, index) => [item.id, item.shortlistOrder ?? index + 1])),
  )
  const [pending, startTransition] = React.useTransition()

  function save() {
    const entries = Object.entries(orders)
      .map(([candidacyId, order]) => ({ candidacyId, order }))
      .filter((entry) => Number.isFinite(entry.order) && entry.order > 0)
      .sort((a, b) => a.order - b.order)
    startTransition(async () => {
      const result = await shortlistAction({ campaignId, entries })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('Shortlist actualizada.')
      router.refresh()
    })
  }

  function remove(candidacyId: string) {
    const entries = Object.entries(orders)
      .filter(([id]) => id !== candidacyId)
      .map(([id, order]) => ({ candidacyId: id, order }))
      .sort((a, b) => a.order - b.order)
      .map((entry, index) => ({ candidacyId: entry.candidacyId, order: index + 1 }))
    startTransition(async () => {
      const result = await shortlistAction({ campaignId, entries })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('Perfil quitado de la shortlist.')
      router.refresh()
    })
  }

  const sorted = [...items].sort((a, b) => (a.shortlistOrder ?? 999) - (b.shortlistOrder ?? 999))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shortlist para el cliente</CardTitle>
        <p className="text-xs text-ink-500">
          Este es el orden en el que el cliente ve los perfiles en su portal.
        </p>
      </CardHeader>
      {sorted.length === 0 ? (
        <EmptyState
          title="La shortlist está vacía"
          description="Marcá perfiles desde la pestaña Perfiles para armar la propuesta que ve el cliente."
        />
      ) : (
        <>
          <ol className="divide-y divide-ink-100">
            {sorted.map((item) => {
              const profile = item.influencer.profiles[0]
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                  {canManage ? (
                    <Input
                      type="number"
                      min={1}
                      className="w-16"
                      aria-label={`Orden de ${item.influencer.displayName}`}
                      value={orders[item.id] ?? ''}
                      onChange={(event) =>
                        setOrders((current) => ({ ...current, [item.id]: Number(event.target.value) }))
                      }
                    />
                  ) : (
                    <span className="w-8 text-sm font-semibold tabular-nums text-ink-500">#{item.shortlistOrder}</span>
                  )}
                  <div className="min-w-48 flex-1">
                    <p className="text-sm font-medium text-ink-900">{item.influencer.displayName}</p>
                    <p className="text-xs text-ink-500">
                      {item.clusterLabel ?? 'sin cluster'} · {formatFollowers(profile?.followers)} ·{' '}
                      {formatPercent(profile?.engagementRate)}
                    </p>
                  </div>
                  <StarsLabel value={item.fitScore} />
                  <ApprovalBadge approval={item.clientApproval} />
                  {canManage ? (
                    <Button size="sm" variant="ghost" onClick={() => remove(item.id)} disabled={pending}>
                      Quitar
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ol>
          {canManage ? (
            <CardBody className="border-t border-ink-200">
              <Button onClick={save} disabled={pending}>
                {pending ? 'Guardando…' : 'Guardar orden'}
              </Button>
            </CardBody>
          ) : null}
        </>
      )}
    </Card>
  )
}
