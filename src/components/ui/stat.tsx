import * as React from 'react'
import { cn } from '@/lib/util/format'

/**
 * Cifra de cabecera.
 *
 * Sólo se muestran números que salen de la base. Cuando un dato no está, se
 * dice: un cero inventado y un cero real se ven igual, y uno de los dos miente.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  className,
}: {
  label: string
  /** `null` cuando el dato no se puede calcular todavía. */
  value: number | string | null
  hint?: string
  tone?: 'neutral' | 'accent' | 'warn' | 'good'
  className?: string
}) {
  const colorCifra = {
    neutral: 'text-ink-950',
    accent: 'text-ink-950',
    warn: 'text-amber-700',
    good: 'text-emerald-700',
  }[tone]

  const contenido = (
    <>
      {tone === 'accent' ? (
        <span aria-hidden="true" className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-accent" />
      ) : null}
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{label}</p>
      {value === null ? (
        <p className="mt-1.5 text-sm text-ink-400">Sin datos</p>
      ) : (
        <p className={cn('cifra mt-1.5 text-[28px] sm:text-[32px]', colorCifra)}>{value}</p>
      )}
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </>
  )

  return <div className={cn('relative px-4 py-3.5 sm:px-5', className)}>{contenido}</div>
}

/** Fila de cifras. Se parte en tarjetas en pantalla chica. */
export function StatStrip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 divide-x divide-y divide-ink-200 overflow-hidden rounded-xl border border-ink-200 bg-surface shadow-[0_1px_2px_rgba(16,18,24,0.04)] sm:grid-cols-4 sm:divide-y-0',
        className,
      )}
    >
      {children}
    </div>
  )
}
