import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

export default async function NotFound() {
  const t = await getTranslations('ingreso')
  return (
    <main id="contenido" className="flex min-h-screen items-center justify-center bg-ink-100 px-4">
      <div className="max-w-md rounded-xl border border-ink-200 bg-surface p-6 text-center">
        <h1 className="text-base font-semibold text-ink-900">{t('noEncontradoTitulo')}</h1>
        <p className="mt-2 text-sm text-ink-600">{t('noEncontradoBajada')}</p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700"
        >
          {t('volverAlInicio')}
        </Link>
      </div>
    </main>
  )
}
