"use client"

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Field, Input, Select } from '@/components/ui/field'
import { Stat, StatStrip } from '@/components/ui/stat'
import { InfoNote } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { formatNumber } from '@/lib/util/format'
import type { ImportSummary } from '@/lib/import/runner'
import { MARKET_SEED } from '@/lib/domain/statuses'
import { formatMoney, formatPercent } from '@/lib/util/format'
import {
  ajustarImportacionAction,
  aplicarPaisesAction,
  buscarPaisesAction,
  cancelImportAction,
  confirmImportAction,
  contarFilasSinPaisAction,
  preverPaisesAction,
  previewImportAction,
} from '../actions/imports'
import { pollScoutingAction } from '../actions/scouting'

/*
 * Qué le pasó a esa fila. Salía el valor del enum en mayúsculas -- CONFLICT,
 * MULTI_PERSON -- al lado de columnas escritas en castellano.
 */
/*
 * Guarda la CLAVE del texto, no el texto. Este mapa vive fuera del componente
 * --se arma una sola vez al cargar el módulo-- y ahí todavía no se sabe en qué
 * idioma se va a leer. Se traduce al dibujar.
 */
/** Qué va a pasar con cada fila del archivo. */
const RESULTADOS: Record<string, string> = {
  ALTA: 'emerald',
  EXISTE: 'slate',
  POSIBLE_DUPLICADO: 'amber',
}

const OUTCOMES: Record<string, { clave: string; tone: string }> = {
  CONFLICT: { clave: 'contradiccionOrigen', tone: 'rose' },
  UNPARSEABLE: { clave: 'valorSinNormalizar', tone: 'amber' },
  INCOMPLETE: { clave: 'filaIncompleta', tone: 'slate' },
  MULTI_PERSON: { clave: 'variasPersonas', tone: 'violet' },
  SECTION: { clave: 'encabezadoSeccion', tone: 'slate' },
}

