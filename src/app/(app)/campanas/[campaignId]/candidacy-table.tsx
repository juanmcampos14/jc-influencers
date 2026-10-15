"use client"

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Radar } from 'lucide-react'
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
import { changeStatusAction, updateCandidacyAction, visibilityAction, bulkShortlistAction, bulkStatusAction } from '../../actions/candidacies'
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
  /** Si esta persona puede disparar una búsqueda para este cliente. */
  canRunScouting: boolean
}

/* Vive fuera del componente: guarda la clave y el texto se resuelve al pintar. */
const ALL_COLUMNS = [
  { key: 'creador', clave: 'colCreador' },
  { key: 'cluster', clave: 'colCluster' },
  { key: 'perfil', clave: 'colPerfil' },
  { key: 'seguidores', clave: 'colSeguidores' },
  { key: 'er', clave: 'colEr' },
  { key: 'fit', clave: 'colFit' },
  { key: 'estado', clave: 'colEstado' },
  { key: 'aprobacion', clave: 'colAprobacion' },
  { key: 'entregables', clave: 'colEntregables' },
  { key: 'presupuesto', clave: 'colPresupuesto' },
  { key: 'visible', clave: 'colVisible' },
] as const

type ColumnKey = (typeof ALL_COLUMNS)[number]['key']
/*
 * La clave incluye la campaña: era global, así que la vista que armaba una
 * persona para una campaña se aplicaba a todas, y en una máquina compartida
 * -- que en una agencia pasa -- una heredaba la vista de la otra.
 */
const STORAGE_KEY_BASE = 'jc-columnas-candidaturas'

