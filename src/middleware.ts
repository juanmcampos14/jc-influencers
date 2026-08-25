import { NextResponse, type NextRequest } from 'next/server'
import { contentSecurityPolicy } from '@/lib/security/csp'

/**
 * Genera el nonce de cada respuesta y lo deja donde Next lo busca.
 *
 * Next lee la cabecera `content-security-policy` del *pedido*, extrae el nonce
 * y lo pone en los scripts que inserta en el HTML. Por eso hay que reenviar el
 * pedido con esa cabecera, además de responder con ella.
 */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID())
  const csp = contentSecurityPolicy(nonce)

  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  headers.set('content-security-policy', csp)

  const response = NextResponse.next({ request: { headers } })
  response.headers.set('content-security-policy', csp)
  return response
}

export const config = {
  // Los archivos estáticos no tienen HTML que hidratar y se sirven miles de
  // veces: su política la pone next.config, sin pasar por acá.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
