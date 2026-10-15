"use client"

import { Ban, Archive } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('campanas')
  const { ejecutar, pendiente } = useAccionDeLote()

  return (
    <Seleccion idsDeLaPagina={idsDeLaPagina} etiqueta={t('elegidas')} acciones={(ids, limpiar) => (
      <>
        <BotonDeLote
          pendiente={pendiente}
          confirmacion={{
            title: t('cerrarTitulo', { cantidad: ids.length }),
            description: t('cerrarBajada'),
            confirmLabel: t('cerrar'),
          }}
          onConfirm={() =>
            ejecutar(
              () => cerrarCampanasAction({ ids, destino: 'CLOSED' }),
              { singular: t('cerradaSingular'), plural: t('cerradaPlural'), ninguno: t('cerradaNinguna') },
              limpiar,
            )
          }
        >
          <Archive className="size-4" aria-hidden="true" />
          {t('cerrar')}
        </BotonDeLote>
        <BotonDeLote
          variant="ghost"
          pendiente={pendiente}
          confirmacion={{
            title: t('cancelarTitulo', { cantidad: ids.length }),
            description: t('cancelarBajada'),
            confirmLabel: t('cancelarConfirmar'),
          }}
          onConfirm={() =>
            ejecutar(
              () => cerrarCampanasAction({ ids, destino: 'CANCELLED' }),
              { singular: t('canceladaSingular'), plural: t('canceladaPlural'), ninguno: t('canceladaNinguna') },
              limpiar,
            )
          }
        >
          <Ban className="size-4" aria-hidden="true" />
          {t('cancelar')}
        </BotonDeLote>
      </>
    )}>
      {children}
    </Seleccion>
  )
}
