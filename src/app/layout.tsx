import type { Metadata, Viewport } from 'next'
import { Anton, Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import './globals.css'

/**
 * Nada se prerenderiza en la compilación.
 *
 * El nonce de la política de contenido es distinto en cada respuesta, así que
 * un HTML generado en la compilación no puede llevarlo: sus scripts quedan
 * bloqueados y la página se ve pero no hidrata. Además cada espacio de cliente
 * pinta su propio tema, que tampoco se conoce hasta que hay un pedido.
 */
export const dynamic = 'force-dynamic'

/**
 * Las dos tipografías de JC. Next las sirve desde nuestro propio dominio, así
 * que no hay pedido a Google en cada carga ni un tercero mirando quién entra.
 * Las tipografías que elige cada cliente para su espacio sí vienen de Google,
 * porque no se saben hasta que hay un pedido.
 */
const inter = Inter({ subsets: ['latin'], variable: '--jc-font-inter', display: 'swap' })
const anton = Anton({ subsets: ['latin'], weight: '400', variable: '--jc-font-anton', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'JC Influencers', template: '%s · JC Influencers' },
  description: 'Plataforma de gestión de campañas de marketing de influencers.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0c0d10',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /*
   * El idioma se resuelve por pedido (ver `src/i18n/request.ts`) y se escribe
   * en `<html lang>`: sin eso, un lector de pantalla lee el inglés con fonética
   * española, y el navegador ofrece traducir una página que ya está traducida.
   */
  const locale = await getLocale()
  const t = await getTranslations('general')

  return (
    <html lang={locale} className={`${inter.variable} ${anton.variable}`}>
      <body className="min-h-screen antialiased">
        <a
          href="#contenido"
          className="sr-only-focusable absolute left-3 top-3 z-50 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-on-brand"
        >
          {t('saltarAlContenido')}
        </a>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  )
}
