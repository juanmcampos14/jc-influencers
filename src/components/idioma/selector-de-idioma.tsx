"use client"

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Languages } from 'lucide-react'
import { cn } from '@/lib/util/format'
import { IDIOMAS, type Idioma } from '@/i18n/idiomas'
import { elegirIdiomaAction } from '@/app/(app)/actions/idioma'

/**
 * Elegir idioma.
 *
 * Es un grupo de radios y no un desplegable: son dos opciones, y con radios se
 * ven las dos de una y se cambian con las flechas del teclado. Un lector de
 * pantalla además anuncia "1 de 2".
 *
 * La elección gana sobre lo que diga el navegador o el país: si la ubicación
 * pudiera darla vuelta, alguien que eligió inglés desde Buenos Aires vería la
 * plataforma volver al español en cada recarga.
 */
export function SelectorDeIdioma({ className }: { className?: string }) {
  const actual = useLocale() as Idioma
  const t = useTranslations('idioma')
  const [pendiente, startTransition] = React.useTransition()
  const id = React.useId()

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Languages className="size-4 shrink-0 text-ink-500" aria-hidden="true" />
      <span id={id} className="sr-only">
        {t('etiqueta')}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="flex rounded-lg border border-ink-300 p-0.5">
        {IDIOMAS.map((idioma) => {
          const elegido = idioma === actual
          return (
            <button
              key={idioma}
              type="button"
              role="radio"
              aria-checked={elegido}
              disabled={pendiente || elegido}
              onClick={() => startTransition(() => elegirIdiomaAction(idioma))}
              className={cn(
                'min-h-9 rounded-md px-2.5 text-xs font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                elegido ? 'bg-ink-900 text-surface' : 'text-ink-600 hover:text-ink-900',
                pendiente && 'opacity-60',
              )}
            >
              {t(idioma)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
