"use client"

import { Archive, ArchiveRestore } from 'lucide-react'
import { Seleccion, CasillaDeFila } from '@/components/ui/seleccion'
import { BotonDeLote, useAccionDeLote } from '@/components/ui/acciones-de-lote'
import { archivarClientesAction } from '../actions/lote'

export { CasillaDeFila }

/**
 * Archivar y reactivar clientes.
 *
 * No hay "eliminar", y no es un olvido: un cliente cuelga campañas,
 * candidaturas e historial de decisiones. Borrarlo dejaría a la agencia sin
 * poder explicar qué se hizo y por qué. Archivado sale de la lista y sigue
 * existiendo.
 */
export function SeleccionDeClientes({
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
            title: `Archivar ${ids.length === 1 ? 'el cliente' : `${ids.length} clientes`}`,
            description:
              'Salen de la lista y de los selectores de espacio de trabajo. No se borra nada: sus campañas y su historial quedan intactos, y podés reactivarlos cuando quieras.',
            confirmLabel: 'Archivar',
          }}
          onConfirm={() =>
            ejecutar(
              () => archivarClientesAction({ ids, destino: 'ARCHIVED' }),
              { singular: 'cliente archivado', plural: 'clientes archivados', verbo: 'archivó' },
              limpiar,
            )
          }
        >
          <Archive className="size-4" aria-hidden="true" />
          Archivar
        </BotonDeLote>
        <BotonDeLote
          variant="ghost"
          pendiente={pendiente}
          onConfirm={() =>
            ejecutar(
              () => archivarClientesAction({ ids, destino: 'ACTIVE' }),
              { singular: 'cliente reactivado', plural: 'clientes reactivados', verbo: 'reactivó' },
              limpiar,
            )
          }
        >
          <ArchiveRestore className="size-4" aria-hidden="true" />
          Reactivar
        </BotonDeLote>
      </>
    )}>
      {children}
    </Seleccion>
  )
}
