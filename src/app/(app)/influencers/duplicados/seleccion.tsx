"use client"

import { EyeOff, Merge } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('duplicados')
  const { ejecutar, pendiente } = useAccionDeLote()

  return (
    <Seleccion idsDeLaPagina={idsDeLaPagina} etiqueta={t('elegidos')} acciones={(ids, limpiar) => (
      <>
      <BotonDeLote
        pendiente={pendiente}
        confirmacion={{
          title: t('fusionarTitulo', { cantidad: ids.length }),
          description: t('fusionarBajada'),
          confirmLabel: t('fusionarConfirmar'),
        }}
        onConfirm={() =>
          ejecutar(
            () => fusionarDuplicadosAction({ ids }),
            { singular: t('fusionadoSingular'), plural: t('fusionadoPlural'), ninguno: t('fusionadoNinguno') },
            limpiar,
          )
        }
      >
        <Merge className="size-4" aria-hidden="true" />
        {t('fusionar')}
      </BotonDeLote>
      <BotonDeLote
        pendiente={pendiente}
        confirmacion={{
          title: t('descartarTitulo', { cantidad: ids.length }),
          description: t('descartarBajada'),
          confirmLabel: t('descartar'),
        }}
        onConfirm={() =>
          ejecutar(
            () => descartarDuplicadosAction({ ids }),
            { singular: t('descartadoSingular'), plural: t('descartadoPlural'), ninguno: t('descartadoNinguno') },
            limpiar,
          )
        }
      >
        <EyeOff className="size-4" aria-hidden="true" />
        {t('descartar')}
      </BotonDeLote>
      </>
    )}>
      {children}
    </Seleccion>
  )
}
