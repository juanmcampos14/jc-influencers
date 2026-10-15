"use client"

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field'
import { ConfirmButton } from '@/components/ui/confirm'
import { cn, formatFollowers, intlDe } from '@/lib/util/format'
import {
  claveDeFuente,
  claveDeMetrica,
  type Estado,
  type Metrica,
  type ObjetivoEvaluado,
} from '@/lib/domain/objetivos'
import type { Frase } from '@/lib/domain/frase'
import { borrarObjetivoAction, guardarObjetivoAction } from '@/app/(app)/actions/objetivos'

/* El color de cada estado; el texto sale de `estado<X>` en las traducciones. */
const TONO: Record<Estado, { badge: string; barra: string }> = {
  CUMPLIDO: { badge: 'emerald', barra: 'bg-emerald-500' },
  EN_CAMINO: { badge: 'blue', barra: 'bg-brand-500' },
  NO_ALCANZADO: { badge: 'rose', barra: 'bg-rose-500' },
  SIN_DATO: { badge: 'slate', barra: 'bg-ink-300' },
}

const METRICAS: Metrica[] = [
  'ALCANCE_ESTIMADO',
  'ALCANCE_REAL',
  'VISUALIZACIONES',
  'INTERACCIONES',
  'CLICS',
  'PUBLICACIONES',
  'PERFILES_APROBADOS',
  'INVERSION_EN_TALENTO',
]

/**
 * Objetivos de la campaña y cómo vienen.
 *
 * Dos decisiones que sostienen todo lo demás:
 *
 *  - **Sin dato no dibuja barra.** Una barra vacía se lee como fracaso, y lo
 *    que en realidad pasa es que nadie cargó las métricas. Se muestra el texto
 *    y nada más.
 *  - **Cada objetivo dice de dónde sale su número.** Sin eso, "alcance
 *    estimado" y "alcance real" parecen lo mismo, y uno es una suma de
 *    seguidores mientras el otro es gente que efectivamente vio algo.
 */
