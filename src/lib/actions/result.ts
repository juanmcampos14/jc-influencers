import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { fraseDelError } from '@/lib/authz/errors'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthenticatedError,
  ValidationError,
} from '@/lib/authz/errors'

export type ActionOk<T> = { ok: true; data: T }
export type ActionFail = {
  ok: false
  code: 'VALIDATION' | 'FORBIDDEN' | 'NOT_FOUND' | 'UNAUTHENTICATED' | 'CONFLICT' | 'RATE_LIMITED' | 'ERROR'
  message: string
  fieldErrors?: Record<string, string[]>
  retryAfterSeconds?: number
  /**
   * Si `message` es una clave de traducción y no una frase.
   *
   * Lo usa `traducirFalla` y nunca llega a la pantalla: para cuando el
   * resultado sale del servidor, `message` ya está escrito.
   */
  esClave?: boolean
}
export type ActionResult<T> = ActionOk<T> | ActionFail

export const ok = <T>(data: T): ActionOk<T> => ({ ok: true, data })

/**
 * El mensaje de un error, en el idioma del pedido.
 *
 * `fail` no puede ser `async` --la firma la usan cien acciones-- así que la
 * versión traducida la arma `falla`, que sí lo es. Cuando no hay frase (un
 * error de biblioteca, por ejemplo) queda el mensaje tal cual.
 */
export async function traducirFalla(falla: ActionFail, error: unknown): Promise<ActionFail> {
  const frase = fraseDelError(error)
  const hayCampos = falla.fieldErrors && Object.keys(falla.fieldErrors).length > 0
  if (!frase && !falla.esClave && !hayCampos) return falla

  const t = await getTranslations('errores')
  /*
   * Una clave que no está en las traducciones se devuelve tal cual: puede ser
   * el mensaje de una biblioteca. Un `t()` a ciegas devolvería el nombre de la
   * clave, que es peor que una frase en el otro idioma.
   */
  const escribir = (clave: string, valores?: Record<string, string | number>): string =>
    t.has(clave as never) ? t(clave as never, valores as never) : clave

  const { esClave, ...resto } = falla
  return {
    ...resto,
    message: frase
      ? escribir(frase.clave, frase.valores)
      : esClave
        ? escribir(falla.message)
        : falla.message,
    /*
     * Los errores por campo son los que se leen debajo del input. Vienen de
     * Zod --donde el mensaje ES la clave-- o escritos a mano en el dominio.
     */
    ...(hayCampos
      ? {
          fieldErrors: Object.fromEntries(
            Object.entries(falla.fieldErrors ?? {}).map(([campo, mensajes]) => [
              campo,
              mensajes.map((mensaje) => escribir(mensaje)),
            ]),
          ),
        }
      : {}),
  }
}

/**
 * Traduce cualquier error a una respuesta segura para el navegador.
 * Nunca devuelve stack traces ni detalles internos.
 *
 * El mensaje sale ya escrito en el idioma de quien hizo el pedido. Se resuelve
 * ACÁ y no en la pantalla porque es el último lugar del servidor por donde
 * pasan todos los errores: así ninguna de las cien llamadas a
 * `toast.error(result.message)` tiene que saber de idiomas, y una pantalla
 * nueva no puede olvidarse de traducir.
 */
export function fail(error: unknown): ActionFail {
  if (error instanceof ValidationError) {
    return { ok: false, code: 'VALIDATION', message: error.message, fieldErrors: error.fieldErrors }
  }
  if (error instanceof z.ZodError) {
    const fieldErrors: Record<string, string[]> = {}
    for (const issue of error.issues) {
      const key = issue.path.join('.') || '_'
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message]
    }
    return { ok: false, code: 'VALIDATION', message: 'revisaLosDatos', fieldErrors, esClave: true }
  }
  if (error instanceof ForbiddenError) return { ok: false, code: 'FORBIDDEN', message: error.message }
  if (error instanceof NotFoundError) return { ok: false, code: 'NOT_FOUND', message: error.message }
  if (error instanceof UnauthenticatedError) return { ok: false, code: 'UNAUTHENTICATED', message: error.message }
  if (error instanceof ConflictError) return { ok: false, code: 'CONFLICT', message: error.message }
  if (error instanceof RateLimitError) {
    return { ok: false, code: 'RATE_LIMITED', message: error.message, retryAfterSeconds: error.retryAfterSeconds }
  }
  // Errores no previstos: se registran en el servidor, no se filtran al cliente.
  console.error('[action] error no manejado', error)
  return { ok: false, code: 'ERROR', message: 'errorInesperado', esClave: true }
}
