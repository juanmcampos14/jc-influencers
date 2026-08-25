"use client"

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/states'
import { columnaFija, Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { ApprovalBadge, ExternalLink, StarsLabel, StatusBadge } from '@/components/status-badge'
import { CANDIDACY_STATUS_SEED } from '@/lib/domain/statuses'

/** Etiqueta visible de cada estado, para los avisos. */
const STATUS_LABEL = new Map(CANDIDACY_STATUS_SEED.map((status) => [status.key, status.label]))
import { cn, formatFollowers, formatMoney, formatPercent } from '@/lib/util/format'
import type { CandidacyDto } from '@/lib/domain/dto'
import type { Paginated } from '@/lib/repos/base'
import { changeStatusAction, updateCandidacyAction, visibilityAction } from '../../actions/candidacies'
import { analyzeProfileAction } from '../../actions/ai'
import { InsightView } from '@/components/insight-view'
import type { InsightDto } from '@/lib/repos/ai'

type Cluster = { id: string; label: string }
type Permissions = {
  canManage: boolean
  canSeeInternal: boolean
  canSeeBudget: boolean
  canEditBudget: boolean
  canRunAi: boolean
  aiConfigured: boolean
}

const ALL_COLUMNS = [
  { key: 'creador', label: 'Creador' },
  { key: 'cluster', label: 'Cluster' },
  { key: 'perfil', label: 'Perfil' },
  { key: 'seguidores', label: 'Seguidores' },
  { key: 'er', label: 'ER' },
  { key: 'fit', label: 'Fit' },
  { key: 'estado', label: 'Estado' },
  { key: 'aprobacion', label: 'Aprobación' },
  { key: 'entregables', label: 'Entregables' },
  { key: 'presupuesto', label: 'Presupuesto' },
  { key: 'visible', label: 'Visible al cliente' },
] as const

type ColumnKey = (typeof ALL_COLUMNS)[number]['key']
const STORAGE_KEY = 'jc-columnas-candidaturas'

export function CandidacyTable({
  campaignId,
  currency,
  data,
  clusters,
  team,
  permissions,
  filters,
}: {
  campaignId: string
  currency: string
  data: Paginated<CandidacyDto>
  clusters: Cluster[]
  team: Array<{ userId: string; name: string }>
  permissions: Permissions
  filters: { estado: string; q: string }
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [detail, setDetail] = React.useState<CandidacyDto | null>(null)
  const [pending, startTransition] = React.useTransition()
  /**
   * Cambios de estado que ya se pidieron pero todavía no volvieron del
   * servidor. Sin esto el desplegable mostraba el valor viejo hasta que llegaba
   * la respuesta: elegías "Aprobado", volvía solo a lo anterior, y un segundo
   * después cambiaba. La interacción más repetida de la pantalla parecía rota.
   */
  const [optimista, setOptimista] = React.useState<Record<string, string>>({})
  /** Qué fila se está guardando. Antes se deshabilitaba la tabla entera. */
  const [guardando, setGuardando] = React.useState<string | null>(null)
  const [visible, setVisible] = React.useState<ColumnKey[]>(() =>
    ALL_COLUMNS.map((column) => column.key).filter((key) => key !== 'entregables'),
  )

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as ColumnKey[]
      if (Array.isArray(parsed) && parsed.length > 0) setVisible(parsed)
    } catch {
      /* preferencia corrupta: se ignora */
    }
  }, [])

  function toggleColumn(key: ColumnKey) {
    setVisible((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const shows = (key: ColumnKey) => visible.includes(key)

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const next = new URLSearchParams(params.toString())
    next.set('tab', 'perfiles')
    for (const key of ['q', 'estado']) {
      const value = String(form.get(key) ?? '').trim()
      if (value) next.set(key, value)
      else next.delete(key)
    }
    next.delete('pagina')
    router.push(`/campanas/${campaignId}?${next.toString()}`)
  }

  function setVisibility(value: boolean) {
    const ids = [...selected]
    startTransition(async () => {
      const result = await visibilityAction({ candidacyIds: ids, visible: value, campaignId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(value ? `${result.data.count} perfiles ahora los ve el cliente.` : `${result.data.count} perfiles ocultos.`)
      setSelected(new Set())
      router.refresh()
    })
  }

  function changeStatus(candidacyId: string, statusKey: string, anterior: string) {
    setOptimista((actual) => ({ ...actual, [candidacyId]: statusKey }))
    setGuardando(candidacyId)
    startTransition(async () => {
      const result = await changeStatusAction({ candidacyId, campaignId, statusKey })
      setGuardando(null)
      if (!result.ok) {
        // Vuelve a lo que había: mostrar un estado que no se guardó sería peor
        // que no haber cambiado nada.
        setOptimista((actual) => ({ ...actual, [candidacyId]: anterior }))
        toast.error(result.message)
        return
      }
      const etiqueta = STATUS_LABEL.get(statusKey) ?? statusKey
      toast.success(`Estado: ${etiqueta}.`, {
        action: {
          label: 'Deshacer',
          onClick: () => changeStatus(candidacyId, anterior, statusKey),
        },
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3" role="search">
          <div className="w-56">
            <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-600">
              Buscar creador
            </label>
            <Input id="q" name="q" defaultValue={filters.q} placeholder="Nombre o handle" />
          </div>
          <div className="w-52">
            <label htmlFor="estado" className="mb-1 block text-xs font-medium text-ink-600">
              Estado
            </label>
            <Select id="estado" name="estado" defaultValue={filters.estado}>
              <option value="">Todos</option>
              {CANDIDACY_STATUS_SEED.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.label}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>

        <details className="relative">
          <summary className="cursor-pointer list-none rounded-lg border border-ink-300 bg-surface px-3 py-2 text-sm text-ink-700 hover:bg-ink-50">
            Columnas
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-ink-200 bg-surface p-2 shadow-lg">
            {ALL_COLUMNS.map((column) => (
              <label key={column.key} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-ink-50">
                <Checkbox checked={shows(column.key)} onChange={() => toggleColumn(column.key)} />
                {column.label}
              </label>
            ))}
          </div>
        </details>
      </div>

      {permissions.canManage && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5">
          <span className="text-sm font-medium text-brand-800">{selected.size} seleccionados</span>
          <Button size="sm" onClick={() => setVisibility(true)} disabled={pending}>
            Mostrar al cliente
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setVisibility(false)} disabled={pending}>
            Ocultar del cliente
          </Button>
          <button type="button" className="text-sm text-brand-700 underline" onClick={() => setSelected(new Set())}>
            Limpiar
          </button>
        </div>
      ) : null}

      <Card>
        {data.items.length === 0 ? (
          <EmptyState
            title="No hay perfiles"
            description="Agregá influencers a la campaña o importá el Excel de scouting."
          />
        ) : (
          <>
            <TableWrap className="max-h-[70vh]">
              <Table>
                <thead>
                  <tr>
                    {permissions.canManage ? (
                      <Th className="w-10">
                        <Checkbox
                          aria-label="Seleccionar todos"
                          checked={selected.size === data.items.length && data.items.length > 0}
                          onChange={(event) =>
                            setSelected(event.target.checked ? new Set(data.items.map((item) => item.id)) : new Set())
                          }
                        />
                      </Th>
                    ) : null}
                    {shows('creador') ? <Th className={columnaFija}>Creador</Th> : null}
                    {shows('cluster') ? <Th>Cluster</Th> : null}
                    {shows('perfil') ? <Th>Perfil</Th> : null}
                    {shows('seguidores') ? <Th className="text-right">Seguidores</Th> : null}
                    {shows('er') ? <Th className="text-right">ER</Th> : null}
                    {shows('fit') ? <Th>Fit</Th> : null}
                    {shows('estado') ? <Th>Estado</Th> : null}
                    {shows('aprobacion') ? <Th>Aprobación</Th> : null}
                    {shows('entregables') ? <Th>Entregables</Th> : null}
                    {shows('presupuesto') && permissions.canSeeBudget ? <Th className="text-right">Presupuesto</Th> : null}
                    {shows('visible') ? <Th>Ve el cliente</Th> : null}
                    <Th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => {
                    const profile = item.influencer.profiles[0]
                    return (
                      <Tr key={item.id}>
                        {permissions.canManage ? (
                          <Td>
                            <Checkbox
                              aria-label={`Seleccionar ${item.influencer.displayName}`}
                              checked={selected.has(item.id)}
                              onChange={(event) => {
                                setSelected((current) => {
                                  const next = new Set(current)
                                  if (event.target.checked) next.add(item.id)
                                  else next.delete(item.id)
                                  return next
                                })
                              }}
                            />
                          </Td>
                        ) : null}
                        {shows('creador') ? (
                          /*
                           * Anclada al borde izquierdo: con once columnas, al
                           * correrse a la derecha se perdía de vista de quién
                           * era cada fila. Y "Ficha" -- la acción principal --
                           * vive acá y no al final, donde en un teléfono no se
                           * llegaba nunca.
                           */
                          <Td className={columnaFija}>
                            <div className="flex items-center gap-2.5">
                              <Avatar name={item.influencer.displayName} size="sm" />
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => setDetail(item)}
                                  className="block max-w-44 truncate text-left font-medium text-ink-900 underline-offset-4 hover:underline"
                                >
                                  {item.influencer.displayName}
                                </button>
                                <p className="truncate text-xs text-ink-500">
                                  {item.influencer.country ?? '—'}
                                  {item.rank ? ` · #${item.rank}` : ''}
                                </p>
                              </div>
                            </div>
                          </Td>
                        ) : null}
                        {shows('cluster') ? (
                          <Td className="text-xs">{item.clusterLabel ?? <span className="text-ink-400">—</span>}</Td>
                        ) : null}
                        {shows('perfil') ? (
                          <Td className="text-xs">
                            {profile ? (
                              <ExternalLink href={profile.url}>
                                {profile.handle ? `@${profile.handle}` : profile.platform}
                              </ExternalLink>
                            ) : (
                              <span className="text-ink-400">sin perfil</span>
                            )}
                          </Td>
                        ) : null}
                        {shows('seguidores') ? (
                          <Td className="text-right tabular-nums">
                            {formatFollowers(profile?.followers)}
                            {profile?.followersUnparsed ? (
                              <span
                                className="ml-1 text-amber-600"
                                title={`Valor original sin normalizar: ${profile.followersRaw ?? ''}`}
                              >
                                !
                              </span>
                            ) : null}
                            {profile?.stale ? (
                              <span className="block text-[11px] font-medium text-amber-700">sin actualizar</span>
                            ) : null}
                          </Td>
                        ) : null}
                        {shows('er') ? (
                          <Td className="text-right tabular-nums">{formatPercent(profile?.engagementRate)}</Td>
                        ) : null}
                        {shows('fit') ? (
                          <Td>
                            <StarsLabel value={item.fitScore} />
                          </Td>
                        ) : null}
                        {shows('estado') ? (
                          <Td>
                            {permissions.canManage ? (
                              <Select
                                aria-label={`Estado de ${item.influencer.displayName}`}
                                value={optimista[item.id] ?? item.statusKey}
                                onChange={(event) =>
                                  changeStatus(item.id, event.target.value, optimista[item.id] ?? item.statusKey)
                                }
                                // Sólo se bloquea la fila que se está guardando,
                                // no las otras cuarenta y nueve.
                                disabled={guardando === item.id}
                                aria-busy={guardando === item.id}
                                className={cn('h-8 min-w-40 text-xs', guardando === item.id && 'opacity-60')}
                              >
                                {CANDIDACY_STATUS_SEED.map((status) => (
                                  <option key={status.key} value={status.key}>
                                    {status.label}
                                  </option>
                                ))}
                              </Select>
                            ) : (
                              <StatusBadge statusKey={item.statusKey} />
                            )}
                          </Td>
                        ) : null}
                        {shows('aprobacion') ? (
                          <Td>
                            <ApprovalBadge approval={item.clientApproval} />
                          </Td>
                        ) : null}
                        {shows('entregables') ? (
                          <Td className="text-xs text-ink-600">
                            {item.deliverablesSummary ??
                              ([
                                item.counts.stories ? `${item.counts.stories} stories` : null,
                                item.counts.reels ? `${item.counts.reels} reels` : null,
                                item.counts.posts ? `${item.counts.posts} posts` : null,
                                item.counts.tiktoks ? `${item.counts.tiktoks} tiktoks` : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') ||
                                '—')}
                          </Td>
                        ) : null}
                        {shows('presupuesto') && permissions.canSeeBudget ? (
                          <Td className="text-right tabular-nums">
                            {formatMoney(item.budget?.negotiated ?? item.budget?.requested, item.budget?.currency ?? currency)}
                          </Td>
                        ) : null}
                        {shows('visible') ? (
                          <Td>
                            {item.clientVisible ? <Badge tone="emerald">Sí</Badge> : <Badge tone="slate">No</Badge>}
                          </Td>
                        ) : null}
                        <Td>
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/influencers/${item.influencer.id}`}>Ver perfil</Link>
                          </Button>
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination
              base={`/campanas/${campaignId}`}
              params={params}
              page={data.page}
              pageCount={data.pageCount}
              total={data.total}
              unidad="perfiles"
            />
          </>
        )}
      </Card>

      {detail ? (
        <CandidacyDialog
          campaignId={campaignId}
          currency={currency}
          candidacy={detail}
          clusters={clusters}
          team={team}
          permissions={permissions}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </div>
  )
}

function CandidacyDialog({
  campaignId,
  currency,
  candidacy,
  clusters,
  team,
  permissions,
  onClose,
}: {
  campaignId: string
  currency: string
  candidacy: CandidacyDto
  clusters: Cluster[]
  team: Array<{ userId: string; name: string }>
  permissions: Permissions
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [errors, setErrors] = React.useState<Record<string, string[]>>({})
  const [insight, setInsight] = React.useState<InsightDto | null>(null)

  function analyze() {
    startTransition(async () => {
      const result = await analyzeProfileAction({ candidacyId: candidacy.id, campaignId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      if (result.data.status === 'FAILED') {
        toast.error(result.data.errorMessage ?? 'No se pudo generar el análisis.')
      }
      setInsight(result.data)
    })
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const num = (key: string) => {
      const value = String(form.get(key) ?? '').trim()
      return value ? Number(value) : null
    }
    setErrors({})
    startTransition(async () => {
      const result = await updateCandidacyAction({
        candidacyId: candidacy.id,
        campaignId,
        version: candidacy.version,
        clusterId: String(form.get('clusterId') ?? '') || null,
        rank: num('rank'),
        fitScore: num('fitScore'),
        agencyRationale: String(form.get('agencyRationale') ?? '') || null,
        contentIdea: String(form.get('contentIdea') ?? '') || null,
        deliverablesSummary: String(form.get('deliverablesSummary') ?? '') || null,
        storiesCount: Number(form.get('storiesCount') ?? 0),
        reelsCount: Number(form.get('reelsCount') ?? 0),
        postsCount: Number(form.get('postsCount') ?? 0),
        tiktoksCount: Number(form.get('tiktoksCount') ?? 0),
        videosCount: Number(form.get('videosCount') ?? 0),
        availability: String(form.get('availability') ?? 'UNKNOWN') as never,
        contactStatus: String(form.get('contactStatus') ?? 'NOT_CONTACTED') as never,
        negotiationStatus: String(form.get('negotiationStatus') ?? 'NOT_STARTED') as never,
        ownerUserId: String(form.get('ownerUserId') ?? '') || null,
        rejectionReason: String(form.get('rejectionReason') ?? '') || null,
        ...(permissions.canSeeInternal ? { internalNotes: String(form.get('internalNotes') ?? '') || null } : {}),
        ...(permissions.canEditBudget
          ? {
              currency: String(form.get('currency') ?? currency),
              budgetRequested: num('budgetRequested'),
              budgetNegotiated: num('budgetNegotiated'),
              cacheAmount: num('cacheAmount'),
              barterDescription: String(form.get('barterDescription') ?? '') || null,
              budgetPrivateNotes: String(form.get('budgetPrivateNotes') ?? '') || null,
            }
          : {}),
      })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }
      toast.success('Candidatura actualizada.')
      onClose()
      router.refresh()
    })
  }

  const profile = candidacy.influencer.profiles[0]

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={candidacy.influencer.displayName}
        description={
          profile
            ? `${profile.platform} · ${profile.handle ? `@${profile.handle}` : ''} · ${formatFollowers(profile.followers)} seguidores`
            : 'Sin perfil social cargado'
        }
        className="w-[min(52rem,calc(100vw-2rem))]"
      >
        {permissions.canRunAi ? (
          <div className="mb-4 rounded-lg border border-ink-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink-800">Análisis del perfil contra el brief</p>
                <p className="text-xs text-ink-500">
                  Usa las métricas cargadas y el brief de la campaña. Si falta un dato, lo dice.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={analyze}
                disabled={pending || !permissions.aiConfigured}
              >
                {pending ? 'Analizando…' : 'Analizar con IA'}
              </Button>
            </div>
            {!permissions.aiConfigured ? (
              <p className="mt-2 text-xs text-amber-800">
                Falta configurar ANTHROPIC_API_KEY para habilitar esta función.
              </p>
            ) : null}
            {insight ? (
              <div className="mt-3">
                <InsightView insight={insight} timezone="America/Argentina/Buenos_Aires" />
              </div>
            ) : null}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Cluster" htmlFor="clusterId">
              <Select id="clusterId" name="clusterId" defaultValue={candidacy.clusterId ?? ''}>
                <option value="">Sin cluster</option>
                {clusters.map((cluster) => (
                  <option key={cluster.id} value={cluster.id}>
                    {cluster.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Orden" htmlFor="rank">
              <Input id="rank" name="rank" type="number" min={0} defaultValue={candidacy.rank ?? ''} />
            </Field>
            <Field label="Fit (1 a 5)" htmlFor="fitScore">
              <Input id="fitScore" name="fitScore" type="number" min={1} max={5} defaultValue={candidacy.fitScore ?? ''} />
            </Field>
          </div>

          <Field label="Justificación de la agencia" htmlFor="agencyRationale" hint="La ve el cliente.">
            <Textarea id="agencyRationale" name="agencyRationale" defaultValue={candidacy.agencyRationale ?? ''} />
          </Field>
          <Field label="Idea de contenido" htmlFor="contentIdea">
            <Textarea id="contentIdea" name="contentIdea" defaultValue={candidacy.contentIdea ?? ''} />
          </Field>
          <Field label="Entregables" htmlFor="deliverablesSummary">
            <Input id="deliverablesSummary" name="deliverablesSummary" defaultValue={candidacy.deliverablesSummary ?? ''} />
          </Field>

          <fieldset className="grid gap-3 rounded-lg border border-ink-200 p-3 sm:grid-cols-5">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Cantidades</legend>
            {(
              [
                ['storiesCount', 'Stories', candidacy.counts.stories],
                ['reelsCount', 'Reels', candidacy.counts.reels],
                ['postsCount', 'Posts', candidacy.counts.posts],
                ['tiktoksCount', 'TikToks', candidacy.counts.tiktoks],
                ['videosCount', 'Videos', candidacy.counts.videos],
              ] as const
            ).map(([name, label, value]) => (
              <Field key={name} label={label} htmlFor={name}>
                <Input id={name} name={name} type="number" min={0} defaultValue={value} />
              </Field>
            ))}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Disponibilidad" htmlFor="availability">
              <Select id="availability" name="availability" defaultValue={candidacy.availability}>
                <option value="UNKNOWN">Sin confirmar</option>
                <option value="AVAILABLE">Disponible</option>
                <option value="CONDITIONAL">Condicional</option>
                <option value="UNAVAILABLE">No disponible</option>
              </Select>
            </Field>
            <Field label="Contacto" htmlFor="contactStatus">
              <Select id="contactStatus" name="contactStatus" defaultValue={candidacy.contactStatus}>
                <option value="NOT_CONTACTED">Sin contactar</option>
                <option value="CONTACTED">Contactado</option>
                <option value="RESPONDED">Respondió</option>
                <option value="NO_RESPONSE">Sin respuesta</option>
              </Select>
            </Field>
            <Field label="Negociación" htmlFor="negotiationStatus">
              <Select id="negotiationStatus" name="negotiationStatus" defaultValue={candidacy.negotiationStatus}>
                <option value="NOT_STARTED">No arrancó</option>
                <option value="IN_PROGRESS">En curso</option>
                <option value="AGREED">Acordado</option>
                <option value="ON_HOLD">En pausa</option>
                <option value="DECLINED">Declinó</option>
              </Select>
            </Field>
            <Field label="Responsable" htmlFor="ownerUserId" errors={errors.ownerUserId}>
              <Select id="ownerUserId" name="ownerUserId" defaultValue={candidacy.ownerUserId ?? ''}>
                <option value="">Sin asignar</option>
                {team.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Motivo de rechazo o baja" htmlFor="rejectionReason">
            <Input id="rejectionReason" name="rejectionReason" defaultValue={candidacy.rejectionReason ?? ''} />
          </Field>

          {permissions.canSeeBudget ? (
            <fieldset className="grid gap-3 rounded-lg border border-ink-200 p-3 sm:grid-cols-2">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
                Presupuesto {permissions.canEditBudget ? '' : '(sólo lectura)'}
              </legend>
              <Field label="Moneda" htmlFor="currency">
                <Select id="currency" name="currency" defaultValue={candidacy.budget?.currency ?? currency} disabled={!permissions.canEditBudget}>
                  {['USD', 'ARS', 'EUR', 'BRL', 'MXN', 'COP', 'CLP'].map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Solicitado" htmlFor="budgetRequested">
                <Input
                  id="budgetRequested"
                  name="budgetRequested"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={candidacy.budget?.requested ?? ''}
                  disabled={!permissions.canEditBudget}
                />
              </Field>
              <Field label="Negociado" htmlFor="budgetNegotiated">
                <Input
                  id="budgetNegotiated"
                  name="budgetNegotiated"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={candidacy.budget?.negotiated ?? ''}
                  disabled={!permissions.canEditBudget}
                />
              </Field>
              <Field label="Caché" htmlFor="cacheAmount">
                <Input
                  id="cacheAmount"
                  name="cacheAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={candidacy.budget?.cache ?? ''}
                  disabled={!permissions.canEditBudget}
                />
              </Field>
              <Field label="Canje" htmlFor="barterDescription" className="sm:col-span-2">
                <Input
                  id="barterDescription"
                  name="barterDescription"
                  defaultValue={candidacy.budget?.barterDescription ?? ''}
                  disabled={!permissions.canEditBudget}
                />
              </Field>
              <Field
                label="Observación privada de presupuesto"
                htmlFor="budgetPrivateNotes"
                hint="No sale nunca hacia el cliente."
                className="sm:col-span-2"
              >
                <Textarea
                  id="budgetPrivateNotes"
                  name="budgetPrivateNotes"
                  defaultValue={candidacy.budget?.privateNotes ?? ''}
                  disabled={!permissions.canEditBudget}
                />
              </Field>
            </fieldset>
          ) : null}

          {permissions.canSeeInternal ? (
            <Field label="Notas internas" htmlFor="internalNotes" hint="Sólo agencia. No sale al cliente.">
              <Textarea id="internalNotes" name="internalNotes" defaultValue={candidacy.internalNotes ?? ''} />
            </Field>
          ) : null}

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cerrar
              </Button>
            </DialogClose>
            {permissions.canManage ? (
              <Button type="submit" disabled={pending}>
                {pending ? 'Guardando…' : 'Guardar'}
              </Button>
            ) : null}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
