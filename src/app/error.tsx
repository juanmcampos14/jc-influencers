'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // El detalle queda en el servidor; acá sólo el identificador para soporte.
    console.error('Error de aplicación', error.digest)
  }, [error])

  const forbidden = error.message === 'forbidden' || error.name === 'PageForbidden'

  return (
    <main id="contenido" className="flex min-h-screen items-center justify-center bg-ink-100 px-4">
      <div className="max-w-md rounded-xl border border-ink-200 bg-white p-6 text-center">
        <h1 className="text-base font-semibold text-ink-900">
          {forbidden ? 'No tenés permiso para ver esto' : 'Algo salió mal'}
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          {forbidden
            ? 'Tu rol no incluye esta sección. Si creés que debería, pedíselo a un administrador de la agencia.'
            : 'Ocurrió un error inesperado. Podés reintentar; si vuelve a pasar, avisale al equipo.'}
        </p>
        {error.digest ? <p className="mt-2 font-mono text-xs text-ink-400">Referencia: {error.digest}</p> : null}
        {!forbidden ? (
          <button
            type="button"
            onClick={reset}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Reintentar
          </button>
        ) : null}
      </div>
    </main>
  )
}