export function ImportWizard({
  clients,
  defaultClientId,
}: {
  clients: Array<{ id: string; name: string }>
  defaultClientId: string
}) {
  const t = useTranslations('importacion')
  const idioma = useLocale()
  const router = useRouter()
  const [summary, setSummary] = React.useState<ImportSummary | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [pais, setPais] = React.useState('')
  /** Lo que el proveedor va a cobrar por completar los países. Null = sin preguntar. */
  const [consulta, setConsulta] = React.useState<{ cantidad: number; costo: string; sinUrl: number } | null>(null)
  const [buscando, setBuscando] = React.useState(false)
  /** La corrida de scouting ya registrada, lista para ejecutar. */
  const [pendienteDeEjecutar, setPendienteDeEjecutar] = React.useState<string | null>(null)

  /** Aplica el país elegido a las filas que no lo traen. */
  function aplicarPais() {
    if (!summary) return
    startTransition(async () => {
      const result = await ajustarImportacionAction({
        importRunId: summary.importRunId,
        paisPorDefecto: pais || null,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setSummary(result.data)
      toast.success(t('paisAplicado', { cantidad: result.data.personas.filter((p) => p.country).length }))
    })
  }

  /** Paso 1: cuánto costaría preguntarle al proveedor. No gasta nada. */
  function consultarCosto() {
    if (!summary) return
    startTransition(async () => {
      const [filas, preview] = await Promise.all([
        contarFilasSinPaisAction({ importRunId: summary.importRunId }),
        preverPaisesAction({ importRunId: summary.importRunId }),
      ])
      if (!filas.ok || !preview.ok) {
        toast.error(filas.ok ? (preview.ok ? '' : preview.message) : filas.message)
        return
      }
      if (!preview.data.puedeEjecutar) {
        toast.error(preview.data.bloqueos[0] ?? '')
        return
      }
      setConsulta({
        cantidad: preview.data.requestedRecords,
        costo: formatMoney(preview.data.estimatedCostUsd, 'USD', idioma),
        sinUrl: filas.data.sinUrl,
      })
      setPendienteDeEjecutar(preview.data.runId)
    })
  }

  /**
   * Paso 2: ejecutarla y esperar.
   *
   * El proveedor tarda, así que se consulta cada cinco segundos en vez de
   * dejar la pantalla quieta sin decir nada.
   */
  function preguntarAlProveedor() {
    if (!summary || !pendienteDeEjecutar) return
    const scoutingRunId = pendienteDeEjecutar
    setBuscando(true)
    startTransition(async () => {
      const arranque = await buscarPaisesAction({ scoutingRunId })
      if (!arranque.ok) {
        setBuscando(false)
        toast.error(arranque.message)
        return
      }

      const limite = Date.now() + 3 * 60_000
      while (Date.now() < limite) {
        await new Promise((resolve) => setTimeout(resolve, 5_000))
        const progreso = await pollScoutingAction({ runId: scoutingRunId })
        if (!progreso.ok) break
        if (progreso.data.status === 'RUNNING') continue

        const aplicado = await aplicarPaisesAction({ importRunId: summary.importRunId, scoutingRunId })
        setBuscando(false)
        setConsulta(null)
        setPendienteDeEjecutar(null)
        if (!aplicado.ok) {
          toast.error(aplicado.message)
          return
        }
        setSummary(aplicado.data.summary)
        toast.success(
          t('paisesEncontrados', {
            encontrados: aplicado.data.encontrados,
            sinRespuesta: aplicado.data.sinRespuesta,
          }),
        )
        return
      }
      setBuscando(false)
    })
  }

  function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await previewImportAction(form)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setSummary(result.data)
      toast.success(t('archivoLeido'))
    })
  }

  function confirm() {
    if (!summary) return
    startTransition(async () => {
      const result = await confirmImportAction({ importRunId: summary.importRunId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(
        `Importación aplicada: ${result.data.created} altas, ${result.data.updated} actualizaciones, ${result.data.campaigns} campañas.`,
      )
      setSummary(null)
      router.refresh()
    })
  }

  function cancel() {
    if (!summary) return
    startTransition(async () => {
      const result = await cancelImportAction({ importRunId: summary.importRunId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(t('importacionCancelada'))
      setSummary(null)
      router.refresh()
    })
  }

  if (!summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>1 · Cargar archivo</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={upload} className="flex flex-wrap items-end gap-4">
            {clients.length > 1 ? (
              <div className="w-56">
                <Field label={t('clienteDestino')} htmlFor="clientId" required>
                  <Select id="clientId" name="clientId" defaultValue={defaultClientId} required>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              <input type="hidden" name="clientId" value={defaultClientId} />
            )}
            <div className="min-w-64 flex-1">
              <Field label={t('archivoXlsx')} htmlFor="file" hint={t('maximo10mb')} required>
                <Input
                  id="file"
                  name="file"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  required
                  className="h-auto py-1.5"
                />
              </Field>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? 'Leyendo…' : t('previsualizar')}
            </Button>
          </form>
        </CardBody>
      </Card>
    )
  }

  const counts = summary.counts

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>2 · Reporte previo · {summary.filename}</CardTitle>
          <p className="text-xs text-ink-500">{t('nadaCreado')}</p>
        </CardHeader>
        <CardBody className="space-y-5">
          {/* Dos tiras del sistema en vez de un componente copiado con otros
              tamaños y colores. Salen del reporte del propio archivo. */}
          <div className="space-y-3">
            <StatStrip>
              <Stat label={t('personasEnElArchivo')} value={counts.totalRows} />
              <Stat label={t('altasNuevas')} value={counts.newInfluencers} tone="good" />
              <Stat label={t('yaExisten')} value={counts.existingInfluencers} />
              <Stat label={t('posiblesDuplicados')} value={counts.possibleDuplicates} tone="warn" />
            </StatStrip>
            <StatStrip>
              <Stat label={t('filasIncompletas')} value={counts.incompleteRows} />
              <Stat label={t('valoresSinNormalizar')} value={counts.unparseableValues} tone="warn" />
              <Stat label={t('contradicciones')} value={counts.conflictRows} tone="warn" />
              <Stat label={t('filasConMasDeUna')} value={counts.multiPersonRows} />
            </StatStrip>
          </div>

          {/*
            * El país que falta, antes que nada: es lo que habilita el WhatsApp
            * y lo único de esta pantalla que se puede arreglar sin volver a
            * tocar el archivo.
            */}
          {summary.sinPais > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">{t('faltaElPais', { cantidad: summary.sinPais })}</p>
              <p className="mt-0.5 text-xs text-amber-800">{t('faltaElPaisAyuda')}</p>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label={t('usarEstePais')} htmlFor="paisPorDefecto" className="w-52">
                  <Select id="paisPorDefecto" value={pais} onChange={(evento) => setPais(evento.target.value)}>
                    <option value="">{t('sinElegir')}</option>
                    {MARKET_SEED.map((mercado) => (
                      <option key={mercado} value={mercado}>
                        {mercado}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button size="sm" variant="secondary" onClick={aplicarPais} disabled={pending || !pais}>
                  {t('aplicarPais')}
                </Button>

                <span aria-hidden="true" className="h-9 w-px bg-amber-300" />

                {consulta ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-amber-900">
                      {t('preguntarAyuda', { cantidad: consulta.cantidad, costo: consulta.costo })}
                    </span>
                    <Button size="sm" onClick={preguntarAlProveedor} disabled={pending || buscando}>
                      {buscando ? t('preguntando') : t('preguntarAlProveedor')}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" onClick={consultarCosto} disabled={pending}>
                    {t('preguntarAlProveedor')}
                  </Button>
                )}
              </div>
              {consulta && consulta.sinUrl > 0 ? (
                <p className="mt-2 text-xs text-amber-800">{t('sinUrlParaPreguntar', { cantidad: consulta.sinUrl })}</p>
              ) : null}
            </div>
          ) : null}

          {/* Fila por fila: antes esto era "21 altas nuevas" y a confirmar a ciegas. */}
          <div>
            <h3 className="mb-1 text-sm font-semibold text-ink-900">{t('loQueVaAEntrar')}</h3>
            <p className="mb-2 text-xs text-ink-500">{t('loQueVaAEntrarAyuda')}</p>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>{t('colFila')}</Th>
                    <Th>{t('colNombre')}</Th>
                    <Th>{t('colPerfil')}</Th>
                    <Th className="text-right">{t('colSeguidores')}</Th>
                    <Th className="text-right">{t('colEr')}</Th>
                    <Th>{t('colPais')}</Th>
                    <Th>{t('colTelefono')}</Th>
                    <Th className="text-right">{t('colPrecio')}</Th>
                    <Th>{t('colQuePasa')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {summary.personas.map((persona) => (
                    <Tr key={`${persona.sheetName}-${persona.rowNumber}`}>
                      <Td className="text-xs text-ink-500">{persona.rowNumber}</Td>
                      <Td className="font-medium text-ink-900">{persona.name}</Td>
                      <Td className="text-xs">
                        {persona.url ? (
                          <span className="text-ink-600">{persona.handle ?? persona.url}</span>
                        ) : (
                          <span className="text-amber-700">{t('filaIncompleta')}</span>
                        )}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {formatNumber(persona.followers, idioma)}
                        {persona.followersUnparsed ? (
                          <span className="block text-[11px] text-amber-700">{persona.followersRaw}</span>
                        ) : null}
                      </Td>
                      <Td className="text-right tabular-nums">{formatPercent(persona.engagementRate, idioma)}</Td>
                      <Td className="text-xs">
                        {persona.country ? (
                          <>
                            {persona.country}
                            {persona.countrySource && persona.countrySource !== 'ARCHIVO' ? (
                              <span className="block text-[11px] text-ink-500">
                                {t(`origen${persona.countrySource}`)}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-amber-700">{t('sinDato')}</span>
                        )}
                      </Td>
                      <Td className="text-xs text-ink-600">{persona.phone ?? t('sinDato')}</Td>
                      <Td className="text-right tabular-nums text-xs">
                        {persona.budgetAmount != null
                          ? formatMoney(persona.budgetAmount, persona.budgetCurrency ?? 'USD', idioma)
                          : t('sinDato')}
                      </Td>
                      <Td>
                        <Badge tone={RESULTADOS[persona.outcome] ?? 'slate'}>{t(`resultado${persona.outcome}`)}</Badge>
                        {persona.outcomeDetail ? (
                          <p className="mt-0.5 max-w-64 text-[11px] text-ink-500">{persona.outcomeDetail}</p>
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            {summary.personasOcultas > 0 ? (
              <p className="mt-1 text-xs text-ink-500">
                {t('filasOcultas', { mostradas: summary.personas.length, ocultas: summary.personasOcultas })}
              </p>
            ) : null}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-900">{t('hojasLeidas')}</h3>
            <ul className="space-y-1 text-sm">
              {summary.sheets.map((sheet) => (
                <li key={sheet.name} className="flex items-center gap-2">
                  <Badge tone={sheet.handled ? 'emerald' : 'slate'}>{sheet.handled ? 'leída' : 'omitida'}</Badge>
                  <span className="font-medium text-ink-800">{sheet.name}</span>
                  <span className="text-ink-500">{sheet.note}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-900">{t('campanasACrear')}</h3>
            <ul className="space-y-1 text-sm">
              {summary.campaigns.map((campaign) => (
                <li key={campaign.key} className="text-ink-700">
                  {campaign.name} · <span className="text-ink-500">{campaign.people} perfiles</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-900">{t('briefDetectado')}</h3>
            <p className="text-sm text-ink-700">
              Seguidores {formatNumber(summary.brief.followersMin, idioma)} – {formatNumber(summary.brief.followersMax, idioma)}
              {summary.brief.engagementRateMin != null ? ` · ER mínimo ${summary.brief.engagementRateMin}%` : ''} ·{' '}
              {summary.brief.niches} nichos · {summary.brief.keywords} palabras clave
            </p>
            {summary.brief.clusters.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {summary.brief.clusters.map((cluster) => (
                  <Badge key={cluster.label} tone="blue">
                    {cluster.label} {cluster.targetPercent}%
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <details>
            <summary className="cursor-pointer text-sm font-semibold text-ink-900">
              Decisiones de mapeo ({summary.decisions.length})
            </summary>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-ink-600">
              {summary.decisions.map((decision, index) => (
                <li key={index}>{decision}</li>
              ))}
            </ul>
          </details>

          {summary.duplicates.length > 0 ? (
            <div>
              {/*
                * El título decía la cantidad de la lista, que viene acotada a
                * 200, mientras la cifra de arriba mostraba el total real: con
                * 340 duplicados la pantalla decía 340 arriba y 200 acá.
                */}
              <h3 className="mb-2 text-sm font-semibold text-ink-900">
                Posibles duplicados
                {summary.counts.possibleDuplicates > summary.duplicates.length
                  ? ` · se listan ${summary.duplicates.length} de ${summary.counts.possibleDuplicates}`
                  : ` (${summary.duplicates.length})`}
              </h3>
              <InfoNote className="mb-2">
                No se fusionan automáticamente. Se importan por separado y quedan marcados para que una persona decida.
              </InfoNote>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>{t('hoja')}</Th>
                      <Th>{t('fila')}</Th>
                      <Th>{t('nombre')}</Th>
                      <Th>{t('motivo')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.duplicates.map((duplicate, index) => (
                      <Tr key={index}>
                        <Td className="text-xs">{duplicate.sheetName}</Td>
                        <Td className="text-xs tabular-nums">{duplicate.rowNumber}</Td>
                        <Td className="text-xs font-medium">{duplicate.name}</Td>
                        <Td className="text-xs text-ink-600">{duplicate.reason}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </div>
          ) : null}

          {summary.issues.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-ink-900">
                Filas con problemas
                {summary.counts.incompleteRows > summary.issues.length
                  ? ` · se listan ${summary.issues.length} de ${summary.counts.incompleteRows}`
                  : ` (${summary.issues.length})`}
              </summary>
              <TableWrap className="mt-2">
                <Table>
                  <thead>
                    <tr>
                      <Th>{t('tipo')}</Th>
                      <Th>{t('hoja')}</Th>
                      <Th>{t('fila')}</Th>
                      <Th>{t('detalle')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.issues.map((issue, index) => (
                      <Tr key={index}>
                        <Td>
                          <Badge tone={OUTCOMES[issue.outcome]?.tone ?? 'slate'} title={issue.outcome} dot>
                            {(() => {
                              const clave = OUTCOMES[issue.outcome]?.clave
                              /* Sin clave conocida se muestra el valor crudo: es preferible a un hueco. */
                              return clave ? t(clave) : issue.outcome
                            })()}
                          </Badge>
                        </Td>
                        <Td className="text-xs">{issue.sheetName}</Td>
                        <Td className="text-xs tabular-nums">{issue.rowNumber}</Td>
                        <Td className="text-xs text-ink-600">{issue.message}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </details>
          ) : null}
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={confirm} disabled={pending}>
          {pending ? t('aplicando') : t('confirmarEImportar')}
        </Button>
        <Button variant="secondary" onClick={cancel} disabled={pending}>
          Cancelar
        </Button>
        <p className="w-full text-xs text-ink-500">
          Se puede volver a ejecutar sobre el mismo archivo sin duplicar registros.
        </p>
      </div>
    </div>
  )
}
