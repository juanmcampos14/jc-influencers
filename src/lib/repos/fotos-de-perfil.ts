import 'server-only'
import { withSystemScope } from '@/lib/db/scope'
import { fileStorage } from '@/lib/ports/storage'
import { safeFetch } from '@/lib/ports/safe-fetch'

/**
 * Guarda las fotos de perfil que devuelve un proveedor.
 *
 * Existe porque la URL que devuelven no sirve para guardar: la de
 * influencers.club **caduca a las 24 horas** y vive en un dominio suyo que
 * nuestro CSP no deja cargar. Guardarla era guardar un enlace muerto que
 * además ensuciaba la consola con errores.
 *
 * Así que se baja la imagen mientras el enlace todavía vive --al terminar la
 * búsqueda, que es el único momento garantizado-- y se guarda como cualquier
 * otro archivo nuestro. Después la sirve la aplicación, desde nuestro origen.
 *
 * Va **fuera de la transacción** que registra la corrida. Bajar treinta
 * imágenes puede tardar segundos, y sostener una transacción abierta ese rato
 * traba filas que otros necesitan. Si falla, no pasa nada: el avatar cae a las
 * iniciales, que es lo que hacía antes.
 */

/** Una foto de perfil no pesa más que esto. Lo que se pase, se descarta. */
const MAX_BYTES = 512 * 1024

const TIPOS = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

/**
 * Baja y guarda las fotos que falten.
 *
 * Sólo mira los perfiles que tienen URL y todavía no tienen imagen guardada:
 * una búsqueda que vuelve a traer a alguien conocido no la baja de nuevo.
 *
 * Devuelve cuántas guardó. Nunca lanza: es una mejora, no un requisito.
 */
export async function guardarFotosPendientes(urlsNormalizadas: string[]): Promise<number> {
  if (urlsNormalizadas.length === 0) return 0

  const pendientes = await withSystemScope((tx) =>
    tx.discoveredProfile.findMany({
      where: {
        urlNormalized: { in: urlsNormalizadas },
        profileImageKey: null,
        profileImageUrl: { not: null },
      },
      select: { id: true, handle: true, profileImageUrl: true },
      take: 200,
    }),
  )

  const almacen = fileStorage()
  let guardadas = 0
  let ultimoError: unknown = null

  for (const perfil of pendientes) {
    try {
      const respuesta = await safeFetch(perfil.profileImageUrl!, { maxBytes: MAX_BYTES, timeoutMs: 10_000 })
      /*
       * Una imagen cortada por el tope es un archivo roto: se ve como media
       * foto o directamente no carga. Mejor ninguna que una a medias.
       */
      if (respuesta.status !== 200 || respuesta.truncated || respuesta.body.byteLength === 0) continue

      const contentType = respuesta.contentType.split(';')[0]?.trim().toLowerCase() ?? ''
      const extension = TIPOS.get(contentType)
      /*
       * Sólo imágenes conocidas. Si el proveedor devuelve otra cosa --una
       * página de error, por ejemplo-- se descarta en vez de guardarse: un
       * archivo que el navegador no sabe mostrar es peor que no tener foto.
       */
      if (!extension) continue

      const archivo = await almacen.put({
        filename: `${perfil.handle ?? 'perfil'}.${extension}`,
        contentType,
        data: respuesta.body,
        prefix: 'descubiertos',
        /* Sin cliente: la base de descubiertos es de la agencia, no de nadie. */
        clientId: null,
      })

      await withSystemScope((tx) =>
        tx.discoveredProfile.update({ where: { id: perfil.id }, data: { profileImageKey: archivo.key } }),
      )
      guardadas += 1
    } catch (error) {
      // Una foto que no se pudo bajar no arruina la búsqueda. Se sigue.
      ultimoError = error
    }
  }

  /*
   * Que fallen algunas es normal --un enlace vencido, una imagen rara--. Que
   * fallen TODAS no lo es: significa que algo de fondo está roto, y hay que
   * poder verlo.
   *
   * Pasó de verdad: la política de la base rechazaba guardar un archivo sin
   * cliente y las cinco fotos se perdían calladas, porque el `catch` de cada
   * una se tragaba el mismo error sistémico cinco veces.
   */
  if (guardadas === 0 && pendientes.length > 0 && ultimoError) {
    console.warn(
      `[fotos-de-perfil] no se pudo guardar ninguna de ${pendientes.length}:`,
      ultimoError instanceof Error ? ultimoError.message : ultimoError,
    )
  }

  return guardadas
}

/** La foto guardada de un perfil, para servirla. */
export async function leerFotoDePerfil(
  perfilId: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const perfil = await withSystemScope((tx) =>
    tx.discoveredProfile.findUnique({ where: { id: perfilId }, select: { profileImageKey: true } }),
  )
  if (!perfil?.profileImageKey) return null

  const blob = await withSystemScope((tx) =>
    tx.storedBlob.findUnique({
      where: { key: perfil.profileImageKey! },
      select: { data: true, contentType: true },
    }),
  )
  if (!blob) return null
  return { data: Buffer.from(blob.data), contentType: blob.contentType }
}
