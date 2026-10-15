"use client"

import { Ban, Archive } from 'lucide-react'
import { Seleccion, CasillaDeFila } from '@/components/ui/seleccion'
import { BotonDeLote, useAccionDeLote } from '@/components/ui/acciones-de-lote'
import { cerrarCampanasAction } from '../actions/lote'

export { CasillaDeFila }

/**
 * Cerrar o cancelar campañas en lote.
 *
 * Ninguna de las dos borra nada, y son cosas distintas: cerrada es una campaña
 * que terminó, cancelada es una que no llegó a pasar. Meterlas en un mismo
 * "archivar" perdería esa diferencia justo en el reporte de fin de año.
 */
export function SeleccionDeCampanas({
  idsDeLaPagina,
  children,
}: {
  idsDeLaPagina: string[]
  children: React.ReactNode
}) {
  const { ejecutar, pendiente } = useAccionDeLote()

  return (
    <Seleccion idsDeLaPagina={idsDeLaPagina} etiqueta="elegidas" acciones={(ids, limpiar) => (
      <>
        <BotonDeLote
          pendiente={pendiente}
          confirmacion={{
            title: `Cerrar ${ids.length === 1 ? 'la campaña' : `${ids.length} campañas`}`,
            description:
              'Quedan como terminadas: siguen visibles con todo su historial, pero dejan de contar como activas y sus pendientes dejan de pedir una decisión.',
            confirmLabel: 'Cerrar',
          }}
          onConfirm={() =>
            ejecutar(
              () => cerrarCampanasAction({ ids, destino: 'CLOSED' }),
              { singular: 'campaña cerrada', plural: 'campañas cerradas', ninguno: 'No se cerró ninguna.' },
              limpiar,
            )
          }
        >
          <Archive className="size-4" aria-hidden="true" />
          Cerrar
        </BotonDeLote>
        <BotonDeLote
          variant="ghost"
          pendiente={pendiente}
          confirmacion={{
            title: `Cancelar ${ids.length === 1 ? 'la campaña' : `${ids.length} campañas`}`,
            description:
              'Cancelada es distinto de cerrada: es una campaña que no llegó a pasar. Se guarda esa diferencia porque el año que viene alguien va a preguntar por qué.',
            confirmLabel: 'Cancelar la campaña',
          }}
          onConfirm={() =>
            ejecutar(
              () => cerrarCampanasAction({ ids, destino: 'CANCELLED' }),
              { singular: 'campaña cancelada', plural: 'campañas canceladas', ninguno: 'No se canceló ninguna.' },
              limpiar,
            )
          }
        >
          <Ban className="size-4" aria-hidden="true" />
          Cancelar
        </BotonDeLote>
      </>
    )}>
      {children}
    </Seleccion>
  )
}
