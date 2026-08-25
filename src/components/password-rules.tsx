"use client"

import { Check, X } from 'lucide-react'

const RULES: Array<{ label: string; test: (value: string) => boolean }> = [
  { label: 'Al menos 12 caracteres', test: (value) => value.length >= 12 },
  { label: 'Una minúscula', test: (value) => /[a-z]/.test(value) },
  { label: 'Una mayúscula', test: (value) => /[A-Z]/.test(value) },
  { label: 'Un número', test: (value) => /[0-9]/.test(value) },
]

/** Refleja la política del servidor. La validación real siempre corre en el servidor. */
export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="space-y-1" aria-live="polite">
      {RULES.map((rule) => {
        const ok = rule.test(value)
        return (
          <li key={rule.label} className="flex items-center gap-1.5 text-xs">
            {ok ? (
              <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <X className="size-3.5 text-ink-400" aria-hidden="true" />
            )}
            <span className={ok ? 'text-emerald-700' : 'text-ink-500'}>
              {rule.label}
              <span className="sr-only">{ok ? ' — cumplido' : ' — falta'}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
