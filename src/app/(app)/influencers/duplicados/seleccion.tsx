"use client"

import { EyeOff } from 'lucide-react'
import { Seleccion, CasillaDeFila } from '@/components/ui/seleccion'
import { BotonDeLote, useAccionDeLote } from '@/components/ui/acciones-de-lote'
import { descartarDuplicadosAction } from '../../actions/lote'

export { CasillaDeFila }

/**
 * Descartar varios pares de una vez.
 *
 * Sólo descartar va en lote. Fusionar une dos fichas y decide cuál sobrevive:
 * eso se mira de a uno, con las dos columnas al lado. Un "fusionar todos"
 * ahorraría diez minutos y arruinaría la base.
 *
 * Descartar no borra a nadie: marca que ese par ya se miró y no es el mismo.
 */
export function SeleccionDeDuplicados({
  idsDeLaPagina,
  children,
}: {
  idsDeLaPagina: string[]
  children: React.ReactNode
}) {
  const { ejecutar, pendiente } = useAccionDeLote()

  return (
    <Seleccion idsDeLaPagina={idsDeLaPagina} etiqueta="elegidos" acciones={(ids, limpiar) => (
      <BotonDeLote
        pendiente={pendiente}
        confirmacion={{
          title: `Descartar ${ids.length === 1 ? 'el par' : `${ids.length} pares`}`,
          description:
            'Quedan marcados como revisados y salen de esta lista. No se borra ni se fusiona nada: sólo estás diciendo que no son la misma persona.',
          confirmLabel: 'Descartar',
        }}
        onConfirm={() =>
          ejecutar(
            () => descartarDuplicadosAction({ ids }),
            { singular: 'par descartado', plural: 'pares descartados', verbo: 'descartó' },
            limpiar,
          )
        }
      >
        <EyeOff className="size-4" aria-hidden="true" />
        Descartar
      </BotonDeLote>
    )}>
      {children}
    </Seleccion>
  )
}
