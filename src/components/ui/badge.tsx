import * as React from 'react'
import { cn } from '@/lib/util/format'

/**
 * Las etiquetas nunca dependen sólo del color: siempre llevan el texto.
 * El color es refuerzo, no información.
 *
 * El punto de color va aparte del fondo para que la etiqueta se lea igual en
 * una impresión en blanco y negro o con daltonismo: la forma y el texto bastan.
 */
const TONES: Record<string, { chip: string; dot: string }> = {
  slate: { chip: 'bg-ink-100 text-ink-700 border-ink-200', dot: 'bg-ink-400' },
  stone: { chip: 'bg-ink-100 text-ink-600 border-ink-200', dot: 'bg-ink-400' },
  emerald: { chip: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  amber: { chip: 'bg-amber-50 text-amber-900 border-amber-200', dot: 'bg-amber-500' },
  rose: { chip: 'bg-rose-50 text-rose-800 border-rose-200', dot: 'bg-rose-500' },
  blue: { chip: 'bg-blue-50 text-blue-800 border-blue-200', dot: 'bg-blue-500' },
  sky: { chip: 'bg-sky-50 text-sky-800 border-sky-200', dot: 'bg-sky-500' },
  indigo: { chip: 'bg-indigo-50 text-indigo-800 border-indigo-200', dot: 'bg-indigo-500' },
  violet: { chip: 'bg-violet-50 text-violet-800 border-violet-200', dot: 'bg-violet-500' },
  orange: { chip: 'bg-orange-50 text-orange-900 border-orange-200', dot: 'bg-orange-500' },
}

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: string
  /** Punto de color a la izquierda. Útil en columnas de estado. */
  dot?: boolean
}

export function Badge({ className, tone = 'slate', dot = false, children, ...props }: BadgeProps) {
  const estilos = TONES[tone] ?? TONES.slate!
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5',
        estilos.chip,
        className,
      )}
      {...props}
    >
      {dot ? <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', estilos.dot)} /> : null}
      {children}
    </span>
  )
}
