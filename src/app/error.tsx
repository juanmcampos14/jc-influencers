'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('ingreso')
  useEffect(() => {
    // El detalle queda en el servidor; acá sólo el identificador para soporte.
    console.error('Error de aplicación', error.digest)
  }, [error])

  const forbidden = error.message === 'forbidden' || error.name === 'PageForbidden'

  return (
    <main id="contenido" className="flex min-h-screen items-center justify-center bg-ink-100 px-4">
      <div className="max-w-md rounded-xl border border-ink-200 bg-surface p-6 text-center">
        <h1 className="text-base font-semibold text-ink-900">
          {forbidden ? t('errorSinPermisoTitulo') : t('errorTitulo')}
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          {forbidden ? t('errorSinPermisoBajada') : t('errorBajada')}
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-ink-400">{t('errorReferencia', { id: error.digest })}</p>
        ) : null}
        {!forbidden ? (
          <button
            type="button"
            onClick={reset}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700"
          >
            {t('reintentar')}
          </button>
        ) : null}
      </div>
    </main>
  )
}
