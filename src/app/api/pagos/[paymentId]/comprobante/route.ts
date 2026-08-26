import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/current'
import { statusOf } from '@/lib/authz/errors'
import { leerComprobante } from '@/lib/repos/pagos'

/**
 * Sirve la factura o el comprobante de un movimiento de plata.
 *
 * Pasa por la aplicación y no por el bucket: el archivo se entrega sólo a quien
 * tiene ese cliente en su alcance Y puede ver presupuestos. Una factura dice
 * cuánto cobra la agencia.
 *
 * Se manda siempre como descarga (`attachment`) y como flujo de bytes, con
 * `sandbox` y sin scripts: un PDF o un HTML subido por alguien no se abre en
 * nuestro origen, donde tendría acceso a la sesión.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const ctx = await getAuthContext()
  if (!ctx) return new NextResponse(null, { status: 401 })

  const { paymentId } = await params
  try {
    const archivo = await leerComprobante(ctx, paymentId)
    // El nombre viaja escapado: un archivo llamado con comillas partiría la cabecera.
    const nombre = encodeURIComponent(archivo.filename)
    return new NextResponse(new Uint8Array(archivo.data), {
      status: 200,
      headers: {
        'Content-Type': archivo.contentType,
        'Content-Length': String(archivo.data.byteLength),
        'Content-Disposition': `attachment; filename*=UTF-8''${nombre}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
  } catch (error) {
    return new NextResponse(null, { status: statusOf(error) === 500 ? 500 : 404 })
  }
}
