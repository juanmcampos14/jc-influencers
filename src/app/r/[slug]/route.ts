import { NextResponse } from 'next/server'
import { registrarClic } from '@/lib/repos/links'

export const dynamic = 'force-dynamic'

/**
 * El link que publica el influencer.
 *
 * Es la ÚNICA ruta pública que escribe en la base, así que hace lo mínimo:
 * busca un slug, anota un clic y redirige. No lee sesión, no acepta parámetros
 * y no devuelve nada del contenido de la campaña -- un slug ajeno no filtra ni
 * de qué marca es.
 *
 * Un slug que no existe o que está archivado va a la portada, no a un 404 con
 * cartel: si alguien barre slugs al azar, la respuesta no le dice cuáles
 * existen. Y para la persona que llegó desde un posteo viejo, la portada es
 * mejor destino que un error.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // Un slug tiene forma conocida: cualquier otra cosa ni se consulta.
  if (!/^[a-z2-9]{4,16}$/.test(slug)) {
    return NextResponse.redirect(new URL('/', request.url), 302)
  }

  const headers = request.headers
  const destino = await registrarClic({
    slug,
    ip: (headers.get('x-forwarded-for') ?? headers.get('x-real-ip'))?.split(',')[0]?.trim() ?? null,
    userAgent: headers.get('user-agent'),
    referer: headers.get('referer'),
    // Vercel resuelve el país en el borde; si no está, queda sin dato.
    country: headers.get('x-vercel-ip-country'),
  }).catch(() => null)

  if (!destino) return NextResponse.redirect(new URL('/', request.url), 302)

  /*
   * 302 y no 301: un permanente lo cachea el navegador para siempre, y a partir
   * de ahí los clics siguientes de esa persona no pasan más por acá. Se perdería
   * justamente lo que vinimos a medir.
   */
  const respuesta = NextResponse.redirect(destino, 302)
  respuesta.headers.set('Cache-Control', 'no-store')
  // El sitio del cliente no tiene por qué enterarse de la URL del link medido.
  respuesta.headers.set('Referrer-Policy', 'no-referrer')
  return respuesta
}
