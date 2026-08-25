/**
 * Política de seguridad de contenido.
 *
 * Los scripts de arranque que Next inserta en el HTML son inline. Prohibirlos
 * sin más deja la aplicación sin hidratar: el servidor manda el HTML pero
 * React nunca arranca y la pantalla queda vacía. La salida fácil sería
 * habilitar 'unsafe-inline', que es exactamente lo que un XSS necesita.
 *
 * En su lugar cada respuesta lleva un nonce distinto, generado en el
 * middleware. Next lo lee de la cabecera del pedido y lo copia en sus propios
 * scripts, así que sólo se ejecuta lo que salió de nuestro servidor.
 */

const BASE = [
  "default-src 'self'",
  // Los estilos inline vienen del propio Next y de las variables de tema de
  // cada cliente. Google Fonts sirve las tipografías de marca.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
]

/**
 * @param nonce Valor único de esta respuesta. Sin él (recursos estáticos) se
 * cae a `'self'`, que alcanza porque ahí no hay HTML que hidratar.
 */
export function contentSecurityPolicy(nonce?: string): string {
  const isProd = process.env.NODE_ENV === 'production'
  const script = isProd
    ? nonce
      ? // 'strict-dynamic' deja que los scripts con nonce carguen sus propios
        // chunks; los navegadores que no lo entienden caen a 'self'.
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : "script-src 'self'"
    : // En desarrollo el refresco en caliente evalúa código en el navegador.
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
  return [...BASE, script].join('; ')
}

/** Cabeceras que no dependen del pedido. */
export const STATIC_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
]
