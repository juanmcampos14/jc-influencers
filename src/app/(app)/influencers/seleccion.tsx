"use client"

import * as React from 'react'
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
        toast.error('No se pudo agregar. Reintentá en un momento.')
        return
      }
      if (!resultado.ok) {
        toast.error(resultado.message)
        return
      }
      const { added, alreadyThere } = resultado.data
      // Los que ya estaban se dicen: "agregué 12" cuando agregaste 7 es una
      // mentira chica que después cuesta cara.
      const partes = [`${added} ${added === 1 ? 'influencer agregado' : 'influencers agregados'} a ${elegida.name}`]
      if (alreadyThere > 0) partes.push(`${alreadyThere} ya ${alreadyThere === 1 ? 'estaba' : 'estaban'}`)
      toast.success(`${partes.join(' · ')}.`)
      limpiar()
      router.refresh()
    })
  }

  const ocupado = agregando || pendiente

  return (
    <Seleccion idsDeLaPagina={idsDeLaPagina} etiqueta="elegidos" acciones={(ids, limpiar) => (
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
              {agregando ? 'Agregando…' : 'Agregar a la campaña'}
            </Button>
          </>
        ) : null}

        {puedeGestionar ? (
          <>
            <BotonDeLote
              pendiente={ocupado}
              confirmacion={{
                title: `Archivar ${ids.length === 1 ? 'el influencer' : `${ids.length} influencers`}`,
                description:
                  'Salen de la lista por defecto y siguen en la base con todo su historial. Se puede deshacer poniéndolos en activo otra vez.',
                confirmLabel: 'Archivar',
              }}
              onConfirm={() =>
                ejecutar(
                  () => estadoDeInfluencersAction({ ids, destino: 'ARCHIVED' }),
                  { singular: 'influencer archivado', plural: 'influencers archivados', verbo: 'archivó' },
                  limpiar,
                )
              }
            >
              <Archive className="size-4" aria-hidden="true" />
              Archivar
            </BotonDeLote>

            <BotonDeLote
              variant="ghost"
              pendiente={ocupado}
              onConfirm={() =>
                ejecutar(
                  () => estadoDeInfluencersAction({ ids, destino: 'ACTIVE' }),
                  { singular: 'influencer activado', plural: 'influencers activados', verbo: 'activó' },
                  limpiar,
                )
              }
            >
              Marcar activos
            </BotonDeLote>

            <BotonDeLote
              variant="danger"
              pendiente={ocupado}
              confirmacion={{
                title: `Borrar ${ids.length === 1 ? 'el influencer' : `${ids.length} influencers`}`,
                description:
                  'Esto no se deshace. Quien haya participado de alguna campaña no se va a borrar: borrarlo dejaría esas campañas sin parte de su historia, y te vamos a decir cuáles quedaron afuera. Si es un duplicado, fusionalo; si ya no trabajás con él, archivalo.',
                confirmLabel: 'Borrar igual',
              }}
              onConfirm={() =>
                ejecutar(
                  () => borrarInfluencersAction({ ids }),
                  { singular: 'influencer borrado', plural: 'influencers borrados', verbo: 'borró' },
                  limpiar,
                )
              }
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Borrar
            </BotonDeLote>
          </>
        ) : null}
      </>
    )}>
      {children}
    </Seleccion>
  )
}
