import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/current'
import { leerFotoDePerfil } from '@/lib/repos/fotos-de-perfil'

/**
 * Sirve la foto guardada de un perfil descubierto.
 *
 * Pasa por la aplicación en vez de enlazar al proveedor: su URL caduca a las 24
 * horas y además nuestro CSP no deja cargar imágenes de otros dominios. Desde
 * acá es una imagen de nuestro origen, que no caduca.
 *
 * La base de descubiertos es de la agencia: un usuario de cliente no la ve.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ perfilId: string }> }) {
  const ctx = await getAuthContext()
  if (!ctx) return new NextResponse(null, { status: 401 })
  // Para un usuario de cliente esta base directamente no existe.
  if (ctx.side !== 'AGENCY') return new NextResponse(null, { status: 404 })

  const { perfilId } = await params
  try {
    const foto = await leerFotoDePerfil(perfilId)
    if (!foto) return new NextResponse(null, { status: 404 })
    return new NextResponse(new Uint8Array(foto.data), {
      status: 200,
      headers: {
        'Content-Type': foto.contentType,
        'Content-Length': String(foto.data.byteLength),
        /*
         * Privada y por un rato largo: la foto de un perfil no cambia seguido,
         * y es de la agencia, así que no puede quedar en una caché compartida.
         */
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
