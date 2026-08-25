"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/states'
import { ApprovalBadge, ExternalLink, StarsLabel } from '@/components/status-badge'
import { CANDIDACY_STATUS_SEED } from '@/lib/domain/statuses'
import { formatFollowers, formatPercent, formatDate } from '@/lib/util/format'
import type { CandidacyDto } from '@/lib/domain/dto'
import { approvalAction } from '@/app/(app)/actions/candidacies'

const STATUS_BY_KEY = new Map(CANDIDACY_STATUS_SEED.map((status) => [status.key, status]))

type PendingAction = { candidacy: CandidacyDto; approval: 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW' | 'REPLACEMENT_REQUESTED' }

const ACTION_COPY: Record<
  PendingAction['approval'],
  { title: string; description: string; confirm: string; requireFeedback: boolean; hecho: string }
> = {
  APPROVED: {
    title: 'Aprobar perfil',
    description: 'Le confirmás a la agencia que este perfil va. Podés dejar un comentario opcional.',
    confirm: 'Aprobar',
    requireFeedback: false,
    hecho: 'aprobado',
  },
  REJECTED: {
    title: 'Rechazar perfil',
    description: 'Contanos por qué no encaja: ayuda a que la próxima propuesta sea mejor.',
    confirm: 'Rechazar',
    requireFeedback: true,
    hecho: 'rechazado',
  },
  NEEDS_REVIEW: {
    title: 'Pedir revisión',
    description: 'Queda marcado como “a revisar” y la agencia va a volver con más información.',
    confirm: 'Pedir revisión',
    requireFeedback: false,
    hecho: 'marcado a revisar',
  },
  REPLACEMENT_REQUESTED: {
    title: 'Pedir reemplazo',
    description: 'La agencia va a proponer otro perfil en lugar de este.',
    confirm: 'Pedir reemplazo',
    requireFeedback: false,
    hecho: 'marcado para reemplazo',
  },
}

/** Vista del cliente: comparación de perfiles y decisión. Sin notas internas ni costos. */
export function ProposalList({
  campaignId,
  items,
  canApprove,
  timezone,
}: {
  campaignId: string
  items: CandidacyDto[]
  canApprove: boolean
  timezone: string
}) {
  const router = useRouter()
  const [action, setAction] = React.useState<PendingAction | null>(null)
  const [feedback, setFeedback] = React.useState('')
  const [pending, startTransition] = React.useTransition()
  /** Decisión ya tomada que todavía no volvió del servidor. */
  const [optimista, setOptimista] = React.useState<Record<string, string>>({})
  const [guardando, setGuardando] = React.useState<string | null>(null)

  /**
   * Aprobar no abre ningún diálogo.
   *
   * El comentario al aprobar era opcional, así que el modal sólo agregaba dos
   * clics por perfil: decidir veinte perfiles eran cuarenta clics y veinte
   * ventanas. Ahora se aplica en el momento y el aviso ofrece deshacer, que es
   * lo que el modal intentaba proteger.
   */
  function decidirDirecto(item: CandidacyDto, approval: PendingAction['approval'], anterior: string) {
    setOptimista((actual) => ({ ...actual, [item.id]: approval }))
    setGuardando(item.id)
    startTransition(async () => {
      const result = await approvalAction({ candidacyId: item.id, campaignId, approval, feedback: null })
      setGuardando(null)
      if (!result.ok) {
        setOptimista((actual) => ({ ...actual, [item.id]: anterior }))
        toast.error(result.message)
        return
      }
      toast.success(`${item.influencer.displayName}: ${ACTION_COPY[approval].hecho}`, {
        duration: 6000,
        action:
          anterior === 'PENDING' || anterior === 'NEEDS_REVIEW'
            ? {
                label: 'Deshacer',
                onClick: () => decidirDirecto(item, anterior as PendingAction['approval'], approval),
              }
            : undefined,
      })
      router.refresh()
    })
  }

  function submit() {
    if (!action) return
    const copy = ACTION_COPY[action.approval]
    if (copy.requireFeedback && !feedback.trim()) {
      toast.error('Contanos el motivo antes de rechazar.')
      return
    }
    startTransition(async () => {
      const result = await approvalAction({
        candidacyId: action.candidacy.id,
        campaignId,
        approval: action.approval,
        feedback: feedback.trim() || null,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('Listo. La agencia ya lo ve.')
      setAction(null)
      setFeedback('')
      router.refresh()
    })
  }

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No hay perfiles para mostrar"
          description="Cuando la agencia comparta perfiles con vos van a aparecer acá."
        />
      </Card>
    )
  }

  return (
    <>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const profile = item.influencer.profiles[0]
          const status = STATUS_BY_KEY.get(item.statusKey)
          const decision = optimista[item.id] ?? item.clientApproval
          return (
            <li key={item.id} className="flex flex-col rounded-xl border border-ink-200 bg-surface p-5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-ink-900">{item.influencer.displayName}</h3>
                  <p className="text-xs text-ink-500">
                    {item.influencer.country ?? '—'}
                    {item.clusterLabel ? ` · ${item.clusterLabel}` : ''}
                    {item.inShortlist ? ` · shortlist #${item.shortlistOrder ?? ''}` : ''}
                  </p>
                </div>
                <ApprovalBadge approval={decision} />
              </div>

              <dl className="mb-3 grid grid-cols-3 gap-2 rounded-lg bg-ink-50 p-2.5 text-center">
                <div>
                  <dt className="text-[11px] text-ink-500">Seguidores</dt>
                  <dd className="text-sm font-semibold tabular-nums text-ink-900">
                    {formatFollowers(profile?.followers)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-500">Engagement</dt>
                  <dd className="text-sm font-semibold tabular-nums text-ink-900">
                    {formatPercent(profile?.engagementRate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-500">Fit</dt>
                  <dd className="text-sm font-semibold">
                    <StarsLabel value={item.fitScore} />
                  </dd>
                </div>
              </dl>

              {profile?.stale ? (
                <p className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                  Métricas medidas {profile.measuredAt ? `el ${formatDate(profile.measuredAt, timezone)}` : 'sin fecha'}.
                  La agencia las va a verificar antes de contactar.
                </p>
              ) : null}

              {item.agencyRationale ? (
                <div className="mb-2">
                  <p className="text-[11px] font-medium text-ink-500">Por qué lo proponemos</p>
                  <p className="text-sm text-ink-700">{item.agencyRationale}</p>
                </div>
              ) : null}

              {item.contentIdea ? (
                <div className="mb-2">
                  <p className="text-[11px] font-medium text-ink-500">Idea de contenido</p>
                  <p className="text-sm text-ink-700">{item.contentIdea}</p>
                </div>
              ) : null}

              {item.deliverablesSummary ? (
                <p className="mb-2 text-xs text-ink-600">Entregables: {item.deliverablesSummary}</p>
              ) : null}

              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                {status ? <Badge tone={status.color}>{status.label}</Badge> : null}
                {item.influencer.profiles.map((entry) => (
                  <ExternalLink key={entry.id} href={entry.url}>
                    {entry.platform.toLowerCase()}
                  </ExternalLink>
                ))}
              </div>

              {canApprove ? (
                /*
                 * Dos decisiones a la vista y el resto en un menú.
                 *
                 * Antes había cuatro botones por tarjeta: con doscientos
                 * perfiles eran ochocientos botones, y "A revisar" contra
                 * "Pedir reemplazo" no las distingue nadie fuera del equipo.
                 */
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    className="min-h-11 flex-1"
                    disabled={guardando === item.id}
                    onClick={() => decidirDirecto(item, 'APPROVED', decision)}
                  >
                    {guardando === item.id ? 'Guardando…' : 'Aprobar'}
                  </Button>
                  <Button
                    variant="danger"
                    className="min-h-11 flex-1"
                    disabled={guardando === item.id}
                    onClick={() => setAction({ candidacy: item, approval: 'REJECTED' })}
                  >
                    Rechazar
                  </Button>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger
                      className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-ink-300 text-ink-600 transition-colors hover:bg-ink-50"
                      aria-label={`Otras opciones para ${item.influencer.displayName}`}
                      disabled={guardando === item.id}
                    >
                      <MoreHorizontal className="size-4" aria-hidden="true" />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        sideOffset={6}
                        className="z-50 w-56 rounded-xl border border-ink-200 bg-surface p-1 shadow-xl"
                      >
                        <DropdownMenu.Item
                          onSelect={() => setAction({ candidacy: item, approval: 'NEEDS_REVIEW' })}
                          className="cursor-pointer rounded-lg px-2.5 py-2 text-sm text-ink-800 outline-none data-[highlighted]:bg-ink-100"
                        >
                          Pedir más información
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          onSelect={() => setAction({ candidacy: item, approval: 'REPLACEMENT_REQUESTED' })}
                          className="cursor-pointer rounded-lg px-2.5 py-2 text-sm text-ink-800 outline-none data-[highlighted]:bg-ink-100"
                        >
                          Pedir otro perfil en su lugar
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
              ) : (
                <p className="mt-auto pt-1 text-xs text-ink-500">Tu rol es de sólo lectura.</p>
              )}
            </li>
          )
        })}
      </ul>

      {action ? (
        <Dialog open onOpenChange={(open) => (open ? undefined : setAction(null))}>
          <DialogContent
            title={`${ACTION_COPY[action.approval].title}: ${action.candidacy.influencer.displayName}`}
            description={ACTION_COPY[action.approval].description}
            className="w-[min(32rem,calc(100vw-2rem))]"
          >
            <div className="space-y-4">
              <Field
                label="Comentario"
                htmlFor="feedback"
                required={ACTION_COPY[action.approval].requireFeedback}
                hint="Lo ve la agencia."
              >
                <Textarea
                  id="feedback"
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  rows={4}
                  maxLength={4000}
                  autoFocus
                />
              </Field>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant={action.approval === 'REJECTED' ? 'danger' : 'primary'}
                  onClick={submit}
                  disabled={pending}
                >
                  {pending ? 'Guardando…' : ACTION_COPY[action.approval].confirm}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}
