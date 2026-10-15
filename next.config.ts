import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { STATIC_SECURITY_HEADERS } from './src/lib/security/csp'

const isProd = process.env.NODE_ENV === 'production'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['exceljs', '@prisma/client'],
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
  },
  async headers() {
    return [
      // La política de contenido no está acá: depende del nonce de cada
      // respuesta y la pone el middleware. Dos cabeceras CSP se intersectan,
      // así que declararla en los dos lados anularía el nonce.
      { source: '/:path*', headers: STATIC_SECURITY_HEADERS },
      ...(isProd
        ? [
            {
              source: '/:path*',
              headers: [
                { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
              ],
            },
          ]
        : []),
    ]
  },
}

/*
 * El idioma no va en la URL: esta aplicación vive detrás de un login y no hay
 * nada que indexar. Ver `src/i18n/idiomas.ts`.
 */
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)