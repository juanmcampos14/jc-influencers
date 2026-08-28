"use client"

import { UserPlus } from 'lucide-react'
import { Seleccion, CasillaDeFila } from '@/components/ui/seleccion'
import { BotonDeLote, useAccionDeLote } from '@/components/ui/acciones-de-lote'
import { importarDescubiertosAction } from '../../../actions/lote'

export { CasillaDeFila }

/**
 * Pasar varios descubiertos al padrón de una vez.
 *
 * Descubiertos es lo que vimos alguna vez; el padrón, con quién trabajamos.
 * Este es el puente, y va en lote porque revisar cien perfiles de a uno para
 * quedarse con veinte es exactamente el trabajo que la pantalla tiene que
 * ahorrar.
 *
 * No hay confirmación destructiva porque no destruye nada: importar crea o ata
 * fichas, no borra ninguna. Lo que sí se dice después es qué pasó con cada uno
 * --cuántos nacieron, cuántos ya estaban-- porque "importé 30" cuando 12 ya
 * estaban haría creer que hay 30 fichas nuevas para trabajar.
 */
export function SeleccionDeDescubiertos({
  idsDeLaPagina,
  children,
}: {
  idsDeLaPagina: string[]
  children: React.ReactNode
}) {
  const { ejecutar, pendiente } = useAccionDeLote()

  return (
    <Seleccion
      idsDeLaPagina={idsDeLaPagina}
      etiqueta="elegidos"
      acciones={(ids, limpiar) => (
        <BotonDeLote
          pendiente={pendiente}
          confirmacion={{
            title: `Pasar ${ids.length === 1 ? 'este perfil' : `${ids.length} perfiles`} al padrón`,
            description:
              'Se crea una ficha para cada uno, con su usuario, sus seguidores y su engagement. A partir de ahí se pueden sumar a una campaña. El que ya estuviera en el padrón se ata al existente en vez de duplicarse.',
            confirmLabel: 'Pasar al padrón',
          }}
          onConfirm={() =>
            ejecutar(
              () => importarDescubiertosAction({ ids }),
              { singular: 'perfil pasado al padrón', plural: 'perfiles pasados al padrón', verbo: 'importó' },
              limpiar,
            )
          }
        >
          <UserPlus className="size-4" aria-hidden="true" />
          Pasar al padrón
        </BotonDeLote>
      )}
    >
      {children}
    </Seleccion>
  )
}
