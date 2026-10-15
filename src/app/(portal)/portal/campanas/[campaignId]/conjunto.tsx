"use client"

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Field, Textarea } from '@/components/ui/field'
import { StarsLabel } from '@/components/status-badge'
import { cn, formatFollowers, formatPercent } from '@/lib/util/format'
import type { CandidacyDto } from '@/lib/domain/dto'
import { approvalAction } from '@/app/(app)/actions/candidacies'

export type ClusterMeta = { id: string; label: string; emoji: string | null; targetPercent: number }

/**
 * El equipo que se está armando.
 *
 * El squad son las candidaturas con `clientApproval === 'APPROVED'`. NO se toca
 * `inShortlist`: la shortlist es una marca de la agencia y es otra cosa. Que
 * las dos vistas escriban el mismo campo es lo que hace que el switch no genere
 * dos realidades.
 *
 * El panel muestra sólo lo que se puede calcular con datos reales: alcance
 * combinado y mezcla por cluster. El objetivo de alcance y el tope de
 * presupuesto se muestran únicamente si la campaña los definió; si no, la barra
 * entera no se dibuja en vez de inventar un denominador.
 */
export function Conjunto({
  campaignId,
  items,
  clusters,
  canApprove,
  foco,
  objetivoDeAlcance,
}: {
  campaignId: string
  items: CandidacyDto[]
  clusters: ClusterMeta[]
  canApprove: boolean
  /** Candidatura que viene marcada desde la bandeja. */
  foco: string | null
  /** Del objetivo de la campaña, si existe. Null = no se dibuja la barra. */
  objetivoDeAlcance: number | null
}) {
  const t = useTranslations('portal')
  const idioma = useLocale()
  const router = useRouter()
  const [pendiente, startTransition] = React.useTransition()
  const [descartando, setDescartando] = React.useState<string | null>(null)
  const [motivo, setMotivo] = React.useState('')
  const [errorMotivo, setErrorMotivo] = React.useState<string | null>(null)

  const squad = items.filter((item) => item.clientApproval === 'APPROVED')

  const seguidoresDe = (item: CandidacyDto): number | null => item.influencer.profiles[0]?.followers ?? null
  const conSeguidores = squad.map(seguidoresDe).filter((valor): valor is number => valor !== null)
  const alcance = conSeguidores.reduce((suma, valor) => suma + valor, 0)
  const sinSeguidores = squad.length - conSeguidores.length

  const porCluster = clusters.map((cluster) => {
    const cuantos = squad.filter((item) => item.clusterLabel === cluster.label).length
    return {
      ...cluster,
      cuantos,
      porcentaje: squad.length === 0 ? 0 : (cuantos / squad.length) * 100,
    }
  })

  function decidir(item: CandidacyDto, approval: 'APPROVED' | 'REJECTED', feedback: string | null) {
    startTransition(async () => {
      const resultado = await approvalAction({
        candidacyId: item.id,
        campaignId,
        approval,
        feedback,
      }).catch(() => null)

      if (!resultado) {
        toast.error(t('noSeGuardo'))
        return
      }
      if (!resultado.ok) {
        setErrorMotivo(resultado.fieldErrors?.feedback?.[0] ?? resultado.message)
        return
      }
      setDescartando(null)
      setMotivo('')
      setErrorMotivo(null)
      router.refresh()
    })
  }

  const veredicto = armarVeredicto(squad.length, porCluster, objetivoDeAlcance, alcance, t, idioma)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const perfil = item.influencer.profiles[0]
          const elegido = item.clientApproval === 'APPROVED'
          const enFoco = foco === item.id
          return (
            <li key={item.id}>
              <div
                className={cn(
                  'h-full rounded-xl border p-3 transition-colors',
                  elegido ? 'border-brand-400 bg-brand-50/40' : 'border-ink-200 bg-surface',
                  enFoco && 'ring-2 ring-brand-500 ring-offset-2',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Avatar name={item.influencer.displayName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{item.influencer.displayName}</p>
                    <p className="truncate text-xs text-ink-500">
                      {perfil?.handle ? `@${perfil.handle}` : '—'} · {formatFollowers(perfil?.followers, idioma)} ·{' '}
                      {formatPercent(perfil?.engagementRate, idioma)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {item.clusterLabel ? <Badge tone="blue">{item.clusterLabel}</Badge> : null}
                      <StarsLabel value={item.fitScore} />
                    </div>
                  </div>
                </div>

                {descartando === item.id ? (
                  <div className="mt-2 space-y-2">
                    <Field
                      label={t('porQueLoDescartas')}
                      htmlFor={`motivo-${item.id}`}
                      required
                      errors={errorMotivo ? [errorMotivo] : undefined}
                    >
                      <Textarea
                        id={`motivo-${item.id}`}
                        rows={2}
                        value={motivo}
                        autoFocus
                        onChange={(evento) => {
                          setMotivo(evento.target.value)
                          setErrorMotivo(null)
                        }}
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={pendiente || motivo.trim().length === 0}
                        onClick={() => decidir(item, 'REJECTED', motivo)}
                      >
                        {t('confirmarDescarte')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDescartando(null)} disabled={pendiente}>
                        {t('cancelar')}
                      </Button>
                    </div>
                  </div>
                ) : canApprove ? (
                  <div className="mt-2 flex gap-1.5">
                    <Button
                      size="sm"
                      variant={elegido ? 'subtle' : 'primary'}
                      disabled={pendiente}
                      onClick={() => decidir(item, 'APPROVED', null)}
                    >
                      <Check className="size-4" aria-hidden="true" />
                      {elegido ? t('enElEquipo') : t('sumarAlEquipo')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendiente}
                      onClick={() => {
                        setDescartando(item.id)
                        setMotivo('')
                      }}
                    >
                      <X className="size-4" aria-hidden="true" />
                      <span className="sr-only">{t('descartar')}</span>
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>{t('elEquipo')}</CardTitle>
            <p className="text-xs text-ink-500">
              {squad.length === 0
                ? t('nadieAprobado')
                : (squad.length === 1 ? t('perfilAprobado', { n: squad.length }) : t('perfilesAprobados', { n: squad.length }))}
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <p className="text-xs text-ink-500">{t('alcanceCombinado')}</p>
              <p className="cifra text-2xl text-ink-900">{formatFollowers(alcance, idioma)}</p>
              <p className="text-[11px] text-ink-500">
                Suma de seguidores. Es una estimación, no gente alcanzada.
                {sinSeguidores > 0
                  ? ` ${sinSeguidores} ${sinSeguidores === 1 ? 'perfil no tiene' : 'perfiles no tienen'} la cifra cargada.`
                  : ''}
              </p>

              {/*
                * La barra sólo existe si la campaña definió un objetivo de
                * alcance. Sin objetivo no hay contra qué comparar, y una barra
                * sin denominador es una decoración que se lee como un dato.
                */}
              {objetivoDeAlcance !== null ? (
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-brand-600"
                      style={{ width: `${Math.min(100, (alcance / objetivoDeAlcance) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] tabular-nums text-ink-500">
                    Objetivo: {formatFollowers(objetivoDeAlcance, idioma)}
                  </p>
                </div>
              ) : null}
            </div>

            {porCluster.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs text-ink-500">{t('mezclaContraBrief')}</p>
                <ul className="space-y-2">
                  {porCluster.map((cluster) => (
                    <li key={cluster.id}>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-ink-700">
                          {cluster.emoji ? `${cluster.emoji} ` : ''}
                          {cluster.label}
                        </span>
                        <span className="tabular-nums text-ink-500">
                          {cluster.cuantos} · {Math.round(cluster.porcentaje)}% de {cluster.targetPercent}%
                        </span>
                      </div>
                      <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${Math.min(100, cluster.porcentaje)}%` }}
                        />
                        {/* La marca del objetivo del brief, para ver el desvío. */}
                        <span
                          aria-hidden="true"
                          className="absolute top-0 h-full w-px bg-ink-900/50"
                          style={{ left: `${Math.min(100, cluster.targetPercent)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {veredicto ? <p className="border-t border-ink-100 pt-3 text-sm text-ink-800">{veredicto}</p> : null}

            {squad.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs text-ink-500">{t('quienesEstan')}</p>
                <ul className="space-y-1">
                  {squad.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-ink-700">{item.influencer.displayName}</span>
                      <Link
                        href={`/portal/campanas/${campaignId}?vista=bandeja&n=0&foco=${item.id}`}
                        className="shrink-0 text-ink-500 underline underline-offset-4 hover:text-ink-900"
                      >
                        Revisar
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </aside>
    </div>
  )
}

/**
 * Una frase sobre el estado del equipo.
 *
 * Sólo habla de lo que puede verificar. Si no hay clusters en el brief no dice
 * nada sobre la mezcla, y si no hay objetivo de alcance no opina sobre el
 * tamaño.
 */
function armarVeredicto(
  cuantos: number,
  porCluster: Array<{ label: string; cuantos: number; targetPercent: number; porcentaje: number }>,
  objetivo: number | null,
  alcance: number,
  /*
   * El traductor llega por parámetro porque esto no es un componente: un hook
   * acá no se puede usar, y mover la lógica adentro del componente sólo para
   * poder traducir la haría más difícil de leer y de probar.
   */
  t: (clave: string, valores?: Record<string, string | number>) => string,
  /* Por el mismo motivo que el traductor: acá no se puede usar un hook. */
  idioma: string,
): string | null {
  if (cuantos === 0) return null

  const vacios = porCluster.filter((cluster) => cluster.cuantos === 0 && cluster.targetPercent > 0)
  if (vacios.length > 0) {
    const nombres = vacios.map((cluster) => cluster.label).join(', ')
    return t('faltaPerfil', { nombres })
  }

  if (objetivo !== null && alcance < objetivo) {
    return t('faltaAlcance', { actual: formatFollowers(alcance, idioma), objetivo: formatFollowers(objetivo, idioma) })
  }

  const desviados = porCluster.filter(
    (cluster) => cluster.targetPercent > 0 && Math.abs(cluster.porcentaje - cluster.targetPercent) > 20,
  )
  if (desviados.length > 0) {
    return t('mezclaCorrida', { nombres: desviados.map((c) => c.label).join(', ') })
  }

  return t('respetaLaMezcla')
}
