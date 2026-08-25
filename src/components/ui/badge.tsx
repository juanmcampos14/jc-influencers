import * as React from 'react'
import { cn } from '@/lib/util/format'

/**
 * Las etiquetas nunca dependen sólo del color: siempre llevan el texto.
 * El color es refuerzo, no información.
 */
const TONES: Record<string, string> = {
  slate: 'bg-ink-100 text-ink-700 border-ink-200',
  stone: 'bg-ink-100 text-ink-600 border-ink-200',
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-50 text-amber-900 border-amber-200',
  rose: 'bg-rose-50 text-rose-800 border-rose-200',
  blue: 'bg-blue-50 text-blue-800 border-blue-200',
  sky: 'bg-sky-50 text-sky-800 border-sky-200',
  indigo: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  violet: 'bg-violet-50 text-violet-800 border-violet-200',
  orange: 'bg-orange-50 text-orange-900 border-orange-200',
}

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & { tone?: string }

export function Badge({ className, tone = 'slate', children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        TONES[tone] ?? TONES.slate,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
