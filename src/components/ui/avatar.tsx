import * as React from 'react'
import { cn } from '@/lib/util/format'

/**
 * Avatar de iniciales.
 *
 * Una base de influencers sin una sola imagen se lee como una planilla. No
 * tenemos la foto de todos -- y traerla del proveedor cuesta plata -- así que
 * el avatar se construye con las iniciales y un color derivado del propio
 * nombre: siempre el mismo para la misma persona, sin guardar nada.
 *
 * El color es decoración. La identidad la da el texto que está al lado.
 */
const PALETA = [
  { fondo: 'bg-indigo-100', texto: 'text-indigo-800' },
  { fondo: 'bg-emerald-100', texto: 'text-emerald-800' },
  { fondo: 'bg-amber-100', texto: 'text-amber-900' },
  { fondo: 'bg-rose-100', texto: 'text-rose-800' },
  { fondo: 'bg-sky-100', texto: 'text-sky-800' },
  { fondo: 'bg-violet-100', texto: 'text-violet-800' },
  { fondo: 'bg-teal-100', texto: 'text-teal-800' },
  { fondo: 'bg-orange-100', texto: 'text-orange-900' },
]

function indiceDe(semilla: string): number {
  let acumulado = 0
  for (let i = 0; i < semilla.length; i += 1) acumulado = (acumulado * 31 + semilla.charCodeAt(i)) % 100_003
  return acumulado % PALETA.length
}

export function iniciales(nombre: string): string {
  const limpio = nombre.replace(/^@/, '').replace(/[._-]+/g, ' ').trim()
  const partes = limpio.split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const primera = partes[0]?.[0] ?? ''
  const segunda = partes.length > 1 ? (partes[1]?.[0] ?? '') : (partes[0]?.[1] ?? '')
  return (primera + segunda).toUpperCase()
}

const TAMANOS = {
  sm: 'size-7 text-[10px]',
  md: 'size-9 text-xs',
  lg: 'size-12 text-sm',
} as const

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string
  /** Foto real, si la tenemos. */
  src?: string | null
  size?: keyof typeof TAMANOS
  className?: string
}) {
  const color = PALETA[indiceDe(name)] ?? PALETA[0]!

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        className={cn('shrink-0 rounded-full border border-ink-200 object-cover', TAMANOS[size], className)}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-bold',
        TAMANOS[size],
        color.fondo,
        color.texto,
        className,
      )}
    >
      {iniciales(name)}
    </span>
  )
}
