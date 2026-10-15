"use client"

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field'
import { EmptyState, ErrorState, InfoNote } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { ConfirmButton } from '@/components/ui/confirm'
import { ExternalLink } from '@/components/status-badge'
import { platformLabel } from '@/lib/domain/labels'
import { formatDateTime, formatFollowers, formatMoney, formatMoneyFino, formatPercent } from '@/lib/util/format'
import { SelectorDeRed, type Red } from '@/components/scouting/selector-de-red'
import { FiltrosAvanzados } from '@/components/scouting/filtros-avanzados'
import type { Motivo } from '@/lib/domain/filtros-scouting'
import type { BudgetState, PreviewResult, ScoutingResultDto } from '@/lib/repos/scouting'
import {
  cancelScoutingAction,
  importScoutingResultsAction,
  pollScoutingAction,
  previewScoutingAction,
  setScoutingBudgetAction,
  startScoutingAction,
} from '../../actions/scouting'
import { listResultsAction } from './results-action'

/**
 * Lo que estas funciones de afuera del componente necesitan para escribir.
 *
 * Viven al margen del árbol --no pueden usar hooks-- así que reciben el
 * traductor como cualquier otro argumento.
 */
type Traducciones = (clave: string, valores?: Record<string, string | number>) => string

type Run = {
  id: string
  mode: string
  platform: string
  status: string
  requestedRecords: number
  deliveredRecords: number
  estimatedCostUsd: number
  actualCostUsd: number | null
  startedAt: string
  finishedAt: string | null
  errorMessage: string | null
  resultCount: number
  query: unknown
}

const STATUS_TONES: Record<string, string> = {
  PREVIEW: 'amber',
  RUNNING: 'blue',
  COMPLETED: 'emerald',
  FAILED: 'rose',
  CANCELLED: 'slate',
}

/* El texto de cada estado vive en las traducciones, bajo `estado<CLAVE>`. */
const ESTADOS_CONOCIDOS = new Set(Object.keys(STATUS_TONES))

