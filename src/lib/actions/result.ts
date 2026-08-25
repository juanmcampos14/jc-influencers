import { z } from 'zod'
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
}
export type ActionResult<T> = ActionOk<T> | ActionFail

export const ok = <T>(data: T): ActionOk<T> => ({ ok: true, data })

/**
 * Traduce cualquier error a una respuesta segura para el navegador.
 * Nunca devuelve stack traces ni detalles internos.
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
    return { ok: false, code: 'VALIDATION', message: 'Revisá los datos ingresados.', fieldErrors }
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
  return { ok: false, code: 'ERROR', message: 'Ocurrió un error inesperado. Volvé a intentar.' }
}
