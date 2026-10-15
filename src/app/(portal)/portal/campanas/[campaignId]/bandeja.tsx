"use client"

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Check, HelpCircle, LayoutGrid, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Field, Textarea } from '@/components/ui/field'
import { StarsLabel } from '@/components/status-badge'
import { formatFollowers, formatPercent } from '@/lib/util/format'
import type { CandidacyDto } from '@/lib/domain/dto'
import { approvalAction } from '@/app/(app)/actions/candidacies'

type Decision = 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW'

/**
 * Un perfil por vez.
 *
 * Es para despachar una cola, así que todo lo que no ayuda a decidir sale de la
 * pantalla. Lo que sí entra --y que hasta ahora no se mostraba en ningún
 * lado-- es `agencyRationale`: por qué la agencia propone a esta persona. Es el
 * dato que convierte una decisión de dos minutos en una de diez segundos.
 *
 * La posición vive en la URL (`?n=`) y no en el estado del componente: así se
 * puede recargar, compartir el link y usar el botón de atrás del navegador sin
 * volver al principio de la cola.
 */
export function Bandeja({
  campaignId,
  items,
  canApprove,
  decididos,
  total,
}: {
  campaignId: string
  /** Sólo los que esperan decisión, en orden. */
  items: CandidacyDto[]
  canApprove: boolean
  decididos: number
  total: number
}) {
  const t = useTranslations('portal')
  const idioma = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pendiente, startTransition] = React.useTransition()
  const [motivo, setMotivo] = React.useState('')
  const [pidiendoMotivo, setPidiendoMotivo] = React.useState(false)
  const [errorMotivo, setErrorMotivo] = React.useState<string | null>(null)
  const tarjetaRef = React.useRef<HTMLDivElement>(null)

  const posicion = Math.max(0, Math.min(items.length - 1, Number(searchParams.get('n') ?? 0) || 0))
  const actual = items[posicion]

  const irA = React.useCallback(
    (indice: number) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('vista', 'bandeja')
      params.set('n', String(Math.max(0, indice)))
      router.replace(`/portal/campanas/${campaignId}?${params.toString()}`, { scroll: false })
    },
    [campaignId, router, searchParams],
  )

  const decidir = React.useCallback(
    (decision: Decision, feedback: string | null) => {
      if (!actual) return
      startTransition(async () => {
        const resultado = await approvalAction({
          candidacyId: actual.id,
          campaignId,
          approval: decision,
          feedback,
        }).catch(() => null)

        if (!resultado) {
          toast.error(t('noSeGuardo'))
          return
        }
        if (!resultado.ok) {
          // El motivo obligatorio al descartar lo valida el servidor: si llegó
          // hasta acá, se muestra donde se escribe y no como un cartel suelto.
          setErrorMotivo(resultado.fieldErrors?.feedback?.[0] ?? resultado.message)
          return
        }

        setMotivo('')
        setPidiendoMotivo(false)
        setErrorMotivo(null)
        router.refresh()
      })
    },
    [actual, campaignId, router, t],
  )

  // Atajos: sólo con el foco dentro de la tarjeta y nunca escribiendo un texto.
  React.useEffect(() => {
    const alPresionar = (evento: KeyboardEvent) => {
      if (!canApprove || pidiendoMotivo || pendiente) return
      const destino = evento.target as HTMLElement | null
      if (destino && ['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName)) return
      if (!tarjetaRef.current?.contains(document.activeElement)) return

      const tecla = evento.key.toLowerCase()
      if (tecla === 'a') decidir('APPROVED', null)
      else if (tecla === 'd') setPidiendoMotivo(true)
      else if (tecla === '?') decidir('NEEDS_REVIEW', null)
      else if (tecla === 'z' && posicion > 0) irA(posicion - 1)
      else return
      evento.preventDefault()
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [canApprove, decidir, irA, pendiente, pidiendoMotivo, posicion])

  if (items.length === 0) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <p className="text-lg font-medium text-ink-900">{t('nadaEsperando')}</p>
          <p className="mt-1 text-sm text-ink-500">
            {decididos === total
              ? `Decidiste los ${total} perfiles propuestos.`
              : `Decidiste ${decididos} de ${total}.`}
          </p>
          <Button asChild className="mt-4">
            <Link href={`/portal/campanas/${campaignId}?vista=conjunto`}>
              <LayoutGrid className="size-4" aria-hidden="true" />
              Ver el equipo que se armó
            </Link>
          </Button>
        </CardBody>
      </Card>
    )
  }

  if (!actual) return null

  const perfil = actual.influencer.profiles[0]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
        <span>
          Perfil {posicion + 1} de {items.length} esperando tu decisión
        </span>
        {posicion > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => irA(posicion - 1)} disabled={pendiente}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Volver al anterior
          </Button>
        ) : null}
      </div>

      <Card>
        {/* tabIndex para que los atajos sepan que el foco está en la tarjeta. */}
        <CardBody className="space-y-4">
          <div ref={tarjetaRef} tabIndex={-1} className="space-y-4 outline-none">
          <div className="flex flex-wrap items-start gap-3">
            <Avatar name={actual.influencer.displayName} />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-ink-900">{actual.influencer.displayName}</p>
              <p className="text-sm text-ink-500">
                {perfil?.handle ? `@${perfil.handle}` : '—'}
                {actual.influencer.country ? ` · ${actual.influencer.country}` : ''}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {actual.clusterLabel ? <Badge tone="blue">{actual.clusterLabel}</Badge> : null}
                <StarsLabel value={actual.fitScore} />
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-ink-500">{t('seguidores')}</dt>
              <dd className="cifra text-lg text-ink-900">{formatFollowers(perfil?.followers, idioma)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">{t('engagement')}</dt>
              <dd className="cifra text-lg text-ink-900">{formatPercent(perfil?.engagementRate, idioma)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">{t('red')}</dt>
              <dd className="text-sm text-ink-800">{perfil?.platform?.toLowerCase() ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">{t('entregasPropuestas')}</dt>
              <dd className="text-sm text-ink-800">{actual.deliverablesSummary ?? '—'}</dd>
            </div>
          </dl>

          {actual.agencyRationale ? (
            <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
              <p className="text-xs font-medium text-ink-700">{t('porQueTeLoProponemos')}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-800">{actual.agencyRationale}</p>
            </div>
          ) : null}

          {canApprove ? (
            pidiendoMotivo ? (
              <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
                <Field
                  label={t('porQueLoDescartas')}
                  htmlFor="motivo"
                  required
                  errors={errorMotivo ? [errorMotivo] : undefined}
                  hint={t('pistaDescarte')}
                >
                  <Textarea
                    id="motivo"
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
                    onClick={() => decidir('REJECTED', motivo)}
                  >
                    Confirmar el descarte
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pendiente}
                    onClick={() => {
                      setPidiendoMotivo(false)
                      setErrorMotivo(null)
                    }}
                  >
                    {t('cancelar')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button disabled={pendiente} onClick={() => decidir('APPROVED', null)}>
                  <Check className="size-4" aria-hidden="true" />
                  {t('aprobar')}
                </Button>
                <Button variant="secondary" disabled={pendiente} onClick={() => decidir('NEEDS_REVIEW', null)}>
                  <HelpCircle className="size-4" aria-hidden="true" />
                  {t('pedirMasInfo')}
                </Button>
                <Button variant="ghost" disabled={pendiente} onClick={() => setPidiendoMotivo(true)}>
                  <X className="size-4" aria-hidden="true" />
                  {t('descartar')}
                </Button>
              </div>
            )
          ) : (
            <p className="text-xs text-ink-500">{t('accesoDeLectura')}</p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
            <Link
              href={`/portal/campanas/${campaignId}?vista=conjunto&foco=${actual.id}`}
              className="text-xs text-ink-600 underline underline-offset-4 hover:text-ink-900"
            >
              Ver el conjunto con este perfil marcado
            </Link>
            {canApprove ? (
              <p className="text-[11px] text-ink-400">
                {t('atajos')}
              </p>
            ) : null}
          </div>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
