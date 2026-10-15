"use client"

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Archive, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { Seleccion, CasillaDeFila } from '@/components/ui/seleccion'
import { BotonDeLote, useAccionDeLote } from '@/components/ui/acciones-de-lote'
import { addToCampaignAction } from '../actions/candidacies'
import { borrarInfluencersAction, estadoDeInfluencersAction } from '../actions/lote'

export { CasillaDeFila }

export type CampanaElegible = { id: string; name: string; clientName: string }

/**
 * Qué se puede hacer con los influencers elegidos.
 *
 * La base era una lista para mirar: encontrabas a alguien que servía y no había
 * nada que hacer con eso. Había que anotarse el nombre, ir a la campaña y
 * buscarlo de nuevo.
 *
 * Archivar y borrar no son lo mismo y la pantalla lo dice: archivar saca de la
 * lista y se deshace; borrar sólo funciona con quien nunca participó de una
 * campaña, porque si no dejaría campañas sin parte de su historia. Esa negativa
 * llega como aviso con el nombre de cada uno, no como un fracaso mudo.
 */
export function SeleccionDeInfluencers({
  campanas,
  idsDeLaPagina,
  puedeGestionar,
  children,
}: {
  campanas: CampanaElegible[]
  idsDeLaPagina: string[]
  puedeGestionar: boolean
  children: React.ReactNode
}) {
  const t = useTranslations('influencers')
  const router = useRouter()
  const [campana, setCampana] = React.useState<string>(campanas[0]?.id ?? '')
  const [agregando, startAgregar] = React.useTransition()
  const { ejecutar, pendiente } = useAccionDeLote()

  function agregar(ids: string[], limpiar: () => void) {
    const elegida = campanas.find((c) => c.id === campana)
    if (!elegida) return
    startAgregar(async () => {
      const resultado = await addToCampaignAction({ campaignId: campana, influencerIds: ids }).catch(() => null)
      if (!resultado) {
        toast.error(t('noSePudoAgregar'))
        return
      }
      if (!resultado.ok) {
        toast.error(resultado.message)
        return
      }
      const { added, alreadyThere } = resultado.data
      // Los que ya estaban se dicen: "agregué 12" cuando agregaste 7 es una
      // mentira chica que después cuesta cara.
      const partes = [t('agregados', { cantidad: added, campana: elegida.name })]
      if (alreadyThere > 0) partes.push(t('yaEstaban', { cantidad: alreadyThere }))
      toast.success(`${partes.join(' · ')}.`)
      limpiar()
      router.refresh()
    })
  }

  const ocupado = agregando || pendiente

  return (
    <Seleccion idsDeLaPagina={idsDeLaPagina} etiqueta={t('elegidos')} acciones={(ids, limpiar) => (
      <>
        {campanas.length > 0 ? (
          <>
            <Select
              aria-label="Campaña de destino"
              value={campana}
              onChange={(event) => setCampana(event.target.value)}
              className="h-9 w-56"
            >
              {campanas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.clientName}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={() => agregar(ids, limpiar)} disabled={ocupado || !campana}>
              <Plus className="size-4" aria-hidden="true" />
              {agregando ? t('agregando') : t('agregarALaCampana')}
            </Button>
          </>
        ) : null}

        {puedeGestionar ? (
          <>
            <BotonDeLote
              pendiente={ocupado}
              confirmacion={{
                title: t('archivarTitulo', { cantidad: ids.length }),
                description: t('archivarBajada'),
                confirmLabel: t('archivar'),
              }}
              onConfirm={() =>
                ejecutar(
                  () => estadoDeInfluencersAction({ ids, destino: 'ARCHIVED' }),
                  { singular: t('archivadoSingular'), plural: t('archivadoPlural'), ninguno: t('archivadoNinguno') },
                  limpiar,
                )
              }
            >
              <Archive className="size-4" aria-hidden="true" />
              {t('archivar')}
            </BotonDeLote>

            <BotonDeLote
              variant="ghost"
              pendiente={ocupado}
              onConfirm={() =>
                ejecutar(
                  () => estadoDeInfluencersAction({ ids, destino: 'ACTIVE' }),
                  { singular: t('activadoSingular'), plural: t('activadoPlural'), ninguno: t('activadoNinguno') },
                  limpiar,
                )
              }
            >
              {t('marcarActivos')}
            </BotonDeLote>

            <BotonDeLote
              variant="danger"
              pendiente={ocupado}
              confirmacion={{
                title: t('borrarTitulo', { cantidad: ids.length }),
                description: t('borrarBajada'),
                confirmLabel: t('borrarIgual'),
              }}
              onConfirm={() =>
                ejecutar(
                  () => borrarInfluencersAction({ ids }),
                  { singular: t('borradoSingular'), plural: t('borradoPlural'), ninguno: t('borradoNinguno') },
                  limpiar,
                )
              }
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {t('borrar')}
            </BotonDeLote>
          </>
        ) : null}
      </>
    )}>
      {children}
    </Seleccion>
  )
}
