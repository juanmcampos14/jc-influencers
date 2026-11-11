"use client"

import { Ban, Archive, ArchiveRestore, Inbox } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Seleccion, CasillaDeFila } from '@/components/ui/seleccion'
import { BotonDeLote, useAccionDeLote } from '@/components/ui/acciones-de-lote'
import { archivarCampanasAction, cerrarCampanasAction } from '../actions/lote'

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
  archivadas = false,
  puedeArchivar = false,
}: {
  idsDeLaPagina: string[]
  children: React.ReactNode
  /** Estamos mirando la lista de archivadas: lo que se ofrece es restaurar. */
  archivadas?: boolean
  puedeArchivar?: boolean
}) {
  const t = useTranslations('campanas')
  const { ejecutar, pendiente } = useAccionDeLote()

  return (
    <Seleccion idsDeLaPagina={idsDeLaPagina} etiqueta={t('elegidas')} acciones={(ids, limpiar) => (
      <>
        {/*
          * Archivar es lo que resuelve "que no aparezca más y que el cliente
          * no la vea". Va primero porque es lo que la gente busca; cerrar y
          * cancelar siguen existiendo porque dicen otra cosa --cómo terminó--
          * y eso lo necesita el reporte de fin de año.
          */}
        {puedeArchivar ? (
          <BotonDeLote
            pendiente={pendiente}
            confirmacion={{
              title: archivadas
                ? t('restaurarTitulo', { cantidad: ids.length })
                : t('archivarTitulo', { cantidad: ids.length }),
              description: archivadas ? t('restaurarBajada') : t('archivarBajada'),
              confirmLabel: archivadas ? t('restaurar') : t('archivar'),
            }}
            onConfirm={() =>
              ejecutar(
                () => archivarCampanasAction({ ids, archivar: !archivadas }),
                archivadas
                  ? { singular: t('restauradaSingular'), plural: t('restauradaPlural'), ninguno: t('restauradaNinguna') }
                  : { singular: t('archivadaSingular'), plural: t('archivadaPlural'), ninguno: t('archivadaNinguna') },
                limpiar,
              )
            }
          >
            {archivadas ? (
              <ArchiveRestore className="size-4" aria-hidden="true" />
            ) : (
              <Inbox className="size-4" aria-hidden="true" />
            )}
            {archivadas ? t('restaurar') : t('archivar')}
          </BotonDeLote>
        ) : null}
        {archivadas ? null : (
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
        )}
        {archivadas ? null : (
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
        )}
      </>
    )}>
      {children}
    </Seleccion>
  )
}
