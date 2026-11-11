"use client"

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Field, Select, Textarea } from '@/components/ui/field'
import { formatFollowers } from '@/lib/util/format'
import { pareceListaDeEnlaces } from '@/lib/domain/enlaces-pegados'
import { createCandidacyAction } from '../../actions/candidacies'
import {
  agregarPorEnlaceAction,
  crearYAgregarAction,
  resolverEnlacesAction,
  searchInfluencersForCampaign,
} from './search-action'

type Result = { id: string; displayName: string; handle: string | null; followers: number | null; country: string | null }

type EnlaceResuelto = {
  texto: string
  platform: string
  handle: string | null
  estado: 'YA_EN_CAMPANA' | 'EN_LA_BASE' | 'NUEVO'
  influencerId: string | null
  nombre: string
}
type Lectura = { enlaces: EnlaceResuelto[]; noReconocidos: string[]; puedeCrear: boolean }

/**
 * Agregar gente a la campaña sin salir de la campaña.
 *
 * El campo acepta dos cosas distintas y se da cuenta sola de cuál es:
 *
 *  - **Un nombre**: busca en la base, como siempre. Si no hay nadie, ofrece
 *    darlo de alta acá mismo en vez de mandar a otra sección.
 *  - **Uno o varios links**: los separa, dice de cada uno si ya está en la
 *    campaña, si está en la base o si se va a crear, y los agrega todos juntos.
 *
 * Lo que se ve antes de apretar sale del servidor, no de una suposición de la
 * pantalla, y al agregar se vuelve a resolver: entre que se mira y se aprieta,
 * otra persona pudo dar de alta al mismo perfil.
 */
