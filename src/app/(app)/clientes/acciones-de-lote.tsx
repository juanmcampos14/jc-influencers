"use client"

import { Archive, ArchiveRestore } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('clientes')
  const { ejecutar, pendiente } = useAccionDeLote()

  return (
    <Seleccion idsDeLaPagina={idsDeLaPagina} etiqueta={t('elegidos')} acciones={(ids, limpiar) => (
      <>
        <BotonDeLote
          pendiente={pendiente}
          confirmacion={{
            title: t('archivarTitulo', { cantidad: ids.length }),
            description: t('archivarBajada'),
            confirmLabel: t('archivar'),
          }}
          onConfirm={() =>
            ejecutar(
              () => archivarClientesAction({ ids, destino: 'ARCHIVED' }),
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
          pendiente={pendiente}
          onConfirm={() =>
            ejecutar(
              () => archivarClientesAction({ ids, destino: 'ACTIVE' }),
              { singular: t('reactivadoSingular'), plural: t('reactivadoPlural'), ninguno: t('reactivadoNinguno') },
              limpiar,
            )
          }
        >
          <ArchiveRestore className="size-4" aria-hidden="true" />
          {t('reactivar')}
        </BotonDeLote>
      </>
    )}>
      {children}
    </Seleccion>
  )
}
