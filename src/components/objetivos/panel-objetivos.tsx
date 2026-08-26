"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field'
import { ConfirmButton } from '@/components/ui/confirm'
import { cn, formatFollowers } from '@/lib/util/format'
import {
  METRICA_FUENTE,
  METRICA_LABEL,
  type Estado,
  type Metrica,
  type ObjetivoEvaluado,
} from '@/lib/domain/objetivos'
import { borrarObjetivoAction, guardarObjetivoAction } from '@/app/(app)/actions/objetivos'

const TONO: Record<Estado, { badge: string; barra: string; texto: string }> = {
  CUMPLIDO: { badge: 'emerald', barra: 'bg-emerald-500', texto: 'Cumplido' },
  EN_CAMINO: { badge: 'blue', barra: 'bg-brand-500', texto: 'En camino' },
  NO_ALCANZADO: { badge: 'rose', barra: 'bg-rose-500', texto: 'No se alcanzó' },
  SIN_DATO: { badge: 'slate', barra: 'bg-ink-300', texto: 'Sin datos' },
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
  veredicto: string | null
  campaignId: string
  cerrada: boolean
  puedeEditar: boolean
  /** Sólo quien maneja plata puede poner un tope de inversión. */
  puedeTopeDePlata?: boolean
  /** En el portal se muestra sin el formulario ni las notas internas. */
  compacto?: boolean
}) {
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
        toast.error(resultado && !resultado.ok ? resultado.message : 'No se pudo guardar el objetivo.')
        return
      }
      toast.success('Objetivo guardado.')
      formRef.current?.reset()
      setAbierto(false)
      router.refresh()
    })
  }

  function borrar(goalId: string) {
    startTransition(async () => {
      const resultado = await borrarObjetivoAction({ goalId, campaignId }).catch(() => null)
      if (!resultado?.ok) {
        toast.error('No se pudo borrar el objetivo.')
        return
      }
      toast.success('Objetivo quitado.')
      router.refresh()
    })
  }

  const valor = (objetivo: ObjetivoEvaluado, numero: number): string =>
    objetivo.metric === 'INVERSION_EN_TALENTO'
      ? numero.toLocaleString('es-AR', { maximumFractionDigits: 0 })
      : numero >= 10_000
        ? formatFollowers(numero)
        : numero.toLocaleString('es-AR')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Objetivos</CardTitle>
        <p className="text-xs text-ink-500">
          {compacto
            ? 'Lo que la campaña se propuso, y cómo viene contra lo que se midió.'
            : 'Qué se prometió y si se está cumpliendo. Sólo se pueden fijar objetivos sobre cosas que el producto puede medir de verdad.'}
        </p>
        {veredicto ? <p className="mt-1.5 text-sm font-medium text-ink-800">{veredicto}</p> : null}
      </CardHeader>

      <CardBody className="space-y-4">
        {objetivos.length === 0 ? (
          <p className="text-sm text-ink-500">
            {compacto
              ? 'La agencia todavía no definió objetivos para esta campaña.'
              : 'Todavía no hay objetivos. Sin uno, el reporte va a poder contar qué pasó pero no si estuvo bien.'}
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
                        {METRICA_LABEL[objetivo.metric]}
                        <span className="ml-1.5 font-normal text-ink-500">
                          · {objetivo.direction === 'COMO_MUCHO' ? 'no pasar de' : 'al menos'} {meta}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">{objetivo.explicacion}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={tono.badge}>{tono.texto}</Badge>
                      {puedeEditar ? (
                        <ConfirmButton
                          title="Quitar el objetivo"
                          description="Se pierde el número y el motivo por el que se eligió. El resultado medido no se toca."
                          confirmLabel="Quitar"
                          pending={pendiente}
                          onConfirm={() => borrar(objetivo.id)}
                        >
                          <Button size="sm" variant="ghost" disabled={pendiente}>
                            <Trash2 className="size-4" aria-hidden="true" />
                            <span className="sr-only">Quitar</span>
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
                        {valor(objetivo, objetivo.actual)} de {meta}
                      </p>
                    </div>
                  ) : null}

                  <p className="mt-1.5 text-[11px] text-ink-400">{METRICA_FUENTE[objetivo.metric]}</p>

                  {objetivo.rationale && !compacto ? (
                    <p className="mt-1 text-xs italic text-ink-600">«{objetivo.rationale}»</p>
                  ) : null}

                  {!compacto && !objetivo.clientVisible ? (
                    <p className="mt-1 text-[11px] text-ink-500">Interno: el cliente no lo ve.</p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}

        {cerrada && objetivos.length > 0 ? (
          <p className="text-xs text-ink-500">
            La campaña está cerrada, así que lo que quedó por debajo del objetivo figura como no alcanzado y no como
            «en camino».
          </p>
        ) : null}

        {puedeEditar && disponibles.length > 0 ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => setAbierto((v) => !v)}>
              <Plus className="size-4" aria-hidden="true" />
              {abierto ? 'Cerrar' : 'Definir un objetivo'}
            </Button>

            {abierto ? (
              <form ref={formRef} action={guardar} className="grid gap-3 rounded-lg border border-ink-200 p-4 sm:grid-cols-3">
                <Field label="Qué se mide" htmlFor="metric" required className="sm:col-span-2">
                  <Select id="metric" name="metric" required defaultValue={disponibles[0]}>
                    {disponibles.map((metrica) => (
                      <option key={metrica} value={metrica}>
                        {METRICA_LABEL[metrica]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Sentido" htmlFor="direction" required>
                  <Select id="direction" name="direction" defaultValue="AL_MENOS" required>
                    <option value="AL_MENOS">Al menos</option>
                    <option value="COMO_MUCHO">No pasar de</option>
                  </Select>
                </Field>
                <Field label="Número" htmlFor="target" required>
                  <Input id="target" name="target" inputMode="decimal" required />
                </Field>
                <Field
                  label="Por qué ese número"
                  htmlFor="rationale"
                  className="sm:col-span-2"
                  hint="Dentro de seis meses esto permite discutir el objetivo, no sólo el resultado."
                >
                  <Textarea id="rationale" name="rationale" rows={2} maxLength={500} />
                </Field>
                <label className="flex items-start gap-2 text-sm text-ink-700 sm:col-span-3">
                  <Checkbox name="clientVisible" defaultChecked className="mt-0.5" />
                  <span>
                    El cliente lo ve en su portal
                    <span className="block text-xs text-ink-500">
                      Un tope de inversión en talento nunca se le muestra, aunque marques esto: de ahí se deduce el
                      margen.
                    </span>
                  </span>
                </label>
                <div className="sm:col-span-3">
                  <Button type="submit" disabled={pendiente}>
                    {pendiente ? 'Guardando…' : 'Guardar el objetivo'}
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