export function CandidacyTable({
  campaignId,
  clientId,
  currency,
  data,
  clusters,
  team,
  permissions,
  filters,
}: {
  campaignId: string
  /** Para armar el enlace al scouting con la campaña ya elegida. */
  clientId: string
  currency: string
  data: Paginated<CandidacyDto>
  clusters: Cluster[]
  team: Array<{ userId: string; name: string }>
  permissions: Permissions
  filters: { estado: string; q: string }
}) {
  const t = useTranslations('candidaturas')
  const idioma = useLocale()
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
  const [estadoEnLote, setEstadoEnLote] = React.useState('')
  // Por campaña: la vista que armás para una no tiene por qué aplicarse a todas.
  const STORAGE_KEY = `${STORAGE_KEY_BASE}:${campaignId}`

  const [visible, setVisible] = React.useState<ColumnKey[]>(() =>
    ALL_COLUMNS.map((column) => column.key).filter((key) => key !== 'entregables'),
  )

  /*
   * En un teléfono, once columnas son cinco pantallas de scroll lateral para
   * leer una fila. Al entrar desde una pantalla angosta se arranca con lo
   * mínimo para decidir; el selector de columnas sigue estando para el resto.
   */
  React.useEffect(() => {
    const guardada = window.localStorage.getItem(STORAGE_KEY)
    if (guardada) {
      try {
        const parsed = JSON.parse(guardada) as ColumnKey[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setVisible(parsed)
          return
        }
      } catch {
        /* preferencia corrupta: se ignora y se decide por ancho */
      }
    }
    if (window.innerWidth < 768) setVisible(['creador', 'seguidores', 'estado', 'aprobacion'])
  }, [STORAGE_KEY])

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
      toast.success(
        value
          ? t('ahoraLosVe', { cantidad: result.data.count })
          : t('ahoraOcultos', { cantidad: result.data.count }),
      )
      setSelected(new Set())
      router.refresh()
    })
  }

  function cambiarEstadoEnLote() {
    if (!estadoEnLote) return
    const ids = [...selected]
    const etiqueta = STATUS_LABEL.get(estadoEnLote) ?? estadoEnLote
    startTransition(async () => {
      const resultado = await bulkStatusAction({ campaignId, candidacyIds: ids, statusKey: estadoEnLote })
      if (!resultado.ok) {
        toast.error(resultado.message)
        return
      }
      const { changed, unchanged } = resultado.data
      // Los que no cambiaron se dicen: ya estaban así, o alguien los movió.
      toast.success(
        unchanged > 0
          ? t('lotePasaronConResto', { cambiados: changed, estado: etiqueta, sinCambiar: unchanged })
          : t('lotePasaron', { cambiados: changed, estado: etiqueta }),
      )
      setSelected(new Set())
      setEstadoEnLote('')
      router.refresh()
    })
  }

  function enShortlist(agregar: boolean) {
    const ids = [...selected]
    startTransition(async () => {
      const resultado = await bulkShortlistAction({ campaignId, candidacyIds: ids, inShortlist: agregar })
      if (!resultado.ok) {
        toast.error(resultado.message)
        return
      }
      toast.success(
        agregar
          ? t('loteAShortlist', { cantidad: resultado.data.count })
          : t('loteFueraShortlist', { cantidad: resultado.data.count }),
      )
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
      toast.success(t('estadoCambiado', { estado: etiqueta }), {
        action: {
          label: t('deshacer'),
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
              {t('buscarCreador')}
            </label>
            <Input id="q" name="q" defaultValue={filters.q} placeholder={t('buscarPista')} />
          </div>
          <div className="w-52">
            <label htmlFor="estado" className="mb-1 block text-xs font-medium text-ink-600">
              {t('colEstado')}
            </label>
            <Select id="estado" name="estado" defaultValue={filters.estado}>
              <option value="">{t('todos')}</option>
              {CANDIDACY_STATUS_SEED.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.label}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            {t('filtrar')}
          </Button>
        </form>

        <details className="relative">
          <summary className="cursor-pointer list-none rounded-lg border border-ink-300 bg-surface px-3 py-2 text-sm text-ink-700 hover:bg-ink-50">
            {t('columnas')}
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-ink-200 bg-surface p-2 shadow-lg">
            {ALL_COLUMNS.map((column) => (
              <label key={column.key} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-ink-50">
                <Checkbox checked={shows(column.key)} onChange={() => toggleColumn(column.key)} />
                {t(column.clave)}
              </label>
            ))}
          </div>
        </details>
      </div>


      <Card>
        {data.items.length === 0 ? (
          /*
            * Una campaña recién creada aterriza acá. Antes decía qué se podía
            * hacer y no ofrecía hacerlo: había que adivinar dónde estaba el
            * scouting y volver a elegir el cliente y la campaña ahí.
            */
          <EmptyState
            title={t('vacioTitulo')}
            description={t('vacioBajada')}
            action={
              permissions.canRunScouting ? (
                <Button asChild>
                  <Link href={`/influencers/buscar?cliente=${clientId}&campana=${campaignId}`}>
                    <Radar className="size-4" aria-hidden="true" />
                    {t('buscarParaCampana')}
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    {permissions.canManage ? (
                      <Th className="w-10">
                        <Checkbox
                          aria-label={t('elegirLosDeLaPagina', { cantidad: data.items.length })}
                          title={t('elegirLosDeLaPagina', { cantidad: data.items.length })}
                          checked={selected.size === data.items.length && data.items.length > 0}
                          onChange={(event) =>
                            setSelected(event.target.checked ? new Set(data.items.map((item) => item.id)) : new Set())
                          }
                        />
                      </Th>
                    ) : null}
                    {shows('creador') ? <Th className={columnaFija}>{t('colCreador')}</Th> : null}
                    {shows('cluster') ? <Th>{t('colCluster')}</Th> : null}
                    {shows('perfil') ? <Th>{t('colPerfil')}</Th> : null}
                    {shows('seguidores') ? <Th className="text-right">{t('colSeguidores')}</Th> : null}
                    {shows('er') ? <Th className="text-right">{t('colEr')}</Th> : null}
                    {shows('fit') ? <Th>{t('colFit')}</Th> : null}
                    {shows('estado') ? <Th>{t('colEstado')}</Th> : null}
                    {shows('aprobacion') ? <Th>{t('colAprobacion')}</Th> : null}
                    {shows('entregables') ? <Th>{t('colEntregables')}</Th> : null}
                    {shows('presupuesto') && permissions.canSeeBudget ? (
                      <Th className="text-right">{t('colPresupuesto')}</Th>
                    ) : null}
                    {shows('visible') ? <Th>{t('colVeElCliente')}</Th> : null}
                    <Th className="w-20"><span className="sr-only">{t('colAcciones')}</span></Th>
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
                              aria-label={t('seleccionarUno', { nombre: item.influencer.displayName })}
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
                              <span className="text-ink-400">{t('sinPerfil')}</span>
                            )}
                          </Td>
                        ) : null}
                        {shows('seguidores') ? (
                          <Td className="text-right tabular-nums">
                            {formatFollowers(profile?.followers)}
                            {profile?.followersUnparsed ? (
                              /*
                               * Antes era un "!" con `title`. El `title` no
                               * existe en pantalla táctil ni se alcanza con el
                               * teclado, y un signo de exclamación no es una
                               * etiqueta: quien usa lector de pantalla oía
                               * "signo de admiración" y nada más.
                               */
                              <span
                                className="block text-[11px] font-medium text-amber-700"
                                title={t('valorOriginal', { valor: profile.followersRaw ?? '' })}
                              >
                                {t('sinNormalizar')}
                              </span>
                            ) : null}
                            {profile?.stale ? (
                              <span className="block text-[11px] font-medium text-amber-700">
                                {t('sinActualizar')}
                              </span>
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
                                aria-label={t('estadoDe', { nombre: item.influencer.displayName })}
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
                                item.counts.stories ? t('contStories', { cantidad: item.counts.stories }) : null,
                                item.counts.reels ? t('contReels', { cantidad: item.counts.reels }) : null,
                                item.counts.posts ? t('contPosts', { cantidad: item.counts.posts }) : null,
                                item.counts.tiktoks ? t('contTiktoks', { cantidad: item.counts.tiktoks }) : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') ||
                                '—')}
                          </Td>
                        ) : null}
                        {shows('presupuesto') && permissions.canSeeBudget ? (
                          <Td className="text-right tabular-nums">
                            {formatMoney(
                              item.budget?.negotiated ?? item.budget?.requested,
                              item.budget?.currency ?? currency,
                              idioma,
                            )}
                          </Td>
                        ) : null}
                        {shows('visible') ? (
                          <Td>
                            {item.clientVisible ? (
                              <Badge tone="emerald">{t('si')}</Badge>
                            ) : (
                              <Badge tone="slate">{t('no')}</Badge>
                            )}
                          </Td>
                        ) : null}
                        <Td>
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/influencers/${item.influencer.id}`}>{t('verPerfil')}</Link>
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
              unidad={t('unidad')}
            />
          </>
        )}
      </Card>

      {permissions.canManage && selected.size > 0 ? (
        /*
         * Flotante y abajo: la barra vivía arriba de la tabla, así que después
         * de tildar la fila cuarenta había que volver al principio para actuar.
         */
        <div className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border border-ink-300 bg-surface px-4 py-3 shadow-lg">
          <span className="text-sm font-medium text-ink-900">
            {t('elegidos', { cantidad: selected.size })}
          </span>

          <Select
            aria-label={t('pasarAEstado')}
            value={estadoEnLote}
            onChange={(event) => setEstadoEnLote(event.target.value)}
            className="h-9 w-44"
          >
            <option value="">{t('pasarAEstadoVacio')}</option>
            {CANDIDACY_STATUS_SEED.map((status) => (
              <option key={status.key} value={status.key}>
                {status.label}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={cambiarEstadoEnLote} disabled={pending || !estadoEnLote}>
            {t('aplicar')}
          </Button>

          <span aria-hidden="true" className="h-6 w-px bg-ink-200" />

          <Button size="sm" variant="secondary" onClick={() => enShortlist(true)} disabled={pending}>
            {t('aShortlist')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => enShortlist(false)} disabled={pending}>
            {t('sacarDeShortlist')}
          </Button>

          <span aria-hidden="true" className="h-6 w-px bg-ink-200" />

          <Button size="sm" variant="secondary" onClick={() => setVisibility(true)} disabled={pending}>
            {t('mostrarAlCliente')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setVisibility(false)} disabled={pending}>
            {t('ocultar')}
          </Button>

          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={pending}>
            {t('quitarSeleccion')}
          </Button>
        </div>
      ) : null}

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
  const t = useTranslations('candidaturas')
  const idioma = useLocale()
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
        toast.error(result.data.errorMessage ?? t('noSeGeneroAnalisis'))
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
      toast.success(t('actualizada'))
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
            ? t('cabeceraPerfil', {
                red: profile.platform,
                handle: profile.handle ? `@${profile.handle}` : '—',
                seguidores: formatFollowers(profile.followers, idioma),
              })
            : t('sinPerfilSocial')
        }
        className="w-[min(52rem,calc(100vw-2rem))]"
      >
        {permissions.canRunAi ? (
          <div className="mb-4 rounded-lg border border-ink-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink-800">{t('analisisTitulo')}</p>
                <p className="text-xs text-ink-500">{t('analisisBajada')}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={analyze}
                disabled={pending || !permissions.aiConfigured}
              >
                {pending ? t('analizando') : t('analizarConIa')}
              </Button>
            </div>
            {!permissions.aiConfigured ? (
              <p className="mt-2 text-xs text-amber-800">{t('faltaClaveIa')}</p>
            ) : null}
            {insight ? (
              <div className="mt-3">
                <InsightView insight={insight} timezone="America/Argentina/Buenos_Aires" mostrarDetalleTecnico />
              </div>
            ) : null}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('campoCluster')} htmlFor="clusterId">
              <Select id="clusterId" name="clusterId" defaultValue={candidacy.clusterId ?? ''}>
                <option value="">{t('sinCluster')}</option>
                {clusters.map((cluster) => (
                  <option key={cluster.id} value={cluster.id}>
                    {cluster.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('campoOrden')} htmlFor="rank">
              <Input id="rank" name="rank" type="number" min={0} defaultValue={candidacy.rank ?? ''} />
            </Field>
            <Field label={t('campoFit')} htmlFor="fitScore">
              <Input id="fitScore" name="fitScore" type="number" min={1} max={5} defaultValue={candidacy.fitScore ?? ''} />
            </Field>
          </div>

          <Field label={t('campoJustificacion')} htmlFor="agencyRationale" hint={t('laVeElCliente')}>
            <Textarea id="agencyRationale" name="agencyRationale" defaultValue={candidacy.agencyRationale ?? ''} />
          </Field>
          <Field label={t('campoIdea')} htmlFor="contentIdea" hint={t('laVeElCliente')}>
            <Textarea id="contentIdea" name="contentIdea" defaultValue={candidacy.contentIdea ?? ''} />
          </Field>
          <Field label={t('campoEntregables')} htmlFor="deliverablesSummary">
            <Input id="deliverablesSummary" name="deliverablesSummary" defaultValue={candidacy.deliverablesSummary ?? ''} />
          </Field>

          <fieldset className="grid gap-3 rounded-lg border border-ink-200 p-3 sm:grid-cols-5">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
              {t('cantidades')}
            </legend>
            {(
              [
                ['storiesCount', 'cantStories', candidacy.counts.stories],
                ['reelsCount', 'cantReels', candidacy.counts.reels],
                ['postsCount', 'cantPosts', candidacy.counts.posts],
                ['tiktoksCount', 'cantTiktoks', candidacy.counts.tiktoks],
                ['videosCount', 'cantVideos', candidacy.counts.videos],
              ] as const
            ).map(([name, clave, value]) => (
              <Field key={name} label={t(clave)} htmlFor={name}>
                <Input id={name} name={name} type="number" min={0} defaultValue={value} />
              </Field>
            ))}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('campoDisponibilidad')} htmlFor="availability">
              <Select id="availability" name="availability" defaultValue={candidacy.availability}>
                <option value="UNKNOWN">{t('dispUNKNOWN')}</option>
                <option value="AVAILABLE">{t('dispAVAILABLE')}</option>
                <option value="CONDITIONAL">{t('dispCONDITIONAL')}</option>
                <option value="UNAVAILABLE">{t('dispUNAVAILABLE')}</option>
              </Select>
            </Field>
            <Field label={t('campoContacto')} htmlFor="contactStatus">
              <Select id="contactStatus" name="contactStatus" defaultValue={candidacy.contactStatus}>
                <option value="NOT_CONTACTED">{t('contactoNOT_CONTACTED')}</option>
                <option value="CONTACTED">{t('contactoCONTACTED')}</option>
                <option value="RESPONDED">{t('contactoRESPONDED')}</option>
                <option value="NO_RESPONSE">{t('contactoNO_RESPONSE')}</option>
              </Select>
            </Field>
            <Field label={t('campoNegociacion')} htmlFor="negotiationStatus">
              <Select id="negotiationStatus" name="negotiationStatus" defaultValue={candidacy.negotiationStatus}>
                <option value="NOT_STARTED">{t('negNOT_STARTED')}</option>
                <option value="IN_PROGRESS">{t('negIN_PROGRESS')}</option>
                <option value="AGREED">{t('negAGREED')}</option>
                <option value="ON_HOLD">{t('negON_HOLD')}</option>
                <option value="DECLINED">{t('negDECLINED')}</option>
              </Select>
            </Field>
            <Field label={t('campoResponsable')} htmlFor="ownerUserId" errors={errors.ownerUserId}>
              <Select id="ownerUserId" name="ownerUserId" defaultValue={candidacy.ownerUserId ?? ''}>
                <option value="">{t('sinAsignar')}</option>
                {team.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label={t('campoMotivoRechazo')} htmlFor="rejectionReason" hint={t('soloAgencia')}>
            <Input id="rejectionReason" name="rejectionReason" defaultValue={candidacy.rejectionReason ?? ''} />
          </Field>

          {permissions.canSeeBudget ? (
            <fieldset className="grid gap-3 rounded-lg border border-ink-200 p-3 sm:grid-cols-2">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
                {t('presupuestoLeyenda')}
                {permissions.canEditBudget ? '' : t('soloLectura')}
              </legend>
              <Field label={t('campoMoneda')} htmlFor="currency">
                <Select id="currency" name="currency" defaultValue={candidacy.budget?.currency ?? currency} disabled={!permissions.canEditBudget}>
                  {['USD', 'ARS', 'EUR', 'BRL', 'MXN', 'COP', 'CLP'].map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('campoSolicitado')} htmlFor="budgetRequested">
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
              <Field label={t('campoNegociado')} htmlFor="budgetNegotiated">
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
              <Field label={t('campoCache')} htmlFor="cacheAmount">
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
              <Field label={t('campoCanje')} htmlFor="barterDescription" className="sm:col-span-2">
                <Input
                  id="barterDescription"
                  name="barterDescription"
                  defaultValue={candidacy.budget?.barterDescription ?? ''}
                  disabled={!permissions.canEditBudget}
                />
              </Field>
              <Field
                label={t('campoObsPresupuesto')}
                htmlFor="budgetPrivateNotes"
                hint={t('obsPresupuestoAyuda')}
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
            <Field label={t('campoNotasInternas')} htmlFor="internalNotes" hint={t('notasInternasAyuda')}>
              <Textarea id="internalNotes" name="internalNotes" defaultValue={candidacy.internalNotes ?? ''} />
            </Field>
          ) : null}

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t('cerrar')}
              </Button>
            </DialogClose>
            {permissions.canManage ? (
              <Button type="submit" disabled={pending}>
                {pending ? t('guardando') : t('guardar')}
              </Button>
            ) : null}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
