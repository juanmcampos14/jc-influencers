"use client"

import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/util/format'
import { setVistaCampanaAction } from '@/app/(app)/actions/view-prefs'
import type { VistaCampana } from '@/lib/repos/view-prefs'

/**
 * Elegir entre decidir de a uno o mirar el conjunto.
 *
 * Son dos `<Link>` y no dos `<button>`: la vista vive en la URL, así que se
 * comparte, se recarga y funciona el botón de atrás. Y llevan la misma marca
 * optimista que las pestañas de campaña, porque sin eso tocar el switch no hace
 * nada visible hasta que vuelve el servidor y desde el teléfono se lee como que
 * la aplicación se colgó.
 *
 * Cada opción muestra su número. Sin números, la elección es entre dos palabras
 * abstractas y nadie sabe cuál le conviene.
 */
export function SelectorDeVista({
  activa,
  base,
  clientId,
  pendientes,
  aprobados,
  total,
}: {
  activa: VistaCampana
  /** Ruta de la campaña en el portal, sin parámetros. */
  base: string
  clientId: string
  pendientes: number
  aprobados: number
  total: number
}) {
  const [pedida, setPedida] = React.useState<VistaCampana | null>(null)
  const [, startTransition] = React.useTransition()

  React.useEffect(() => {
    setPedida(null)
  }, [activa])

  const marcada = pedida ?? activa

  const opciones = [
    {
      key: 'bandeja' as const,
      label: 'Uno por uno',
      numero: String(pendientes),
      descripcion: 'Para despachar la cola: un perfil a la vez, con todo lo que hace falta para decidir.',
    },
    {
      key: 'conjunto' as const,
      label: 'El conjunto',
      numero: `${aprobados}/${total}`,
      descripcion: 'Para entender el equipo que se está armando, no para decidir de a uno.',
    },
  ]

  function elegir(vista: VistaCampana) {
    setPedida(vista)
    startTransition(async () => {
      /*
       * Si falla no se avisa nada: la navegación ya ocurrió y la preferencia se
       * vuelve a intentar la próxima vez. Es una preferencia de interfaz, no un
       * dato: un cartel de error acá sería ruido sobre algo que no importa.
       */
      await setVistaCampanaAction({ clientId, vista }).catch(() => undefined)
    })
  }

  return (
    <div>
      <div
        role="group"
        aria-label="Cómo querés mirar los perfiles"
        className="inline-flex rounded-xl border border-ink-300 bg-surface p-1"
      >
        {opciones.map((opcion) => {
          const esActiva = marcada === opcion.key
          return (
            <Link
              key={opcion.key}
              href={`${base}?vista=${opcion.key}`}
              aria-current={activa === opcion.key ? 'page' : undefined}
              onClick={() => elegir(opcion.key)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-colors',
                esActiva
                  ? 'bg-brand-600 font-medium text-on-brand'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                pedida === opcion.key && activa !== opcion.key && 'opacity-70',
              )}
            >
              {opcion.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] tabular-nums',
                  esActiva ? 'bg-black/15' : 'bg-ink-100 text-ink-600',
                )}
              >
                {opcion.numero}
              </span>
            </Link>
          )
        })}
      </div>
      <p className="mt-1.5 text-xs text-ink-500">
        {opciones.find((opcion) => opcion.key === marcada)?.descripcion}
      </p>
    </div>
  )
}
