"use client"

import { cn } from '@/lib/util/format'

const REDES = [
  { valor: 'INSTAGRAM', etiqueta: 'Instagram' },
  { valor: 'TIKTOK', etiqueta: 'TikTok' },
  { valor: 'YOUTUBE', etiqueta: 'YouTube' },
] as const

export type Red = (typeof REDES)[number]['valor']

/**
 * En qué red buscar.
 *
 * Es un grupo de radios de verdad, no botones: la elección es excluyente y el
 * teclado tiene que recorrerla con las flechas, que es lo que un lector de
 * pantalla anuncia como "1 de 3". Tres botones con `aria-pressed` se leen como
 * tres interruptores independientes, que no es lo que esto es.
 */
export function SelectorDeRed({
  valor,
  onChange,
  disponibles,
}: {
  valor: Red
  onChange: (red: Red) => void
  /** Redes que algún proveedor puede buscar en el modo actual. */
  disponibles?: ReadonlySet<Red>
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium text-ink-700">Red</legend>
      <div className="inline-flex rounded-xl border border-ink-300 bg-ink-50 p-1">
        {REDES.map((red) => {
          const activa = valor === red.valor
          const habilitada = !disponibles || disponibles.has(red.valor)
          return (
            <label
              key={red.valor}
              title={habilitada ? undefined : 'Ningún proveedor conectado puede buscar acá todavía.'}
              className={cn(
                'relative rounded-lg px-4 py-2 text-sm transition-colors',
                'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600',
                activa ? 'bg-surface font-medium text-ink-950 shadow-xs' : 'text-ink-600 hover:text-ink-900',
                habilitada ? 'cursor-pointer' : 'cursor-not-allowed opacity-40',
              )}
            >
              <input
                type="radio"
                name="platform"
                value={red.valor}
                checked={activa}
                disabled={!habilitada}
                onChange={() => onChange(red.valor)}
                className="sr-only"
              />
              {red.etiqueta}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
