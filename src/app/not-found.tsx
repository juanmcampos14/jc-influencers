import Link from 'next/link'

export default function NotFound() {
  return (
    <main id="contenido" className="flex min-h-screen items-center justify-center bg-ink-100 px-4">
      <div className="max-w-md rounded-xl border border-ink-200 bg-surface p-6 text-center">
        <h1 className="text-base font-semibold text-ink-900">No encontramos esta página</h1>
        <p className="mt-2 text-sm text-ink-600">
          Puede que el enlace esté mal, que el contenido se haya archivado, o que no tengas acceso a este espacio de
          trabajo.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  )
}
