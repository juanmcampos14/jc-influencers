import type { Frase } from '@/lib/domain/frase'
import { enCastellano } from '@/lib/i18n/castellano'

/**
 * Errores de autorización.
 *
 * Regla: si el recurso existe pero está fuera del alcance del usuario se
 * responde 404 (`NotFoundError`), no 403, para no revelar su existencia.
 * 403 (`ForbiddenError`) se reserva para recursos que el usuario SÍ puede ver
 * pero sobre los que no tiene la capacidad para la acción pedida.
 *
 * Cada error viaja con su FRASE --clave y valores-- además del mensaje. El
 * mensaje queda en castellano porque es lo que se lee en un log del servidor;
 * la frase es lo que `fail()` escribe en el idioma de quien hizo el pedido.
 * Antes el texto estaba escrito en cada `throw` y llegaba tal cual a una
 * pantalla en inglés.
 */

const castellano = enCastellano('errores')

/** El mensaje para el log: la frase escrita en castellano. */
const escribir = (detalle: Frase | string): string =>
  typeof detalle === 'string' ? detalle : castellano(detalle.clave, detalle.valores)

const fraseDe = (detalle: Frase | string): Frase | null =>
  typeof detalle === 'string' ? null : detalle

/** Un error que sabe decirse en cualquier idioma. */
export type ErrorConFrase = Error & { readonly frase: Frase | null }

export const fraseDelError = (error: unknown): Frase | null =>
  error instanceof Error && 'frase' in error ? ((error as ErrorConFrase).frase ?? null) : null
export class NotFoundError extends Error {
  readonly status = 404
  readonly code = 'NOT_FOUND'
  readonly frase: Frase | null
  constructor(detalle: Frase | string = { clave: 'noEncontrado' }) {
    super(escribir(detalle))
    this.name = 'NotFoundError'
    this.frase = fraseDe(detalle)
  }
}

export class ForbiddenError extends Error {
  readonly status = 403
  readonly code = 'FORBIDDEN'
  readonly frase: Frase | null
  constructor(detalle: Frase | string = { clave: 'sinPermiso' }) {
    super(escribir(detalle))
    this.name = 'ForbiddenError'
    this.frase = fraseDe(detalle)
  }
}

export class UnauthenticatedError extends Error {
  readonly status = 401
  readonly code = 'UNAUTHENTICATED'
  readonly frase: Frase | null
  constructor(detalle: Frase | string = { clave: 'necesitasIngresar' }) {
    super(escribir(detalle))
    this.name = 'UnauthenticatedError'
    this.frase = fraseDe(detalle)
  }
}

export class ValidationError extends Error {
  readonly status = 422
  readonly code = 'VALIDATION'
  readonly fieldErrors: Record<string, string[]>
  readonly frase: Frase | null
  constructor(detalle: Frase | string = { clave: 'datosInvalidos' }, fieldErrors: Record<string, string[]> = {}) {
    super(escribir(detalle))
    this.name = 'ValidationError'
    this.fieldErrors = fieldErrors
    this.frase = fraseDe(detalle)
  }
}

export class ConflictError extends Error {
  readonly status = 409
  readonly code = 'CONFLICT'
  readonly frase: Frase | null
  constructor(detalle: Frase | string = { clave: 'registroCambiado' }) {
    super(escribir(detalle))
    this.name = 'ConflictError'
    this.frase = fraseDe(detalle)
  }
}

export class RateLimitError extends Error {
  readonly status = 429
  readonly code = 'RATE_LIMITED'
  readonly retryAfterSeconds: number
  readonly frase: Frase | null
  constructor(retryAfterSeconds: number, detalle: Frase | string = { clave: 'demasiadosIntentos' }) {
    super(escribir(detalle))
    this.name = 'RateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
    this.frase = fraseDe(detalle)
  }
}

export function statusOf(error: unknown): number {
  if (
    error instanceof NotFoundError ||
    error instanceof ForbiddenError ||
    error instanceof UnauthenticatedError ||
    error instanceof ValidationError ||
    error instanceof ConflictError ||
    error instanceof RateLimitError
  ) {
    return error.status
  }
  return 500
}
