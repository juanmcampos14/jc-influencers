"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm'
import { InfluencerStatusBadge } from '@/components/status-badge'
import { platformLabel } from '@/lib/domain/labels'
import { cn, formatFollowers } from '@/lib/util/format'
import { dismissDuplicateAction, mergeInfluencersAction } from '../../actions/influencers'

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
      const partes = [`${movedProfiles} perfiles y ${movedCandidacies} candidaturas pasaron a ${sobrevive.displayName}`]
      if (conflictedCandidacies > 0) {
        partes.push(`${conflictedCandidacies} quedaron sin mover: ya participaba de esa campaña`)
      }
      toast.success(partes.join('. ') + '.')
      router.refresh()
    })
  }

  function descartar() {
    startTransition(async () => {
      const resultado = await dismissDuplicateAction({ duplicateId, notes: 'Revisado: no son la misma persona.' })
      if (!resultado.ok) {
        toast.error(resultado.message)
        return
      }
      toast.success('Marcado como revisado.')
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
            Se conserva <span className="font-medium text-ink-800">{sobrevive.displayName}</span>. El otro queda
            archivado con sus datos, no se borra.
          </p>
          <ConfirmButton
            title="Es la misma persona"
            description={`Todo lo de ${absorbido.displayName} pasa a ${sobrevive.displayName}: perfiles, nichos, etiquetas y campañas. ${absorbido.displayName} queda archivado con una nota que dice en quién se fusionó. No se borra nada.`}
            confirmLabel={`Fusionar en ${sobrevive.displayName}`}
            tone="primary"
            onConfirm={fusionar}
            pending={pendiente}
          >
            <Button size="sm" disabled={pendiente} className="w-full">
              Es la misma persona
            </Button>
          </ConfirmButton>
          <ConfirmButton
            title="Marcar como revisado"
            description="Confirmás que no son la misma persona. El par deja de aparecer en la lista, pero queda registrado."
            confirmLabel="Sí, no son duplicados"
            tone="primary"
            onConfirm={descartar}
            pending={pendiente}
          >
            <Button size="sm" variant="secondary" disabled={pendiente} className="w-full">
              No son duplicados
            </Button>
          </ConfirmButton>
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
  const contenido = (
    <>
      <div className="flex items-start gap-2.5">
        <Avatar name={lado.displayName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-900">{lado.displayName}</p>
          {lado.primaryHandle ? <p className="truncate text-xs text-ink-500">@{lado.primaryHandle}</p> : null}
        </div>
        {elegido ? <Badge tone="emerald">Se conserva</Badge> : null}
      </div>

      <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
        <div className="flex gap-1">
          <dt>Perfiles:</dt>
          <dd className="font-medium text-ink-900">{lado.totalProfiles}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Campañas:</dt>
          <dd className="font-medium text-ink-900">{lado.candidacies}</dd>
        </div>
        <div className="flex gap-1">
          <dt>País:</dt>
          <dd className="font-medium text-ink-900">{lado.country ?? '—'}</dd>
        </div>
      </dl>

      {lado.profiles.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {lado.profiles.map((perfil) => (
            <li key={perfil.url} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-ink-600">
                {platformLabel(perfil.platform)}
                {perfil.handle ? ` · @${perfil.handle}` : ''}
              </span>
              <span className="shrink-0 tabular-nums text-ink-800">{formatFollowers(perfil.followers)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-ink-500">Sin perfiles cargados.</p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <InfluencerStatusBadge status={lado.status} />
        <Link
          href={`/influencers/${lado.id}`}
          className="inline-flex items-center gap-1 text-xs text-ink-600 underline-offset-4 hover:text-ink-950 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          Ver ficha
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
