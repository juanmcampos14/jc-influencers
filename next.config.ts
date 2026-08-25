import type { NextConfig } from 'next'

const isProd = process.env.NODE_ENV === 'production'

/** Cabeceras de seguridad aplicadas a todas las respuestas. */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next inyecta estilos inline en RSC; los scripts inline usan nonce en producción vía middleware.
      "style-src 'self' 'unsafe-inline'",
      isProd ? "script-src 'self'" : "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['exceljs', '@prisma/client'],
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
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

export default nextConfig
