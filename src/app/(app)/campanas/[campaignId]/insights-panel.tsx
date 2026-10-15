"use client"

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
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
  const t = useTranslations('campanas')
  const idioma = useLocale()
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
        toast.error(result.message ?? t('noSeGeneroAnalisis'))
        return
      }
      if (result.data?.status === 'FAILED') {
        toast.error(result.data.errorMessage ?? t('noSeGeneroAnalisis'))
        router.refresh()
        return
      }
      toast.success(t('analisisListo'))
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
      toast.success(visible ? t('ahoraLoVe') : t('dejoDeCompartirse'))
      router.refresh()
    })
  }

  const remaining = spend.limit > 0 ? Math.max(0, spend.limit - spend.spent) : null

  return (
    <div className="space-y-4">
      {!configured ? (
        <InfoNote>
          <p className="font-medium">{t('iaNoConectadaTitulo')}</p>
          <p className="mt-1 text-xs">{t.rich('iaNoConectadaBajada', { c: (texto) => <code>{texto}</code> })}</p>
        </InfoNote>
      ) : null}

      {canRun ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('generarAnalisis')}</CardTitle>
            <p className="text-xs text-ink-500">{t('generarAnalisisBajada')}</p>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!configured || pending}
                onClick={() => run('analisis', () => analyzeCampaignAction({ campaignId }))}
              >
                {busy === 'analisis' ? t('analizando') : t('comoViene')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!configured || pending}
                onClick={() => run('creatividades', () => suggestCreativesAction({ campaignId }))}
              >
                {busy === 'creatividades' ? t('pensando') : t('sugerirCreatividades')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!configured || pending}
                onClick={() => run('reporte-interno', () => campaignReportAction({ campaignId, audience: 'AGENCIA' }))}
              >
                {busy === 'reporte-interno' ? t('escribiendo') : t('reporteInterno')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!configured || pending}
                onClick={() => run('reporte-cliente', () => campaignReportAction({ campaignId, audience: 'CLIENTE' }))}
              >
                {busy === 'reporte-cliente' ? t('escribiendo') : t('reporteCliente')}
              </Button>
            </div>
            {remaining !== null ? (
              <p className="text-xs text-ink-500">
                {t('gastoIa', {
                  gastado: formatMoney(spend.spent, 'USD', idioma),
                  tope: formatMoney(spend.limit, 'USD', idioma),
                })}
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {insights.length === 0 ? (
        <Card>
          <EmptyState
            title={t('sinAnalisisTitulo')}
            description={canRun ? t('sinAnalisisPuedeCorrer') : t('sinAnalisisCliente')}
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
                  {t('compartirAnalisis')}
                </label>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
