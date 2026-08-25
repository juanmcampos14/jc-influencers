import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'JC Influencers', template: '%s · JC Influencers' },
  description: 'Plataforma de gestión de campañas de marketing de influencers.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="min-h-screen antialiased">
        <a
          href="#contenido"
          className="sr-only-focusable absolute left-3 top-3 z-50 rounded-md bg-brand-600 px-3 py-2 text-sm text-white"
        >
          Saltar al contenido
        </a>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  )
}