export function ScoutingConsole({
  clients,
  clientId,
  budget,
  runs,
  campaigns,
  campaignId,
  proveedorPorRed,
  canManageBudget,
  puedeFiltrarAudiencia,
}: {
  clients: Array<{ id: string; name: string }>
  clientId: string
  budget: BudgetState
  runs: Run[]
  campaigns: Array<{ id: string; name: string }>
  /**
   * Campaña que viene preseleccionada desde la URL.
   *
   * Es lo que hace que "buscá perfiles para esta campaña" desde la campaña
   * vacía no te obligue a volver a elegirla acá.
   */
  campaignId?: string | null
  /**
   * Quién hace el trabajo, por red, con su costo por perfil.
   *
   * Es por red porque no es el mismo para todas: Bright Data no descubre por
   * palabra clave en Instagram y ahí entra otro. Decir el proveedor por defecto
   * mostraba el nombre y el precio equivocados justo antes de gastar.
   */
  proveedorPorRed: Record<string, { name: string; configured: boolean; unitCostUsd: number }>
  /**
   * Si hay un proveedor conectado que filtre por el público del creador.
   *
   * Lo decide el servidor mirando los proveedores configurados, no la pantalla:
   * ofrecer un filtro que nadie va a aplicar hace que el resultado parezca
   * verificado cuando no lo está.
   */
  puedeFiltrarAudiencia: boolean
  canManageBudget: boolean
}) {
  const t = useTranslations('scouting')
  const idioma = useLocale()
  const tEtiqueta = useTranslations('etiquetas')
  const router = useRouter()
  const params = useSearchParams()
  const [preview, setPreview] = React.useState<PreviewResult | null>(null)
  const [red, setRed] = React.useState<Red>('INSTAGRAM')
  const [filtrosAbiertos, setFiltrosAbiertos] = React.useState(false)
  /* Vive en estado para poder decir el costo mientras se escribe. */
  const [limite, setLimite] = React.useState(30)
  /** El que va a hacer ESTA búsqueda, no el que está por defecto. */
  const provider = proveedorPorRed[red] ?? { name: t('sinProveedorElegido'), configured: false, unitCostUsd: 0 }
  const [openRun, setOpenRun] = React.useState<string | null>(null)
  const [results, setResults] = React.useState<ScoutingResultDto[]>([])
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [targetCampaign, setTargetCampaign] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [mode, setMode] = React.useState<'DISCOVER' | 'ENRICH'>('DISCOVER')

  const running = runs.filter((run) => run.status === 'RUNNING')
  /*
   * Identidad estable de lo que está corriendo.
   *
   * `running` es un array nuevo en cada render, así que usarlo de dependencia
   * destruía y recreaba el intervalo permanentemente.
   */
  const enCurso = running.map((run) => run.id).join(',')

  /*
   * El sondeo tiene su propia transición, separada de la del formulario.
   *
   * Compartían `pending`, así que cada diez segundos el botón "Ver cuánto
   * cuesta" se deshabilitaba solo y decía "Calculando…" sin que nadie hubiera
   * tocado nada.
   */
  const [, startSondeo] = React.useTransition()

  React.useEffect(() => {
    if (!enCurso) return
    const ids = enCurso.split(',')
    const timer = setInterval(() => {
      startSondeo(async () => {
        for (const runId of ids) {
          const result = await pollScoutingAction({ runId })
          if (result.ok && result.data.status !== 'RUNNING') {
            toast.info(
              result.data.status === 'COMPLETED'
                ? t('terminadaConPerfiles', { cantidad: result.data.collected })
                : t('terminadaConEstado', { estado: result.data.status }),
            )
            router.refresh()
          }
        }
      })
    }, 10_000)
    return () => clearInterval(timer)
  }, [enCurso, router, t])

  /*
   * Cancelar gastaba plata y no daba ninguna señal: sin confirmación, sin
   * aviso y sin manejo de error. Si fallaba, la búsqueda seguía corriendo y
   * quien la canceló creía que la había cortado.
   */
  function cancelar(runId: string) {
    startTransition(async () => {
      const resultado = await cancelScoutingAction({ runId })
      if (!resultado.ok) {
        toast.error(resultado.message)
        return
      }
      toast.success(t('seCorto'))
      router.refresh()
    })
  }

  function switchClient(next: string) {
    const query = new URLSearchParams(params.toString())
    query.set('cliente', next)
    router.push(`/influencers/buscar?${query.toString()}`)
  }

  /**
   * Buscar, de una.
   *
   * Antes esto eran dos pasos: calcular el costo y después confirmar. La idea
   * era no gastar sin querer, y en la práctica el primer paso no protegía de
   * nada --el costo ya se ve en el botón antes de tocarlo, y el tope del mes es
   * un corte duro que se vuelve a comprobar del lado del servidor justo antes
   * de gastar--. Sólo agregaba un viaje y un clic.
   *
   * Lo que se conserva es lo que sí protege: el costo dicho de antemano y el
   * tope que corta. Si el preflight encuentra un bloqueo --sin proveedor, sin
   * presupuesto-- no se ejecuta y se dice cuál es.
   */
  function buscar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    startTransition(async () => {
      /* Vacío es "no filtrar", no "cero". Un 0 en seguidores filtraría todo. */
      const numero = (clave: string): number | null => {
        const texto = String(form.get(clave) ?? '').replace(/\./g, '').replace(',', '.').trim()
        if (!texto) return null
        const valor = Number(texto)
        return Number.isFinite(valor) && valor >= 0 ? valor : null
      }
      const texto = (clave: string): string | null => String(form.get(clave) ?? '').trim() || null

      const result = await previewScoutingAction({
        clientId,
        campaignId: String(form.get('campaignId') ?? '') || null,
        mode,
        platform: String(form.get('platform') ?? 'INSTAGRAM') as never,
        filtros:
          mode === 'DISCOVER'
            ? {
                pais: texto('fPais'),
                zona: texto('fZona'),
                bioMenciona: texto('fBio'),
                seguidoresDesde: numero('fDesde'),
                seguidoresHasta: numero('fHasta'),
                engagementMinimo: numero('fEngagement'),
              }
            : undefined,
        /*
         * La audiencia sólo viaja si hay quien la aplique. Mandarla a un
         * scraper no rompería nada y sería peor: la corrida quedaría guardada
         * con un filtro que nadie tuvo en cuenta, y al mirarla después
         * parecería que los resultados lo cumplen.
         */
        audiencia: mode === 'DISCOVER' && puedeFiltrarAudiencia ? leerAudiencia(form) : undefined,
        keywords:
          mode === 'DISCOVER'
            ? String(form.get('keywords') ?? '')
                .split(/[\n,]+/)
                .map((value) => value.trim())
                .filter(Boolean)
            : undefined,
        urls:
          mode === 'ENRICH'
            ? String(form.get('urls') ?? '')
                .split(/[\n,]+/)
                .map((value) => value.trim())
                .filter(Boolean)
            : undefined,
        limit: Number(form.get('limit') ?? 30),
      })
      if (!result.ok) {
        setError(result.message)
        toast.error(result.message)
        return
      }

      /*
       * El preflight sigue existiendo del lado del servidor: calcula el costo,
       * registra la corrida y comprueba el tope. Lo que cambió es que ya no se
       * le pide a la persona que lo confirme, salvo que haya algo que la
       * detenga de verdad.
       */
      if (!result.data.puedeEjecutar) {
        setPreview(result.data)
        const motivo = result.data.bloqueos[0] ?? t('noSePuedeEjecutarGenerico')
        setError(motivo)
        toast.error(motivo)
        return
      }

      setPreview(result.data)
      await ejecutar(result.data.runId)
    })
  }

  async function ejecutar(runId: string) {
    {
      const result = await startScoutingAction({ runId })
      if (!result.ok) {
        toast.error(result.message)
        /*
         * Una corrida se ejecuta una sola vez: si falló, ya no sirve. Dejar el
         * cuadro con el botón puesto invitaba a apretarlo de nuevo y chocar
         * contra "esta búsqueda ya se resolvió", que no le dice nada a nadie.
         */
        setPreview(null)
        setError(result.message)
        router.refresh()
        return
      }
      toast.success(t('enMarcha'))
      setPreview(null)
      router.refresh()
    }
  }

  function discard() {
    if (!preview) return
    startTransition(async () => {
      await cancelScoutingAction({ runId: preview.runId })
      setPreview(null)
      router.refresh()
    })
  }

  function openResults(runId: string) {
    setOpenRun(runId)
    setSelected(new Set())
    setResults([])
    startTransition(async () => {
      const result = await listResultsAction({ runId })
      if (!result.ok) {
        toast.error(result.message)
        setOpenRun(null)
        return
      }
      setResults(result.data)
      /*
       * Llevar la vista a los resultados.
       *
       * El panel vive abajo de la tabla de búsquedas, así que tocar "Ver 30"
       * abría algo fuera de la pantalla y se leía como que el botón no hacía
       * nada. Pasó de verdad.
       */
      requestAnimationFrame(() => {
        document.getElementById('resultados-scouting')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
  }

  function importSelected() {
    if (!openRun || selected.size === 0) return
    startTransition(async () => {
      const result = await importScoutingResultsAction({
        runId: openRun,
        resultIds: [...selected],
        campaignId: targetCampaign || null,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      const { created, linked, addedToCampaign } = result.data
      toast.success(
        t('importado', { nuevos: created, existentes: linked }) +
          (addedToCampaign > 0 ? t('importadoEnCampana', { cantidad: addedToCampaign }) : '') +
          '.',
      )
      setSelected(new Set())
      openResults(openRun)
      router.refresh()
    })
  }

  function saveBudget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await setScoutingBudgetAction({
        clientId,
        limitUsd: Number(form.get('limitUsd') ?? 0),
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(t('topeActualizado'))
      router.refresh()
    })
  }

  const usedPercent =
    budget.globalLimitUsd > 0 ? Math.min(100, Math.round((budget.globalSpentUsd / budget.globalLimitUsd) * 100)) : 0

  return (
    <div className="space-y-6">
      {!provider.configured ? (
        <InfoNote>
          <p className="font-medium">{t('sinProveedorTitulo')}</p>
          {/* El nombre de una variable de entorno no es información para quien
              usa el producto: es para quien lo configura, y ése ya sabe dónde
              buscarlo. */}
          <p className="mt-1 text-xs">{t('sinProveedorBajada')}</p>
        </InfoNote>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('aQuienBuscas')}</CardTitle>
            <p className="text-xs text-ink-500">{t('aQuienBuscasAyuda')}</p>
          </CardHeader>
          <CardBody>
            <form onSubmit={buscar} className="space-y-4">
              {mode === 'DISCOVER' ? (
                <Field
                  label={t('campoTema')}
                  htmlFor="keywords"
                  hint={t('temaAyuda')}
                  required
                >
                  <Textarea
                    id="keywords"
                    name="keywords"
                    rows={3}
                    placeholder={t('temaPista')}
                    required
                  />
                </Field>
              ) : (
                <Field label={t('campoUrls')} htmlFor="urls" hint={t('urlsAyuda')} required>
                  <Textarea
                    id="urls"
                    name="urls"
                    rows={4}
                    placeholder={'https://www.instagram.com/perfil1\nhttps://www.instagram.com/perfil2'}
                    required
                  />
                </Field>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <SelectorDeRed valor={red} onChange={setRed} />
                <Field label={t('campoModo')} htmlFor="mode">
                  <Select
                    id="mode"
                    value={mode}
                    onChange={(event) => setMode(event.target.value as 'DISCOVER' | 'ENRICH')}
                  >
                    <option value="DISCOVER">{t('modoDescubrir')}</option>
                    <option value="ENRICH">{t('modoActualizar')}</option>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {clients.length > 1 ? (
                  <Field label={t('campoCliente')} htmlFor="clientSelect">
                    <Select id="clientSelect" value={clientId} onChange={(event) => switchClient(event.target.value)}>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
                {mode === 'DISCOVER' ? (
                  <Field
                    label={t('campoLimite')}
                    htmlFor="limit"
                    /*
                     * El costo se dice mientras se escribe, no después de un
                     * viaje al servidor. Es lo que hacía falta del paso que
                     * había antes; el paso en sí no aportaba nada más.
                     */
                    hint={
                      provider.unitCostUsd > 0
                        ? t('limiteAyuda', {
                            proveedor: provider.name,
                            porMil: formatMoneyFino(provider.unitCostUsd, 'USD', idioma),
                            total: formatMoneyFino(provider.unitCostUsd * limite, 'USD', idioma),
                          })
                        : t('limiteAyudaSinCosto')
                    }
                  >
                    <Input
                      id="limit"
                      name="limit"
                      type="number"
                      min={1}
                      max={500}
                      value={limite}
                      onChange={(event) => setLimite(Math.max(1, Math.min(500, Number(event.target.value) || 1)))}
                    />
                  </Field>
                ) : null}
              </div>

              {mode === 'DISCOVER' ? (
                <FiltrosAvanzados
                  abierto={filtrosAbiertos}
                  onToggle={() => setFiltrosAbiertos((v) => !v)}
                  puedeFiltrarAudiencia={puedeFiltrarAudiencia}
                />
              ) : null}

              <Field label={t('campoCampana')} htmlFor="campaignId">
                <Select id="campaignId" name="campaignId" defaultValue={campaignId ?? ''}>
                  <option value="">{t('sinCampana')}</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Button type="submit" disabled={pending}>
                {pending
                  ? t('buscando')
                  : mode === 'DISCOVER' && provider.unitCostUsd > 0
                    ? t('buscarConCosto', { total: formatMoneyFino(provider.unitCostUsd * limite, 'USD', idioma) })
                    : t('buscarBoton')}
              </Button>
            </form>

            {error ? (
              <div className="mt-4">
                <ErrorState title={error} />
              </div>
            ) : null}

            {preview ? (
              <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4">
                <p className="text-sm font-semibold text-ink-900">{t('antesDeEjecutar')}</p>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-ink-500">{t('perfilesAConsultar')}</dt>
                    <dd className="font-semibold tabular-nums text-ink-900">{preview.requestedRecords}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">{t('costoEstimado')}</dt>
                    {/*
                      * Sin proveedor o sin dataset, el costo no es cero: es
                      * desconocido. Mostrar "US$ 0" se lee como "es gratis",
                      * que es lo contrario de lo que pasa.
                      */}
                    <dd className="font-semibold tabular-nums text-ink-900">
                      {preview.unitCostUsd > 0 ? (
                        formatMoneyFino(preview.estimatedCostUsd)
                      ) : (
                        <span className="text-ink-400">{t('sinCalcular')}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">{t('quedaEsteMes')}</dt>
                    <dd className="font-semibold tabular-nums text-ink-900">
                      {formatMoney(preview.budget.remainingUsd, 'USD')}
                    </dd>
                  </div>
                </dl>
                {preview.bloqueos.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <p className="text-sm font-semibold text-rose-900">
                      {preview.bloqueos.length === 1 ? t('noSePuedeEjecutar') : t('noSePuedeEjecutarVarios')}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs text-rose-800">
                      {preview.bloqueos.map((bloqueo) => (
                        <li key={bloqueo}>{bloqueo}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {preview.warnings.map((warning) => (
                  <p key={warning} className="mt-2 text-xs font-medium text-amber-800">
                    {warning}
                  </p>
                ))}
                {/*
                  * Este cuadro sólo aparece cuando algo frenó la búsqueda. Si
                  * se pudo ejecutar, no hay nada que confirmar: ya salió.
                  */}
                <div className="mt-3">
                  <Button variant="secondary" onClick={discard} disabled={pending}>
                    {t('entendido')}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('topeDeGasto', { periodo: budget.period })}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <div>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-ink-600">{t('gastado')}</span>
                <span className="font-semibold tabular-nums text-ink-900">
                  {t('gastadoDe', {
                    gastado: formatMoney(budget.globalSpentUsd, 'USD', idioma),
                    tope: formatMoney(budget.globalLimitUsd, 'USD', idioma),
                  })}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                <div
                  className={usedPercent > 85 ? 'h-full rounded-full bg-rose-500' : 'h-full rounded-full bg-brand-500'}
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-ink-500">{t('topeCorta')}</p>
            </div>

            {budget.clientLimitUsd !== null ? (
              <p className="text-xs text-ink-600">
                {t('topePropio', {
                  tope: formatMoney(budget.clientLimitUsd, 'USD', idioma),
                  gastado: formatMoney(budget.clientSpentUsd, 'USD', idioma),
                })}
              </p>
            ) : null}

            {canManageBudget ? (
              <form onSubmit={saveBudget} className="flex items-end gap-2">
                <Field label={t('campoTope')} htmlFor="limitUsd" className="flex-1">
                  <Input
                    id="limitUsd"
                    name="limitUsd"
                    type="number"
                    min={0}
                    step="1"
                    defaultValue={budget.clientLimitUsd ?? ''}
                  />
                </Field>
                <Button type="submit" size="sm" variant="secondary" disabled={pending}>
                  {t('guardar')}
                </Button>
              </form>
            ) : null}

            <p className="text-xs text-ink-500">{t('proveedorEs', { nombre: provider.name })}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('busquedas')}</CardTitle>
          {runs.length >= 30 ? <p className="text-xs text-ink-500">{t('ultimas30')}</p> : null}
        </CardHeader>
        {runs.length === 0 ? (
          <EmptyState title={t('sinBusquedasTitulo')} description={t('sinBusquedasBajada')} />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>{t('colCuando')}</Th>
                  <Th>{t('colQue')}</Th>
                  <Th>{t('colEstado')}</Th>
                  <Th className="text-right">{t('colPedidos')}</Th>
                  <Th className="text-right">{t('colEntregados')}</Th>
                  <Th className="text-right">{t('colCosto')}</Th>
                  <Th><span className="sr-only">{t('acciones')}</span></Th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <Tr key={run.id}>
                    <Td className="whitespace-nowrap text-xs text-ink-600">{formatDateTime(run.startedAt)}</Td>
                    <Td className="text-xs">
                      {run.mode === 'DISCOVER' ? t('modoDescubrirCorto') : t('modoActualizarCorto')} ·{' '}
                      {platformLabel(tEtiqueta, run.platform)}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONES[run.status] ?? 'slate'}>
                        {ESTADOS_CONOCIDOS.has(run.status) ? t(`estado${run.status}`) : run.status}
                      </Badge>
                      {run.errorMessage ? (
                        <p className="mt-0.5 max-w-64 text-[11px] text-rose-700">{run.errorMessage}</p>
                      ) : null}
                    </Td>
                    <Td className="text-right tabular-nums">{run.requestedRecords}</Td>
                    <Td className="text-right tabular-nums">{run.deliveredRecords}</Td>
                    <Td className="text-right tabular-nums">
                      {formatMoneyFino(run.actualCostUsd ?? run.estimatedCostUsd)}
                      {run.actualCostUsd === null && run.status !== 'PREVIEW' ? (
                        <span className="block text-[11px] text-ink-400">{t('estimado')}</span>
                      ) : null}
                    </Td>
                    <Td>
                      {run.resultCount > 0 ? (
                        <Button size="sm" variant="ghost" onClick={() => openResults(run.id)}>
                          {t('verCantidad', { cantidad: run.resultCount })}
                        </Button>
                      ) : run.status === 'RUNNING' ? (
                        <ConfirmButton
                          title={t('cancelarTitulo')}
                          description={t('cancelarBajada')}
                          confirmLabel={t('cancelarConfirmar')}
                          tone="danger"
                          onConfirm={() => cancelar(run.id)}
                          pending={pending}
                        >
                          <Button size="sm" variant="ghost" disabled={pending}>
                            {t('cancelar')}
                          </Button>
                        </ConfirmButton>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {openRun ? (
        <Card id="resultados-scouting">
          <CardHeader>
            <CardTitle>{t('resultados')}</CardTitle>
            {/*
              * Antes decía "los que no importes no se guardan". Era verdad para
              * el padrón y falso para todo lo demás: cada búsqueda ya guarda lo
              * que encontró en Descubiertos. Alguien que leía eso creía que
              * perdía el trabajo si no importaba en el momento, y volvía a
              * pagar la misma búsqueda.
              */}
            <p className="text-xs text-ink-500">
              {t.rich('yaGuardados', {
                b: (texto) => <strong className="text-ink-700">{texto}</strong>,
              })}
            </p>
            {/*
              * Qué se buscó, arriba de lo que se encontró.
              *
              * Los resultados se miran un rato después de pedirlos --a veces al
              * día siguiente, desde la tabla de búsquedas-- y sin esto no hay
              * forma de saber con qué filtros salió esta lista.
              */}
            {(() => {
              const run = runs.find((r) => r.id === openRun)
              if (!run) return null
              const partes = describirBusqueda(run, t, idioma)
              if (partes.length === 0) return null
              return (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {partes.map((parte) => (
                    <span
                      key={parte.texto}
                      className={
                        parte.enOrigen
                          ? 'rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900'
                          : 'rounded-md bg-ink-100 px-2 py-0.5 text-xs text-ink-700'
                      }
                      title={parte.enOrigen ? t('filtroEnOrigen') : t('filtroComprobado')}
                    >
                      {parte.texto}
                    </span>
                  ))}
                </div>
              )
            })()}
            {results.length === 0 ? null : (() => {
              const cumplen = results.filter((r) => r.veredicto === 'CUMPLE').length
              const sinDato = results.filter((r) => r.veredicto === 'SIN_DATO').length
              const fuera = results.filter((r) => r.veredicto === 'NO_CUMPLE').length
              if (cumplen === results.length) return null
              /*
               * El recuento por veredicto va arriba de la tabla: sin esto,
               * alguien mira treinta filas y no sabe cuáles pasaron el filtro
               * que acaba de pedir.
               */
              return (
                <p className="mt-1.5 text-xs text-ink-600">
                  {t.rich('recuento', {
                    cumplen,
                    b: (texto) => <strong className="text-ink-900">{texto}</strong>,
                  })}
                  {sinDato > 0 ? t('recuentoSinDato', { cantidad: sinDato }) : ''}
                  {fuera > 0 ? t('recuentoFuera', { cantidad: fuera }) : ''}
                  {t('recuentoCierre')}
                </p>
              )
            })()}
          </CardHeader>
          {results.length === 0 ? (
            <CardBody>
              {pending ? (
                <p className="text-sm text-ink-500">{t('trayendo')}</p>
              ) : (
                /*
                 * Un panel que no aparece se lee como un botón roto. Si la
                 * búsqueda terminó y no quedó ningún perfil guardado, hay que
                 * decirlo: el proveedor cobró igual.
                 */
                <div className="space-y-1">
                  <p className="text-sm font-medium text-ink-900">{t('sinPerfilesTitulo')}</p>
                  <p className="text-xs text-ink-500">{t('sinPerfilesBajada')}</p>
                </div>
              )}
            </CardBody>
          ) : null}

          {results.length > 0 ? (
          <CardBody className="flex flex-wrap items-end gap-3 border-b border-ink-200">
            <Field label={t('agregarALaCampana')} htmlFor="targetCampaign" className="w-64">
              <Select id="targetCampaign" value={targetCampaign} onChange={(event) => setTargetCampaign(event.target.value)}>
                <option value="">{t('soloALaBase')}</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={importSelected} disabled={pending || selected.size === 0}>
              {selected.size > 0 ? t('importarCantidad', { cantidad: selected.size }) : t('importarSeleccionados')}
            </Button>
          </CardBody>
          ) : null}
          {results.length > 0 ? (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th className="w-10">
                    <Checkbox
                      aria-label={t('seleccionarTodos')}
                      checked={selected.size === results.filter((r) => !r.imported).length && selected.size > 0}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? new Set(results.filter((r) => !r.imported).map((r) => r.id))
                            : new Set(),
                        )
                      }
                    />
                  </Th>
                  <Th>{t('colPerfil')}</Th>
                  <Th>{t('colRed')}</Th>
                  <Th className="text-right">{t('colSeguidores')}</Th>
                  <Th className="text-right">{t('colEr')}</Th>
                  <Th>{t('colPais')}</Th>
                  <Th>{t('colLoTrajo')}</Th>
                  <Th>{t('colContraFiltros')}</Th>
                  <Th>{t('colEstado')}</Th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <Tr key={result.id}>
                    <Td>
                      <Checkbox
                        aria-label={t('seleccionarUno', { nombre: result.displayName ?? result.url })}
                        disabled={result.imported}
                        checked={selected.has(result.id)}
                        onChange={(event) =>
                          setSelected((current) => {
                            const next = new Set(current)
                            if (event.target.checked) next.add(result.id)
                            else next.delete(result.id)
                            return next
                          })
                        }
                      />
                    </Td>
                    <Td>
                      <p className="text-sm font-medium text-ink-900">{result.displayName ?? result.handle ?? '—'}</p>
                      <ExternalLink href={result.url}>
                        {result.handle ? `@${result.handle}` : result.url}
                      </ExternalLink>
                      {result.bio ? <p className="mt-0.5 max-w-96 text-xs text-ink-500">{result.bio}</p> : null}
                    </Td>
                    <Td className="text-xs">{platformLabel(tEtiqueta, result.platform)}</Td>
                    <Td className="text-right tabular-nums">{formatFollowers(result.followers)}</Td>
                    <Td className="text-right tabular-nums">{formatPercent(result.engagementRate)}</Td>
                    <Td className="text-xs">
                      {result.country ?? <span className="text-ink-500">{t('noLoInforma')}</span>}
                    </Td>
                    <Td className="text-xs text-ink-600">{result.provider}</Td>
                    <Td className="text-xs">
                      {result.veredicto === 'CUMPLE' ? (
                        <Badge tone="emerald">{t('cumple')}</Badge>
                      ) : result.veredicto === 'SIN_DATO' ? (
                        <>
                          <Badge tone="amber">{t('faltaUnDato')}</Badge>
                          <p className="mt-0.5 text-ink-500">{motivos(result.motivos, t)}</p>
                        </>
                      ) : (
                        <>
                          <Badge tone="slate">{t('fuera')}</Badge>
                          <p className="mt-0.5 text-ink-500">{motivos(result.motivos, t)}</p>
                        </>
                      )}
                    </Td>
                    <Td>
                      {result.imported ? (
                        <Badge tone="emerald">{t('importadoBadge')}</Badge>
                      ) : result.matchedInfluencerId ? (
                        <Badge tone="blue">{t('yaEnLaBase')}</Badge>
                      ) : (
                        <Badge tone="slate">{t('nuevo')}</Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}

/**
 * Los motivos de un veredicto, en una frase.
 *
 * El dominio devuelve claves y valores --nunca la frase escrita-- así que el
 * texto se arma acá, en el idioma de quien mira.
 */
function motivos(lista: Motivo[], t: Traducciones): string {
  return lista.map((m) => t(m.clave, m.valores)).join(' · ')
}

/**
 * Junta los filtros de audiencia del formulario.
 *
 * Devuelve `null` si no se pidió ninguno: mandar un objeto con todo en null
 * dejaría la corrida guardada como si se hubiera filtrado por audiencia.
 */
function leerAudiencia(form: FormData): {
  paisDelPublico?: { pais: string; porcentajeMinimo: number } | null
  generoDelPublico?: { genero: 'male' | 'female'; porcentajeMinimo: number } | null
  edadDelPublico?: { tramos: string[]; porcentajeMinimo: number } | null
  calidadMinima?: number | null
} | null {
  const valor = (campo: string): string => String(form.get(campo) ?? '').trim()
  const porcentajeMinimo = Number(valor('aPorcentaje')) || 50

  const pais = valor('aPais')
  const genero = valor('aGenero')
  const generoDelPublico: { genero: 'male' | 'female'; porcentajeMinimo: number } | null =
    genero === 'male' || genero === 'female' ? { genero, porcentajeMinimo } : null
  const edad = valor('aEdad')
  const calidad = Number(valor('aCalidad'))

  const audiencia = {
    paisDelPublico: pais ? { pais, porcentajeMinimo } : null,
    generoDelPublico,
    edadDelPublico: edad ? { tramos: [edad], porcentajeMinimo } : null,
    calidadMinima: Number.isFinite(calidad) && calidad > 0 ? calidad : null,
  }

  return Object.values(audiencia).some((v) => v !== null) ? audiencia : null
}

/**
 * Cuenta qué se buscó, en palabras.
 *
 * Distingue lo que el proveedor filtró **antes de devolver** de lo que se
 * comprueba después: no es lo mismo "el proveedor sólo trajo argentinos" que
 * "de estos, miramos cuáles dicen ser argentinos". La diferencia es lo que
 * hacía que una búsqueda perfecta se leyera como "0 cumplen".
 */
function describirBusqueda(
  run: { query: unknown },
  t: Traducciones,
  idioma: string,
): Array<{ texto: string; enOrigen: boolean }> {
  const query = (run.query ?? {}) as {
    keywords?: string[]
    limit?: number
    filtros?: Record<string, unknown> | null
    audiencia?: Record<string, unknown> | null
    filtrosEnOrigen?: string[]
  }
  const f = query.filtros ?? {}
  const enOrigen = new Set(query.filtrosEnOrigen ?? [])
  const partes: Array<{ texto: string; enOrigen: boolean }> = []

  for (const palabra of query.keywords ?? []) partes.push({ texto: palabra, enOrigen: false })

  if (f.pais) partes.push({ texto: t('queryPais', { valor: String(f.pais) }), enOrigen: enOrigen.has('pais') })
  if (f.zona) partes.push({ texto: t('queryZona', { valor: String(f.zona) }), enOrigen: enOrigen.has('zona') })
  if (f.bioMenciona) {
    partes.push({
      texto: t('queryBio', { valor: String(f.bioMenciona) }),
      enOrigen: enOrigen.has('bioMenciona'),
    })
  }

  const desde = f.seguidoresDesde as number | null | undefined
  const hasta = f.seguidoresHasta as number | null | undefined
  if (desde != null || hasta != null) {
    const texto =
      desde != null && hasta != null
        ? t('querySeguidoresRango', {
            desde: formatFollowers(desde, idioma),
            hasta: formatFollowers(hasta, idioma),
          })
        : desde != null
          ? t('querySeguidoresDesde', { desde: formatFollowers(desde, idioma) })
          : t('querySeguidoresHasta', { hasta: formatFollowers(hasta ?? null, idioma) })
    partes.push({ texto, enOrigen: enOrigen.has('seguidores') })
  }

  const er = f.engagementMinimo as number | null | undefined
  if (er != null) partes.push({ texto: t('queryEr', { valor: er }), enOrigen: enOrigen.has('engagement') })

  const a = query.audiencia
  if (a?.paisDelPublico) {
    const dato = a.paisDelPublico as { pais?: string; porcentajeMinimo?: number }
    // La audiencia siempre la aplica el proveedor: no hay forma de comprobarla después.
    partes.push({
      texto: t('queryPublicoPais', { pais: dato.pais ?? '—', pct: dato.porcentajeMinimo ?? 0 }),
      enOrigen: true,
    })
  }
  if (a?.generoDelPublico) {
    const dato = a.generoDelPublico as { genero?: string; porcentajeMinimo?: number }
    partes.push({
      texto: t('queryPublicoGenero', {
        genero: dato.genero === 'female' ? t('generoMujeres') : t('generoVarones'),
        pct: dato.porcentajeMinimo ?? 0,
      }),
      enOrigen: true,
    })
  }
  if (a?.edadDelPublico) {
    const dato = a.edadDelPublico as { tramos?: string[]; porcentajeMinimo?: number }
    partes.push({
      texto: t('queryPublicoEdad', {
        tramos: (dato.tramos ?? []).join(', '),
        pct: dato.porcentajeMinimo ?? 0,
      }),
      enOrigen: true,
    })
  }
  if (a?.calidadMinima != null) {
    partes.push({ texto: t('queryCalidad', { valor: String(a.calidadMinima) }), enOrigen: true })
  }

  return partes
}
