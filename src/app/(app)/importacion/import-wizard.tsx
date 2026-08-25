"use client"

import * as React from 'react'
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
import { cancelImportAction, confirmImportAction, previewImportAction } from '../actions/imports'

/*
 * Qué le pasó a esa fila. Salía el valor del enum en mayúsculas -- CONFLICT,
 * MULTI_PERSON -- al lado de columnas escritas en castellano.
 */
const OUTCOMES: Record<string, { label: string; tone: string }> = {
  CONFLICT: { label: 'Contradicción en el origen', tone: 'rose' },
  UNPARSEABLE: { label: 'Valor sin normalizar', tone: 'amber' },
  INCOMPLETE: { label: 'Fila incompleta', tone: 'slate' },
  MULTI_PERSON: { label: 'Varias personas en la fila', tone: 'violet' },
  SECTION: { label: 'Encabezado de sección', tone: 'slate' },
}

export function ImportWizard({
  clients,
  defaultClientId,
}: {
  clients: Array<{ id: string; name: string }>
  defaultClientId: string
}) {
  const router = useRouter()
  const [summary, setSummary] = React.useState<ImportSummary | null>(null)
  const [pending, startTransition] = React.useTransition()

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
      toast.success('Archivo leído. Revisá el reporte antes de aplicar.')
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
      toast.success('Importación cancelada. No se creó nada.')
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
                <Field label="Cliente destino" htmlFor="clientId" required>
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
              <Field label="Archivo .xlsx" htmlFor="file" hint="Máximo 10 MB." required>
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
              {pending ? 'Leyendo…' : 'Previsualizar'}
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
          <p className="text-xs text-ink-500">Todavía no se creó nada. Revisá y decidí.</p>
        </CardHeader>
        <CardBody className="space-y-5">
          {/* Dos tiras del sistema en vez de un componente copiado con otros
              tamaños y colores. Salen del reporte del propio archivo. */}
          <div className="space-y-3">
            <StatStrip>
              <Stat label="Personas en el archivo" value={counts.totalRows} />
              <Stat label="Altas nuevas" value={counts.newInfluencers} tone="good" />
              <Stat label="Ya existen" value={counts.existingInfluencers} />
              <Stat label="Posibles duplicados" value={counts.possibleDuplicates} tone="warn" />
            </StatStrip>
            <StatStrip>
              <Stat label="Filas incompletas" value={counts.incompleteRows} />
              <Stat label="Valores sin normalizar" value={counts.unparseableValues} tone="warn" />
              <Stat label="Contradicciones del origen" value={counts.conflictRows} tone="warn" />
              <Stat label="Filas con más de una persona" value={counts.multiPersonRows} />
            </StatStrip>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Hojas leídas</h3>
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
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Campañas que se van a crear</h3>
            <ul className="space-y-1 text-sm">
              {summary.campaigns.map((campaign) => (
                <li key={campaign.key} className="text-ink-700">
                  {campaign.name} · <span className="text-ink-500">{campaign.people} perfiles</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Brief detectado</h3>
            <p className="text-sm text-ink-700">
              Seguidores {formatNumber(summary.brief.followersMin)} – {formatNumber(summary.brief.followersMax)}
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
              <TableWrap className="max-h-64">
                <Table>
                  <thead>
                    <tr>
                      <Th>Hoja</Th>
                      <Th>Fila</Th>
                      <Th>Nombre</Th>
                      <Th>Motivo</Th>
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
              <TableWrap className="mt-2 max-h-80">
                <Table>
                  <thead>
                    <tr>
                      <Th>Tipo</Th>
                      <Th>Hoja</Th>
                      <Th>Fila</Th>
                      <Th>Detalle</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.issues.map((issue, index) => (
                      <Tr key={index}>
                        <Td>
                          <Badge tone={OUTCOMES[issue.outcome]?.tone ?? 'slate'} title={issue.outcome} dot>
                            {OUTCOMES[issue.outcome]?.label ?? issue.outcome}
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
          {pending ? 'Aplicando…' : 'Confirmar e importar'}
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
