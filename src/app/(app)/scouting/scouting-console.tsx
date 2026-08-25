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
import { formatDateTime, formatFollowers, formatMoney, formatPercent } from '@/lib/util/format'
import type { BudgetState, PreviewResult, ScoutingResultDto } from '@/lib/repos/scouting'
import {
  cancelScoutingAction,
  importScoutingResultsAction,
  pollScoutingAction,
  previewScoutingAction,
  setScoutingBudgetAction,
  startScoutingAction,
} from '../actions/scouting'
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
  provider,
  canManageBudget,
}: {
  clients: Array<{ id: string; name: string }>
  clientId: string
  budget: BudgetState
  runs: Run[]
  campaigns: Array<{ id: string; name: string }>
  provider: { name: string; configured: boolean }
  canManageBudget: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [preview, setPreview] = React.useState<PreviewResult | null>(null)
  const [openRun, setOpenRun] = React.useState<string | null>(null)
  const [results, setResults] = React.useState<ScoutingResultDto[]>([])
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [targetCampaign, setTargetCampaign] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [mode, setMode] = React.useState<'DISCOVER' | 'ENRICH'>('DISCOVER')

  const running = runs.filter((run) => run.status === 'RUNNING')

  // Mientras haya una corrida en curso, se consulta el avance cada 10 segundos.
  React.useEffect(() => {
    if (running.length === 0) return
    const timer = setInterval(() => {
      startTransition(async () => {
        for (const run of running) {
          const result = await pollScoutingAction({ runId: run.id })
          if (result.ok && result.data.status !== 'RUNNING') {
            toast.info(
              result.data.status === 'COMPLETED'
                ? `Scouting terminado: ${result.data.collected} perfiles.`
                : `La corrida terminó con estado ${result.data.status}.`,
            )
            router.refresh()
          }
        }
      })
    }, 10_000)
    return () => clearInterval(timer)
  }, [running, router])

  function switchClient(next: string) {
    const query = new URLSearchParams(params.toString())
    query.set('cliente', next)
    router.push(`/scouting?${query.toString()}`)
  }

  function runPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await previewScoutingAction({
        clientId,
        campaignId: String(form.get('campaignId') ?? '') || null,
        mode,
        platform: String(form.get('platform') ?? 'INSTAGRAM') as never,
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
    startTransition(async () => {
      const result = await listResultsAction({ runId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setResults(result.data)
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
          <p className="mt-1 text-xs">
            Podés armar la búsqueda y ver cuánto costaría, pero no se va a poder ejecutar hasta cargar{' '}
            <code>BRIGHTDATA_API_TOKEN</code> y los identificadores de dataset. No mostramos datos simulados.
          </p>
        </InfoNote>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Nueva búsqueda</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={runPreview} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                {clients.length > 1 ? (
                  <Field label="Cliente" htmlFor="clientSelect">
                    <Select id="clientSelect" value={clientId} onChange={(event) => switchClient(event.target.value)}>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
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
                <Field label="Plataforma" htmlFor="platform">
                  <Select id="platform" name="platform" defaultValue="INSTAGRAM">
                    <option value="INSTAGRAM">Instagram</option>
                    <option value="TIKTOK">TikTok</option>
                  </Select>
                </Field>
              </div>

              {mode === 'DISCOVER' ? (
                <>
                  <Field
                    label="Palabras clave o hashtags"
                    htmlFor="keywords"
                    hint="Uno por línea. Salen del brief de la campaña."
                    required
                  >
                    <Textarea id="keywords" name="keywords" rows={4} placeholder={'stablecoins\nfinanzas personales\nnomadismo digital'} required />
                  </Field>
                  <Field label="Cuántos perfiles como máximo" htmlFor="limit" hint="Cada perfil tiene costo.">
                    <Input id="limit" name="limit" type="number" min={1} max={500} defaultValue={30} />
                  </Field>
                </>
              ) : (
                <Field
                  label="Perfiles a actualizar"
                  htmlFor="urls"
                  hint="Una URL por línea."
                  required
                >
                  <Textarea id="urls" name="urls" rows={5} placeholder={'https://www.instagram.com/perfil1\nhttps://www.instagram.com/perfil2'} required />
                </Field>
              )}

              <Field label="Agregar a una campaña (opcional)" htmlFor="campaignId">
                <Select id="campaignId" name="campaignId" defaultValue="">
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
                    <dd className="font-semibold tabular-nums text-ink-900">
                      {formatMoney(preview.estimatedCostUsd, 'USD')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Queda este mes</dt>
                    <dd className="font-semibold tabular-nums text-ink-900">
                      {formatMoney(preview.budget.remainingUsd, 'USD')}
                    </dd>
                  </div>
                </dl>
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
                    <Button
                      disabled={
                        pending ||
                        !preview.providerConfigured ||
                        preview.estimatedCostUsd > preview.budget.remainingUsd
                      }
                    >
                      Ejecutar
                    </Button>
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
          <CardTitle>Corridas</CardTitle>
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
                  <Th />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <Tr key={run.id}>
                    <Td className="whitespace-nowrap text-xs text-ink-600">{formatDateTime(run.startedAt)}</Td>
                    <Td className="text-xs">
                      {run.mode === 'DISCOVER' ? 'Descubrir' : 'Actualizar'} · {run.platform}
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
                        <Button size="sm" variant="ghost" onClick={() => cancelScoutingAction({ runId: run.id }).then(() => router.refresh())}>
                          Cancelar
                        </Button>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {openRun && results.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Resultados</CardTitle>
            <p className="text-xs text-ink-500">
              Elegí los que valgan la pena. Los que no importes no se guardan en la base de influencers.
            </p>
          </CardHeader>
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
          <TableWrap className="max-h-[60vh]">
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
        </Card>
      ) : null}
    </div>
  )
}
