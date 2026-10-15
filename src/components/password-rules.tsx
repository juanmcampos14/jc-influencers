"use client"

import { Check, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

/* La regla y su clave; el texto sale de las traducciones al pintar. */
const RULES: Array<{ clave: string; test: (value: string) => boolean }> = [
  { clave: 'reglaLargo', test: (value) => value.length >= 12 },
  { clave: 'reglaMinuscula', test: (value) => /[a-z]/.test(value) },
  { clave: 'reglaMayuscula', test: (value) => /[A-Z]/.test(value) },
  { clave: 'reglaNumero', test: (value) => /[0-9]/.test(value) },
]

/** Refleja la política del servidor. La validación real siempre corre en el servidor. */
export function PasswordRules({ value }: { value: string }) {
  const t = useTranslations('cuenta')
  return (
    <ul className="space-y-1" aria-live="polite">
      {RULES.map((rule) => {
        const ok = rule.test(value)
        return (
          <li key={rule.clave} className="flex items-center gap-1.5 text-xs">
            {ok ? (
              <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <X className="size-3.5 text-ink-400" aria-hidden="true" />
            )}
            <span className={ok ? 'text-emerald-700' : 'text-ink-500'}>
              {t(rule.clave)}
              <span className="sr-only">{ok ? t('reglaCumplida') : t('reglaFalta')}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
