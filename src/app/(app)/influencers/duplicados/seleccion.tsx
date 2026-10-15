"use client"

import { EyeOff, Merge } from 'lucide-react'
import { Seleccion, CasillaDeFila } from '@/components/ui/seleccion'
import { BotonDeLote, useAccionDeLote } from '@/components/ui/acciones-de-lote'
import { descartarDuplicadosAction, fusionarDuplicadosAction } from '../../actions/lote'

export { CasillaDeFila }

/**
 * Resolver varios pares de una vez: descartarlos o fusionarlos.
 *
 * Fusionar en lote estuvo deliberadamente afuera un tiempo, porque une dos
 * fichas y decide cuál sobrevive. La razón era buena y el remedio demasiado:
 * obligaba a mirar de a uno diecisiete pares idénticos para limpiar la lista.
 *
 * La salida no fue confiar en el lote sino acotarlo: **sólo se fusionan los
 * pares que son la misma cuenta** --misma URL o mismo handle en la misma red--,
 * donde no hay nada que juzgar. Los que se juntaron porque el nombre se parece
 * vuelven en la lista de omitidos con el motivo, y se siguen resolviendo de a
 * uno, que es donde hace falta un ojo.
 *
 * Ninguna de las dos borra a nadie. Descartar marca que el par ya se miró;
 * fusionar archiva al absorbido con una nota que dice en quién se fusionó.
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
      <>
      <BotonDeLote
        pendiente={pendiente}
        confirmacion={{
          title: `Fusionar ${ids.length === 1 ? 'el par' : `${ids.length} pares`}`,
          description:
            'Se fusionan sólo los que son la misma cuenta: misma URL o mismo handle en la misma red. En cada uno se conserva la ficha con más historia (perfiles y campañas) y la otra queda archivada con una nota que dice en quién se fusionó, no se borra nada. Los que se juntaron sólo porque el nombre se parece no se tocan, y te decimos cuáles son para que los mires de a uno.',
          confirmLabel: 'Fusionar los que son la misma cuenta',
        }}
        onConfirm={() =>
          ejecutar(
            () => fusionarDuplicadosAction({ ids }),
            { singular: 'par fusionado', plural: 'pares fusionados', ninguno: 'No se fusionó ninguno.' },
            limpiar,
          )
        }
      >
        <Merge className="size-4" aria-hidden="true" />
        Fusionar
      </BotonDeLote>
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
            { singular: 'par descartado', plural: 'pares descartados', ninguno: 'No se descartó ninguno.' },
            limpiar,
          )
        }
      >
        <EyeOff className="size-4" aria-hidden="true" />
        Descartar
      </BotonDeLote>
      </>
    )}>
      {children}
    </Seleccion>
  )
}
