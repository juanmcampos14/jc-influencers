"use client"

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm'
import { InfluencerStatusBadge } from '@/components/status-badge'
import { platformLabel } from '@/lib/domain/labels'
import { cn, formatFollowers } from '@/lib/util/format'
import { deleteInfluencerAction, dismissDuplicateAction, mergeInfluencersAction } from '../../actions/influencers'

export type LadoDelPar = {
  id: string
  displayName: string
  primaryHandle: string | null
  country: string | null
  status: string
  createdAt: string
  profiles: Array<{ platform: string; url: string; handle: string | null; followers: number | null }>
  candidacies: number
  totalProfiles: number
}

/**
 * Resolver un par de posibles duplicados.
 *
 * Antes sólo se podía decir "no son la misma persona". Cuando sí lo eran, el
 * par volvía a aparecer para siempre y no había forma de arreglarlo.
 *
 * La decisión que importa es cuál de los dos se queda, y para eso hay que ver
 * los dos: quién tiene más perfiles cargados y quién participó de campañas.
 * Fusionar hacia el que está vacío pierde trabajo hecho.
 */
export function ResolverDuplicado({
  duplicateId,
  a,
  b,
  puedeGestionar,
}: {
  duplicateId: string
  a: LadoDelPar
  b: LadoDelPar
  puedeGestionar: boolean
}) {
  const t = useTranslations('duplicados')
  const router = useRouter()
  const [pendiente, startTransition] = React.useTransition()
  // Por defecto sobrevive el que tiene más historia; se puede cambiar.
  const [conservar, setConservar] = React.useState<string>(
    b.candidacies + b.totalProfiles > a.candidacies + a.totalProfiles ? b.id : a.id,
  )

  const sobrevive = conservar === a.id ? a : b
  const absorbido = conservar === a.id ? b : a

  function fusionar() {
    startTransition(async () => {
      const resultado = await mergeInfluencersAction({ keepId: sobrevive.id, mergeId: absorbido.id, duplicateId })
      if (!resultado.ok) {
        toast.error(resultado.message)
        return
      }
      const { movedProfiles, movedCandidacies, conflictedCandidacies } = resultado.data
      const partes = [
        t('fusionResultado', {
          perfiles: movedProfiles,
          campanas: movedCandidacies,
          nombre: sobrevive.displayName,
        }),
      ]
      if (conflictedCandidacies > 0) {
        partes.push(t('fusionConflictos', { cantidad: conflictedCandidacies }))
      }
      toast.success(partes.join('. ') + '.')
      router.refresh()
    })
  }

  /*
   * Borrar es distinto de fusionar. Sirve para la fila basura de una
   * importación: un nombre mal parseado que no es duplicado de nadie y no
   * participó de ninguna campaña. Sólo se ofrece cuando eso se cumple, porque
   * borrar a alguien con historia dejaría campañas incompletas.
   */
  function borrar() {
    startTransition(async () => {
      const resultado = await deleteInfluencerAction({ influencerId: absorbido.id })
      if (!resultado.ok) {
        toast.error(resultado.message)
        return
      }
      toast.success(t('borrado', { nombre: resultado.data.displayName }))
      router.refresh()
    })
  }

  function descartar() {
    startTransition(async () => {
      const resultado = await dismissDuplicateAction({ duplicateId, notes: t('notaRevisado') })
      if (!resultado.ok) {
        toast.error(resultado.message)
        return
      }
      toast.success(t('marcadoRevisado'))
      router.refresh()
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid gap-3 sm:grid-cols-2">
        {[a, b].map((lado) => (
          <Ficha
            key={lado.id}
            lado={lado}
            elegido={conservar === lado.id}
            puedeElegir={puedeGestionar}
            onElegir={() => setConservar(lado.id)}
          />
        ))}
      </div>

      {puedeGestionar ? (
        <div className="flex flex-col justify-center gap-2 lg:w-56">
          <p className="text-xs leading-snug text-ink-500">
            {t('seConserva')} <span className="font-medium text-ink-800">{sobrevive.displayName}</span>.{' '}
            {t('seConservaAviso')}
          </p>
          <ConfirmButton
            title={t('esLaMismaPersona')}
            description={t('fusionBajada', {
              absorbido: absorbido.displayName,
              sobrevive: sobrevive.displayName,
            })}
            confirmLabel={t('fusionarEn', { nombre: sobrevive.displayName })}
            tone="primary"
            onConfirm={fusionar}
            pending={pendiente}
          >
            <Button size="sm" disabled={pendiente} className="w-full">
              {t('esLaMismaPersona')}
            </Button>
          </ConfirmButton>
          <ConfirmButton
            title={t('marcarRevisadoTitulo')}
            description={t('marcarRevisadoBajada')}
            confirmLabel={t('marcarRevisadoConfirmar')}
            tone="primary"
            onConfirm={descartar}
            pending={pendiente}
          >
            <Button size="sm" variant="secondary" disabled={pendiente} className="w-full">
              {t('noSonDuplicados')}
            </Button>
          </ConfirmButton>

          {absorbido.candidacies === 0 ? (
            <ConfirmButton
              title={`Borrar ${absorbido.displayName}`}
              description={`Se borra de la base y no se puede deshacer. Es seguro porque no participó de ninguna campaña: no hay historia que perder. ${sobrevive.displayName} no se toca.`}
              confirmLabel={t('borrarConfirmar')}
              tone="danger"
              onConfirm={borrar}
              pending={pendiente}
            >
              <Button size="sm" variant="ghost" disabled={pendiente} className="w-full text-rose-700 hover:bg-rose-50">
                <Trash2 className="size-4" aria-hidden="true" />
                {t('borrarElRepetido')}
              </Button>
            </ConfirmButton>
          ) : (
            <p className="text-[11px] leading-snug text-ink-500">
              {t('noSePuedeBorrar', { nombre: absorbido.displayName, cantidad: absorbido.candidacies })}
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function Ficha({
  lado,
  elegido,
  puedeElegir,
  onElegir,
}: {
  lado: LadoDelPar
  elegido: boolean
  puedeElegir: boolean
  onElegir: () => void
}) {
  const t = useTranslations('duplicados')
  const tEtiqueta = useTranslations('etiquetas')
  const idioma = useLocale()
  const contenido = (
    <>
      <div className="flex items-start gap-2.5">
        <Avatar name={lado.displayName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-900">{lado.displayName}</p>
          {lado.primaryHandle ? <p className="truncate text-xs text-ink-500">@{lado.primaryHandle}</p> : null}
        </div>
        {elegido ? <Badge tone="emerald">{t('seConserva')}</Badge> : null}
      </div>

      <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
        <div className="flex gap-1">
          <dt>{t('perfiles')}</dt>
          <dd className="font-medium text-ink-900">{lado.totalProfiles}</dd>
        </div>
        <div className="flex gap-1">
          <dt>{t('campanas')}</dt>
          <dd className="font-medium text-ink-900">{lado.candidacies}</dd>
        </div>
        <div className="flex gap-1">
          <dt>{t('pais')}</dt>
          <dd className="font-medium text-ink-900">{lado.country ?? '—'}</dd>
        </div>
      </dl>

      {lado.profiles.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {lado.profiles.map((perfil) => (
            <li key={perfil.url} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-ink-600">
                {platformLabel(tEtiqueta, perfil.platform)}
                {perfil.handle ? ` · @${perfil.handle}` : ''}
              </span>
              <span className="shrink-0 tabular-nums text-ink-800">{formatFollowers(perfil.followers, idioma)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-ink-500">{t('sinPerfilesCargados')}</p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <InfluencerStatusBadge status={lado.status} />
        <Link
          href={`/influencers/${lado.id}`}
          className="inline-flex items-center gap-1 text-xs text-ink-600 underline-offset-4 hover:text-ink-950 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {t('verFicha')}
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </div>
    </>
  )

  const clases = cn(
    'rounded-xl border p-3.5 text-left transition-colors',
    elegido ? 'border-ink-900 bg-surface' : 'border-ink-200 bg-surface-2',
  )

  if (!puedeElegir) return <div className={clases}>{contenido}</div>

  return (
    <button type="button" onClick={onElegir} aria-pressed={elegido} className={cn(clases, 'hover:border-ink-400')}>
      {contenido}
    </button>
  )
}
