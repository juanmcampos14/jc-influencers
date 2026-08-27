"use client"

import * as React from 'react'
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
import { formatDateTime, formatFollowers, formatMoney, formatPercent } from '@/lib/util/format'
import { SelectorDeRed, type Red } from '@/components/scouting/selector-de-red'
import { FiltrosAvanzados } from '@/components/scouting/filtros-avanzados'
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

const STATUS_LABELS: Record<string, string> = {
  PREVIEW: 'Sin ejecutar',
  RUNNING: 'En curso',
  COMPLETED: 'Terminada',
  FAILED: 'Falló',
  CANCELLED: 'Cancelada',
}

export function ScoutingConsole({
  clients,
  clientId,
  budget,
  runs,
  campaigns,
  campaignId,
  provider,
  canManageBudget,
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
  provider: { name: string; configured: boolean }
  canManageBudget: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [preview, setPreview] = React.useState<PreviewResult | null>(null)
  const [red, setRed] = React.useState<Red>('INSTAGRAM')
  const [filtrosAbiertos, setFiltrosAbiertos] = React.useState(false)
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
                ? `Búsqueda terminada: ${result.data.collected} perfiles.`
                : `La búsqueda terminó con estado ${result.data.status}.`,
            )
            router.refresh()
          }
        }
      })
    }, 10_000)
    return () => clearInterval(timer)
  }, [enCurso, router])

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
      toast.success('Se pidió cortar la búsqueda.')
      router.refresh()
    })
  }

  function switchClient(next: string) {
    const query = new URLSearchParams(params.toString())
    query.set('cliente', next)
    router.push(`/influencers/buscar?${query.toString()}`)
  }

  function runPreview(event: React.FormEvent<HTMLFormElement>) {
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
      setPreview(result.data)
    })
  }

  function execute() {
    if (!preview) return
    startTransition(async () => {
      const result = await startScoutingAction({ runId: preview.runId })
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
      toast.success('Scouting en marcha. Te avisamos cuando termine.')
      setPreview(null)
      router.refresh()
    })
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
        `${created} influencers nuevos, ${linked} ya existían${addedToCampaign > 0 ? `, ${addedToCampaign} agregados a la campaña` : ''}.`,
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
      toast.success('Tope actualizado.')
      router.refresh()
    })
  }

  const usedPercent =
    budget.globalLimitUsd > 0 ? Math.min(100, Math.round((budget.globalSpentUsd / budget.globalLimitUsd) * 100)) : 0

  return (
    <div className="space-y-6">
      {!provider.configured ? (
        <InfoNote>
          <p className="font-medium">El proveedor de scouting no está conectado.</p>
          {/* El nombre de una variable de entorno no es información para quien
              usa el producto: es para quien lo configura, y ése ya sabe dónde
              buscarlo. */}
          <p className="mt-1 text-xs">
            Podés armar la búsqueda y ver cuánto costaría, pero no se va a poder ejecutar hasta que un administrador
            técnico conecte las credenciales del proveedor. No mostramos datos simulados.
          </p>
        </InfoNote>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>¿A quién buscás?</CardTitle>
            <p className="text-xs text-ink-500">
              Un tema y una red. Todo lo que filtres se comprueba contra los datos que devuelve la red: si a un
              creador le falta el dato, se marca, no se descarta.
            </p>
          </CardHeader>
          <CardBody>
            <form onSubmit={runPreview} className="space-y-4">
              {mode === 'DISCOVER' ? (
                <Field
                  label="Tema o nicho"
                  htmlFor="keywords"
                  hint="Uno por línea. Salen del brief de la campaña."
                  required
                >
                  <Textarea
                    id="keywords"
                    name="keywords"
                    rows={3}
                    placeholder={'finanzas personales\nstablecoins'}
                    required
                  />
                </Field>
              ) : (
                <Field label="Perfiles a actualizar" htmlFor="urls" hint="Una URL por línea." required>
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
                <Field label="Qué querés hacer" htmlFor="mode">
                  <Select
                    id="mode"
                    value={mode}
                    onChange={(event) => setMode(event.target.value as 'DISCOVER' | 'ENRICH')}
                  >
                    <option value="DISCOVER">Descubrir perfiles nuevos</option>
                    <option value="ENRICH">Actualizar métricas de perfiles</option>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {clients.length > 1 ? (
                  <Field label="Para qué cliente" htmlFor="clientSelect">
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
                  <Field label="Cuántos perfiles como máximo" htmlFor="limit" hint="Cada perfil tiene costo.">
                    <Input id="limit" name="limit" type="number" min={1} max={500} defaultValue={30} />
                  </Field>
                ) : null}
              </div>

              {mode === 'DISCOVER' ? (
                <FiltrosAvanzados abierto={filtrosAbiertos} onToggle={() => setFiltrosAbiertos((v) => !v)} />
              ) : null}

              <Field label="Agregar a una campaña (opcional)" htmlFor="campaignId">
                <Select id="campaignId" name="campaignId" defaultValue={campaignId ?? ''}>
                  <option value="">No asociar a ninguna campaña</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Button type="submit" disabled={pending}>
                {pending ? 'Calculando…' : 'Ver cuánto cuesta'}
              </Button>
            </form>

            {error ? (
              <div className="mt-4">
                <ErrorState title={error} />
              </div>
            ) : null}

            {preview ? (
              <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4">
                <p className="text-sm font-semibold text-ink-900">Antes de ejecutar</p>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-ink-500">Perfiles a consultar</dt>
                    <dd className="font-semibold tabular-nums text-ink-900">{preview.requestedRecords}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Costo estimado</dt>
                    {/*
                      * Sin proveedor o sin dataset, el costo no es cero: es
                      * desconocido. Mostrar "US$ 0" se lee como "es gratis",
                      * que es lo contrario de lo que pasa.
                      */}
                    <dd className="font-semibold tabular-nums text-ink-900">
                      {preview.unitCostUsd > 0 ? (
                        formatMoney(preview.estimatedCostUsd, 'USD')
                      ) : (
                        <span className="text-ink-400">sin calcular</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Queda este mes</dt>
                    <dd className="font-semibold tabular-nums text-ink-900">
                      {formatMoney(preview.budget.remainingUsd, 'USD')}
                    </dd>
                  </div>
                </dl>
                {preview.bloqueos.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <p className="text-sm font-semibold text-rose-900">
                      {preview.bloqueos.length === 1 ? 'No se puede ejecutar' : 'No se puede ejecutar, por dos motivos'}
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
                <div className="mt-3 flex flex-wrap gap-2">
                  <ConfirmButton
                    title="Ejecutar el scouting"
                    description={`Se van a consultar ${preview.requestedRecords} perfiles a un costo estimado de ${formatMoney(preview.estimatedCostUsd, 'USD')}. Este gasto se factura aunque después descartes los resultados.`}
                    confirmLabel="Sí, ejecutar"
                    tone="primary"
                    onConfirm={execute}
                    pending={pending}
                  >
                    <Button disabled={pending || !preview.puedeEjecutar}>Ejecutar</Button>
                  </ConfirmButton>
                  <Button variant="secondary" onClick={discard} disabled={pending}>
                    Descartar
                  </Button>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tope de gasto · {budget.period}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <div>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-ink-600">Gastado</span>
                <span className="font-semibold tabular-nums text-ink-900">
                  {formatMoney(budget.globalSpentUsd, 'USD')} de {formatMoney(budget.globalLimitUsd, 'USD')}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                <div
                  className={usedPercent > 85 ? 'h-full rounded-full bg-rose-500' : 'h-full rounded-full bg-brand-500'}
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-ink-500">
                Cuando se agota, el sistema deja de ejecutar. No es un aviso: es un corte.
              </p>
            </div>

            {budget.clientLimitUsd !== null ? (
              <p className="text-xs text-ink-600">
                Tope propio de este cliente: {formatMoney(budget.clientLimitUsd, 'USD')} · gastado{' '}
                {formatMoney(budget.clientSpentUsd, 'USD')}
              </p>
            ) : null}

            {canManageBudget ? (
              <form onSubmit={saveBudget} className="flex items-end gap-2">
                <Field label="Tope del cliente (USD)" htmlFor="limitUsd" className="flex-1">
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
                  Guardar
                </Button>
              </form>
            ) : null}

            <p className="text-xs text-ink-500">Proveedor: {provider.name}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Búsquedas</CardTitle>
          {runs.length >= 30 ? (
            <p className="text-xs text-ink-500">Se muestran las 30 más recientes.</p>
          ) : null}
        </CardHeader>
        {runs.length === 0 ? (
          <EmptyState title="Todavía no hiciste ninguna búsqueda" description="Armá una arriba para empezar." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Cuándo</Th>
                  <Th>Qué</Th>
                  <Th>Estado</Th>
                  <Th className="text-right">Pedidos</Th>
                  <Th className="text-right">Entregados</Th>
                  <Th className="text-right">Costo</Th>
                  <Th><span className="sr-only">Acciones</span></Th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <Tr key={run.id}>
                    <Td className="whitespace-nowrap text-xs text-ink-600">{formatDateTime(run.startedAt)}</Td>
                    <Td className="text-xs">
                      {run.mode === 'DISCOVER' ? 'Descubrir' : 'Actualizar'} · {platformLabel(run.platform)}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONES[run.status] ?? 'slate'}>{STATUS_LABELS[run.status] ?? run.status}</Badge>
                      {run.errorMessage ? (
                        <p className="mt-0.5 max-w-64 text-[11px] text-rose-700">{run.errorMessage}</p>
                      ) : null}
                    </Td>
                    <Td className="text-right tabular-nums">{run.requestedRecords}</Td>
                    <Td className="text-right tabular-nums">{run.deliveredRecords}</Td>
                    <Td className="text-right tabular-nums">
                      {formatMoney(run.actualCostUsd ?? run.estimatedCostUsd, 'USD')}
                      {run.actualCostUsd === null && run.status !== 'PREVIEW' ? (
                        <span className="block text-[11px] text-ink-400">estimado</span>
                      ) : null}
                    </Td>
                    <Td>
                      {run.resultCount > 0 ? (
                        <Button size="sm" variant="ghost" onClick={() => openResults(run.id)}>
                          Ver {run.resultCount}
                        </Button>
                      ) : run.status === 'RUNNING' ? (
                        <ConfirmButton
                          title="Cancelar la búsqueda"
                          description="Se le pide al proveedor que corte. Lo que ya recolectó se cobra igual."
                          confirmLabel="Sí, cancelar"
                          tone="danger"
                          onConfirm={() => cancelar(run.id)}
                          pending={pending}
                        >
                          <Button size="sm" variant="ghost" disabled={pending}>
                            Cancelar
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
            <CardTitle>Resultados</CardTitle>
            <p className="text-xs text-ink-500">
              Elegí los que valgan la pena. Los que no importes no se guardan en la base de influencers.
            </p>
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
                  <strong className="text-ink-900">{cumplen}</strong> cumplen lo que pediste
                  {sinDato > 0 ? ` · ${sinDato} no se pudieron comprobar` : ''}
                  {fuera > 0 ? ` · ${fuera} quedaron fuera` : ''}. Ninguno se descarta solo: los tenés todos acá.
                </p>
              )
            })()}
          </CardHeader>
          {results.length === 0 ? (
            <CardBody>
              {pending ? (
                <p className="text-sm text-ink-500">Trayendo los perfiles…</p>
              ) : (
                /*
                 * Un panel que no aparece se lee como un botón roto. Si la
                 * búsqueda terminó y no quedó ningún perfil guardado, hay que
                 * decirlo: el proveedor cobró igual.
                 */
                <div className="space-y-1">
                  <p className="text-sm font-medium text-ink-900">Esta búsqueda no dejó ningún perfil guardado.</p>
                  <p className="text-xs text-ink-500">
                    El proveedor entregó registros, pero ninguno tenía los datos mínimos para armar un perfil
                    --nombre de usuario y enlace--. El gasto se cobró igual. Si se repite, probá con otra plataforma
                    o avisale al equipo: puede ser el proveedor y no la búsqueda.
                  </p>
                </div>
              )}
            </CardBody>
          ) : null}

          {results.length > 0 ? (
          <CardBody className="flex flex-wrap items-end gap-3 border-b border-ink-200">
            <Field label="Agregar a la campaña" htmlFor="targetCampaign" className="w-64">
              <Select id="targetCampaign" value={targetCampaign} onChange={(event) => setTargetCampaign(event.target.value)}>
                <option value="">Sólo a la base de influencers</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={importSelected} disabled={pending || selected.size === 0}>
              Importar {selected.size > 0 ? `${selected.size} perfiles` : 'seleccionados'}
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
                      aria-label="Seleccionar todos"
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
                  <Th>Perfil</Th>
                  <Th className="text-right">Seguidores</Th>
                  <Th className="text-right">ER</Th>
                  <Th>País</Th>
                  <Th>Contra tus filtros</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <Tr key={result.id}>
                    <Td>
                      <Checkbox
                        aria-label={`Seleccionar ${result.displayName ?? result.url}`}
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
                    <Td className="text-right tabular-nums">{formatFollowers(result.followers)}</Td>
                    <Td className="text-right tabular-nums">{formatPercent(result.engagementRate)}</Td>
                    <Td className="text-xs">{result.country ?? '—'}</Td>
                    <Td className="text-xs">
                      {result.veredicto === 'CUMPLE' ? (
                        <Badge tone="emerald">Cumple</Badge>
                      ) : result.veredicto === 'SIN_DATO' ? (
                        <>
                          <Badge tone="amber">Sin dato</Badge>
                          <p className="mt-0.5 text-ink-500">{result.motivos.join(' · ')}</p>
                        </>
                      ) : (
                        <>
                          <Badge tone="slate">Fuera</Badge>
                          <p className="mt-0.5 text-ink-500">{result.motivos.join(' · ')}</p>
                        </>
                      )}
                    </Td>
                    <Td>
                      {result.imported ? (
                        <Badge tone="emerald">Importado</Badge>
                      ) : result.matchedInfluencerId ? (
                        <Badge tone="blue">Ya está en la base</Badge>
                      ) : (
                        <Badge tone="slate">Nuevo</Badge>
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