export function AddCandidacyDialog({
  campaignId,
  clusters,
}: {
  campaignId: string
  clusters: Array<{ id: string; label: string }>
}) {
  const t = useTranslations('campanas')
  const idioma = useLocale()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<Result[]>([])
  const [lectura, setLectura] = React.useState<Lectura | null>(null)
  const [clusterId, setClusterId] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  const esPegado = pareceListaDeEnlaces(query)

  React.useEffect(() => {
    if (!open) return
    /*
     * Dos caminos que no se pisan: lo pegado se resuelve contra la base, lo
     * escrito se busca. Antes de decidir no hace falta preguntarle a nadie --
     * `pareceListaDeEnlaces` es puro y corre acá.
     */
    if (esPegado) {
      setResults([])
      const timer = setTimeout(() => {
        startTransition(async () => {
          const result = await resolverEnlacesAction({ campaignId, texto: query })
          if (result.ok) setLectura(result.data)
        })
      }, 250)
      return () => clearTimeout(timer)
    }

    setLectura(null)
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchInfluencersForCampaign({ campaignId, query })
        if (result.ok) setResults(result.data)
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [open, query, esPegado, campaignId])

  function cerrarYRefrescar() {
    setOpen(false)
    setQuery('')
    setResults([])
    setLectura(null)
    router.refresh()
  }

  function add(influencerId: string) {
    startTransition(async () => {
      const result = await createCandidacyAction({ campaignId, influencerId, clusterId: clusterId || null })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(t('candidaturaCreada'))
      cerrarYRefrescar()
    })
  }

  function agregarEnlaces() {
    startTransition(async () => {
      const result = await agregarPorEnlaceAction({ campaignId, texto: query, clusterId: clusterId || null })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      const { agregados, creados, yaEstaban, fallidos } = result.data
      toast.success(t('enlacesResultado', { agregados, creados, yaEstaban }))
      /*
       * Los que fallaron se dicen aparte y no cierran el diálogo: si seis
       * entraron y uno no, esconderlo detrás de un cartel de éxito haría que
       * ese uno se pierda sin que nadie se entere.
       */
      if (fallidos.length > 0) {
        toast.error(
          t('enlacesFallidos', { cantidad: fallidos.length, lista: fallidos.map((f) => f.texto).join(', ') }),
          { duration: 10_000 },
        )
        router.refresh()
        return
      }
      cerrarYRefrescar()
    })
  }

  function crearYAgregar() {
    startTransition(async () => {
      const result = await crearYAgregarAction({ campaignId, displayName: query.trim(), clusterId: clusterId || null })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(t('candidaturaCreada'))
      cerrarYRefrescar()
    })
  }

  const porAgregar = lectura?.enlaces.filter((enlace) => enlace.estado !== 'YA_EN_CAMPANA') ?? []

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{t('agregarInfluencer')}</Button>
      </DialogTrigger>
      <DialogContent title={t('agregarTitulo')} description={t('agregarBajada')}>
        <div className="space-y-4">
          <Field label={t('campoBuscar')} htmlFor="query">
            {/*
              * Un área de texto y no una línea: el alto dice solo que acá se
              * puede pegar más de una cosa. Con un campo de una línea, seis
              * links pegados se ven como uno larguísimo.
              */}
            <Textarea
              id="query"
              rows={3}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('buscarPista')}
              className="min-h-[72px] resize-y"
              autoFocus
            />
          </Field>
          {clusters.length > 0 ? (
            <Field label={t('campoCluster')} htmlFor="clusterId">
              <Select id="clusterId" value={clusterId} onChange={(event) => setClusterId(event.target.value)}>
                <option value="">{t('sinCluster')}</option>
                {clusters.map((cluster) => (
                  <option key={cluster.id} value={cluster.id}>
                    {cluster.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {esPegado ? (
            <ListaDePegados lectura={lectura} pending={pending} />
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-ink-200">
              {query.trim().length < 2 ? (
                <p className="px-4 py-6 text-center text-sm text-ink-500">{t('dosCaracteres')}</p>
              ) : results.length === 0 ? (
                <div className="space-y-3 px-4 py-6 text-center">
                  <p className="text-sm text-ink-500">{pending ? t('buscandoInfluencer') : t('sinResultados')}</p>
                  {!pending ? (
                    <>
                      <Button size="sm" onClick={crearYAgregar} disabled={pending}>
                        {t('crearYAgregar', { nombre: query.trim() })}
                      </Button>
                      <p className="text-xs text-ink-500">{t('crearYAgregarAviso')}</p>
                    </>
                  ) : null}
                </div>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {results.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-900">{item.displayName}</p>
                        <p className="truncate text-xs text-ink-500">
                          {item.handle ? `@${item.handle}` : t('sinHandle')} ·{' '}
                          {formatFollowers(item.followers, idioma)} · {item.country ?? '—'}
                        </p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => add(item.id)} disabled={pending}>
                        {t('agregar')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t('cerrarDialogo')}
              </Button>
            </DialogClose>
            {esPegado && porAgregar.length > 0 ? (
              <Button type="button" onClick={agregarEnlaces} disabled={pending}>
                {t('agregarEnlaces', { cantidad: porAgregar.length })}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Lo que se pegó, enlace por enlace, antes de tocar nada. */
function ListaDePegados({ lectura, pending }: { lectura: Lectura | null; pending: boolean }) {
  const t = useTranslations('campanas')
  const etiqueta: Record<EnlaceResuelto['estado'], string> = {
    YA_EN_CAMPANA: t('enlaceYaEnCampana'),
    EN_LA_BASE: t('enlaceEnLaBase'),
    NUEVO: t('enlaceNuevo'),
  }
  const tono: Record<EnlaceResuelto['estado'], string> = {
    YA_EN_CAMPANA: 'text-ink-400',
    EN_LA_BASE: 'text-emerald-700',
    NUEVO: 'text-sky-700',
  }

  if (!lectura) {
    return (
      <p className="rounded-lg border border-ink-200 px-4 py-6 text-center text-sm text-ink-500">
        {t('buscandoInfluencer')}
      </p>
    )
  }

  const porAgregar = lectura.enlaces.filter((enlace) => enlace.estado !== 'YA_EN_CAMPANA')
  const hayQueCrear = porAgregar.some((enlace) => enlace.estado === 'NUEVO')

  return (
    <div className="space-y-2">
      {lectura.enlaces.length > 0 ? (
        <>
          <p className="text-xs text-ink-500">{t('enlacesLeidos', { cantidad: lectura.enlaces.length })}</p>
          <ul className="max-h-60 divide-y divide-ink-100 overflow-y-auto rounded-lg border border-ink-200">
            {lectura.enlaces.map((enlace) => (
              <li key={enlace.texto} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{enlace.nombre}</p>
                  <p className="truncate text-xs text-ink-500">{enlace.texto}</p>
                </div>
                <span className={`shrink-0 text-xs ${tono[enlace.estado]}`}>{etiqueta[enlace.estado]}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/*
        * Un link que no es un perfil se dice, no se descarta en silencio: quien
        * lo pegó tiene que poder ver cuál de los seis se quedó afuera.
        */}
      {lectura.noReconocidos.length > 0 ? (
        <p className="text-xs text-amber-800">
          {t('enlacesNoReconocidos', { lista: lectura.noReconocidos.join(', ') })}
        </p>
      ) : null}

      {lectura.enlaces.length > 0 && porAgregar.length === 0 ? (
        <p className="text-xs text-ink-500">{t('enlacesSinNadaQueAgregar')}</p>
      ) : null}

      {hayQueCrear && !lectura.puedeCrear ? (
        <p className="text-xs text-rose-700">{t('sinPermisoParaCrear')}</p>
      ) : null}

      {pending ? <p className="text-xs text-ink-400">{t('buscandoInfluencer')}</p> : null}
    </div>
  )
}
