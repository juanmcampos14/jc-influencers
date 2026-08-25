"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/field'
import { EmptyState, InfoNote } from '@/components/ui/states'
import { InsightView } from '@/components/insight-view'
import { formatMoney } from '@/lib/util/format'
import type { InsightDto } from '@/lib/repos/ai'
import {
  analyzeCampaignAction,
  campaignReportAction,
  shareInsightAction,
  suggestCreativesAction,
} from '../../actions/ai'

export function InsightsPanel({
  campaignId,
  insights,
  canRun,
  configured,
  spend,
  timezone,
}: {
  campaignId: string
  insights: InsightDto[]
  canRun: boolean
  configured: boolean
  spend: { spent: number; limit: number }
  timezone: string
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [busy, setBusy] = React.useState<string | null>(null)

  /**
   * `runInsight` atrapa el fallo del proveedor y devuelve un registro con
   * `status: 'FAILED'` en vez de lanzar, así que la acción vuelve como `ok`.
   * Confiar sólo en `ok` daba un "Análisis listo" en verde y, un segundo
   * después, una tarjeta roja diciendo que falló.
   */
  function run(
    kind: string,
    action: () => Promise<{ ok: boolean; message?: string; data?: { status?: string; errorMessage?: string | null } }>,
  ) {
    setBusy(kind)
    startTransition(async () => {
      const result = await action()
      setBusy(null)
      if (!result.ok) {
        toast.error(result.message ?? 'No se pudo generar el análisis.')
        return
      }
      if (result.data?.status === 'FAILED') {
        toast.error(result.data.errorMessage ?? 'No se pudo generar el análisis.')
        router.refresh()
        return
      }
      toast.success('Análisis listo.')
      router.refresh()
    })
  }

  function toggleShare(insightId: string, visible: boolean) {
    startTransition(async () => {
      const result = await shareInsightAction({ insightId, visible, campaignId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(visible ? 'El cliente ya lo ve en su portal.' : 'Se dejó de compartir.')
      router.refresh()
    })
  }

  const remaining = spend.limit > 0 ? Math.max(0, spend.limit - spend.spent) : null

  return (
    <div className="space-y-4">
      {!configured ? (
        <InfoNote>
          <p className="font-medium">El análisis con IA no está conectado.</p>
          <p className="mt-1 text-xs">
            Cargá <code>ANTHROPIC_API_KEY</code> para habilitarlo. Mientras tanto no se genera nada: preferimos no
            mostrar un análisis inventado.
          </p>
        </InfoNote>
      ) : null}

      {canRun ? (
        <Card>
          <CardHeader>
            <CardTitle>Generar un análisis</CardTitle>
            <p className="text-xs text-ink-500">
              Se analiza con los datos que hay cargados. Lo que falte, el análisis lo va a decir en vez de suponerlo.
            </p>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!configured || pending}
                onClick={() => run('analisis', () => analyzeCampaignAction({ campaignId }))}
              >
                {busy === 'analisis' ? 'Analizando…' : 'Cómo viene la campaña'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!configured || pending}
                onClick={() => run('creatividades', () => suggestCreativesAction({ campaignId }))}
              >
                {busy === 'creatividades' ? 'Pensando…' : 'Sugerir creatividades'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!configured || pending}
                onClick={() => run('reporte-interno', () => campaignReportAction({ campaignId, audience: 'AGENCIA' }))}
              >
                {busy === 'reporte-interno' ? 'Escribiendo…' : 'Reporte interno'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!configured || pending}
                onClick={() => run('reporte-cliente', () => campaignReportAction({ campaignId, audience: 'CLIENTE' }))}
              >
                {busy === 'reporte-cliente' ? 'Escribiendo…' : 'Reporte para el cliente'}
              </Button>
            </div>
            {remaining !== null ? (
              <p className="text-xs text-ink-500">
                Gasto de IA este mes: {formatMoney(spend.spent, 'USD')} de {formatMoney(spend.limit, 'USD')}. Cuando se
                agota, deja de generar.
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {insights.length === 0 ? (
        <Card>
          <EmptyState
            title="Todavía no hay análisis"
            description={
              canRun
                ? 'Generá el primero con los botones de arriba.'
                : 'Cuando la agencia comparta un análisis, va a aparecer acá.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {insights.map((insight) => (
            <div key={insight.id}>
              <InsightView insight={insight} timezone={timezone} mostrarDetalleTecnico />
              {canRun && insight.status === 'READY' ? (
                <label className="mt-1.5 flex items-center gap-2 text-xs text-ink-600">
                  <Checkbox
                    checked={insight.clientVisible}
                    onChange={(event) => toggleShare(insight.id, event.target.checked)}
                    disabled={pending}
                  />
                  Compartir este análisis con el cliente en su portal
                </label>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
