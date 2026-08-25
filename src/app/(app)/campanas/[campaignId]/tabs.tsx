"use client"

import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/util/format'

export type Pestana = { key: string; label: string; href: string }

/**
 * Pestañas con respuesta inmediata.
 *
 * Cambiar de pestaña es una navegación del servidor con varias consultas. La
 * pestaña activa la pinta el servidor, así que hasta que llegaba la respuesta
 * no pasaba absolutamente nada al tocar: desde el teléfono se lee como que la
 * aplicación se colgó y la gente vuelve a tocar.
 *
 * No se puede resolver con `loading.tsx` -- acá abajo hay una ruta que llama a
 * `notFound()` y el esqueleto convertiría el 404 en 200 --, así que la señal la
 * da el cliente: la pestaña tocada se marca antes de que vuelva el servidor.
 */
export function PestanasDeCampana({ tabs, activa }: { tabs: Pestana[]; activa: string }) {
  const [pendiente, setPendiente] = React.useState<string | null>(null)
  const [, startTransition] = React.useTransition()

  // Cuando el servidor terminó, la marca optimista sobra.
  React.useEffect(() => {
    setPendiente(null)
  }, [activa])

  const marcada = pendiente ?? activa

  return (
    <nav className="border-b border-ink-200 bg-surface px-5 sm:px-8" aria-label="Secciones de la campaña">
      <ul className="flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const esActiva = marcada === tab.key
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={activa === tab.key ? 'page' : undefined}
                onClick={() => startTransition(() => setPendiente(tab.key))}
                className={cn(
                  'inline-block border-b-2 px-3 py-2.5 text-sm transition-colors',
                  esActiva
                    ? 'border-brand-600 font-medium text-ink-950'
                    : 'border-transparent text-ink-600 hover:text-ink-900',
                  pendiente === tab.key && activa !== tab.key && 'opacity-70',
                )}
              >
                {tab.label}
                {pendiente === tab.key && activa !== tab.key ? (
                  <span className="sr-only"> (cargando)</span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
