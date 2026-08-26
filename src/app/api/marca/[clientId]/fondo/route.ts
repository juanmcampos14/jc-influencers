import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/current'
import { statusOf } from '@/lib/authz/errors'
import { readFondo } from '@/lib/repos/brand'

/**
 * Sirve la imagen de fondo de un cliente.
 *
 * Pasa por la aplicación en vez de exponer el bucket: el archivo sólo se
 * entrega a quien tiene ese cliente en su alcance. Que la imagen venga del
 * sitio público de la marca no la vuelve pública acá adentro: saber QUÉ marca
 * es cliente de la agencia ya es información.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const ctx = await getAuthContext()
  if (!ctx) return new NextResponse(null, { status: 401 })

  const { clientId } = await params
  try {
    const fondo = await readFondo(ctx, clientId)
    if (!fondo) return new NextResponse(null, { status: 404 })
    return new NextResponse(new Uint8Array(fondo.data), {
      status: 200,
      headers: {
        'Content-Type': fondo.contentType,
        'Content-Length': String(fondo.data.byteLength),
        // Privado: es de un cliente, no puede quedar en una caché compartida.
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    })
  } catch (error) {
    return new NextResponse(null, { status: statusOf(error) === 500 ? 500 : 404 })
  }
}