export function PanelDeObjetivos({
  objetivos,
  veredicto,
  campaignId,
  cerrada,
  puedeEditar,
  puedeTopeDePlata = false,
  compacto = false,
}: {
  objetivos: ObjetivoEvaluado[]
  veredicto: Frase | null
  campaignId: string
  cerrada: boolean
  puedeEditar: boolean
  /** Sólo quien maneja plata puede poner un tope de inversión. */
  puedeTopeDePlata?: boolean
  /** En el portal se muestra sin el formulario ni las notas internas. */
  compacto?: boolean
}) {
  const t = useTranslations('objetivos')
  const idioma = useLocale()
  const router = useRouter()
  const [pendiente, startTransition] = React.useTransition()
  const [abierto, setAbierto] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)

  const yaUsadas = new Set(objetivos.map((objetivo) => objetivo.metric))
  const disponibles = METRICAS.filter(
    (metrica) => !yaUsadas.has(metrica) && (metrica !== 'INVERSION_EN_TALENTO' || puedeTopeDePlata),
  )

  function guardar(formData: FormData) {
    startTransition(async () => {
      const resultado = await guardarObjetivoAction({
        campaignId,
        metric: String(formData.get('metric') ?? '') as Metrica,
        direction: String(formData.get('direction') ?? 'AL_MENOS') as 'AL_MENOS' | 'COMO_MUCHO',
        target: String(formData.get('target') ?? '').replace(',', '.'),
        rationale: String(formData.get('rationale') ?? '') || null,
        clientVisible: formData.get('clientVisible') === 'on',
      }).catch(() => null)

      if (!resultado?.ok) {
        toast.error(resultado && !resultado.ok ? resultado.message : t('noSeGuardo'))
        return
      }
      toast.success(t('objetivoGuardado'))
      formRef.current?.reset()
      setAbierto(false)
      router.refresh()
    })
  }

  function borrar(goalId: string) {
    startTransition(async () => {
      const resultado = await borrarObjetivoAction({ goalId, campaignId }).catch(() => null)
      if (!resultado?.ok) {
        toast.error(t('noSeBorro'))
        return
      }
      toast.success(t('objetivoQuitado'))
      router.refresh()
    })
  }

  const local = intlDe(idioma)
  const valor = (objetivo: ObjetivoEvaluado, numero: number): string =>
    objetivo.metric === 'INVERSION_EN_TALENTO'
      ? numero.toLocaleString(local, { maximumFractionDigits: 0 })
      : numero >= 10_000
        ? formatFollowers(numero, idioma)
        : numero.toLocaleString(local)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('titulo')}</CardTitle>
        <p className="text-xs text-ink-500">{compacto ? t('bajadaCompacta') : t('bajada')}</p>
        {veredicto ? (
          <p className="mt-1.5 text-sm font-medium text-ink-800">{t(veredicto.clave, veredicto.valores)}</p>
        ) : null}
      </CardHeader>

      <CardBody className="space-y-4">
        {objetivos.length === 0 ? (
          <p className="text-sm text-ink-500">
            {compacto ? t('sinObjetivosCompacto') : t('sinObjetivos')}
          </p>
        ) : (
          <ul className="space-y-3">
            {objetivos.map((objetivo) => {
              const tono = TONO[objetivo.estado]
              const meta = valor(objetivo, objetivo.target)
              return (
                <li key={objetivo.id} className="rounded-lg border border-ink-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-900">
                        {t(claveDeMetrica(objetivo.metric))}
                        <span className="ml-1.5 font-normal text-ink-500">
                          · {objetivo.direction === 'COMO_MUCHO' ? t('noPasarDe') : t('alMenos')} {meta}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {t(objetivo.explicacion.clave, {
                          ...objetivo.explicacion.valores,
                          ...(objetivo.explicacion.valores?.metrica
                            ? { metrica: t(claveDeMetrica(objetivo.metric)).toLowerCase() }
                            : {}),
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={tono.badge}>{t(`estado${objetivo.estado}`)}</Badge>
                      {puedeEditar ? (
                        <ConfirmButton
                          title={t('quitarTitulo')}
                          description={t('quitarBajada')}
                          confirmLabel={t('quitar')}
                          pending={pendiente}
                          onConfirm={() => borrar(objetivo.id)}
                        >
                          <Button size="sm" variant="ghost" disabled={pendiente}>
                            <Trash2 className="size-4" aria-hidden="true" />
                            <span className="sr-only">{t('quitar')}</span>
                          </Button>
                        </ConfirmButton>
                      ) : null}
                    </div>
                  </div>

                  {/*
                    * Sin dato NO dibuja barra. Una barra en cero se lee como
                    * fracaso, y acá significa que nadie cargó las métricas.
                    */}
                  {objetivo.progreso !== null && objetivo.actual !== null ? (
                    <div className="mt-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                        <div
                          className={cn('h-full rounded-full', tono.barra)}
                          style={{ width: `${Math.min(100, Math.max(0, objetivo.progreso))}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] tabular-nums text-ink-500">
                        {t('deMeta', { actual: valor(objetivo, objetivo.actual), meta })}
                      </p>
                    </div>
                  ) : null}

                  <p className="mt-1.5 text-[11px] text-ink-400">{t(claveDeFuente(objetivo.metric))}</p>

                  {objetivo.rationale && !compacto ? (
                    <p className="mt-1 text-xs italic text-ink-600">«{objetivo.rationale}»</p>
                  ) : null}

                  {!compacto && !objetivo.clientVisible ? (
                    <p className="mt-1 text-[11px] text-ink-500">{t('interno')}</p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}

        {cerrada && objetivos.length > 0 ? (
          <p className="text-xs text-ink-500">{t('cerradaAviso')}</p>
        ) : null}

        {puedeEditar && disponibles.length > 0 ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => setAbierto((v) => !v)}>
              <Plus className="size-4" aria-hidden="true" />
              {abierto ? t('cerrarFormulario') : t('definirObjetivo')}
            </Button>

            {abierto ? (
              <form ref={formRef} action={guardar} className="grid gap-3 rounded-lg border border-ink-200 p-4 sm:grid-cols-3">
                <Field label={t('campoQueSeMide')} htmlFor="metric" required className="sm:col-span-2">
                  <Select id="metric" name="metric" required defaultValue={disponibles[0]}>
                    {disponibles.map((metrica) => (
                      <option key={metrica} value={metrica}>
                        {t(claveDeMetrica(metrica))}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('campoSentido')} htmlFor="direction" required>
                  <Select id="direction" name="direction" defaultValue="AL_MENOS" required>
                    <option value="AL_MENOS">{t('sentidoAlMenos')}</option>
                    <option value="COMO_MUCHO">{t('sentidoNoPasarDe')}</option>
                  </Select>
                </Field>
                <Field label={t('campoNumero')} htmlFor="target" required>
                  <Input id="target" name="target" inputMode="decimal" required />
                </Field>
                <Field
                  label={t('campoPorQue')}
                  htmlFor="rationale"
                  className="sm:col-span-2"
                  hint={t('porQueAyuda')}
                >
                  <Textarea id="rationale" name="rationale" rows={2} maxLength={500} />
                </Field>
                <label className="flex items-start gap-2 text-sm text-ink-700 sm:col-span-3">
                  <Checkbox name="clientVisible" defaultChecked className="mt-0.5" />
                  <span>
                    {t('visibleAlCliente')}
                    <span className="block text-xs text-ink-500">{t('visibleAyuda')}</span>
                  </span>
                </label>
                <div className="sm:col-span-3">
                  <Button type="submit" disabled={pendiente}>
                    {pendiente ? t('guardando') : t('guardarObjetivo')}
                  </Button>
                </div>
              </form>
            ) : null}
          </>
        ) : null}
      </CardBody>
    </Card>
  )
}
