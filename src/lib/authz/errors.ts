/**
 * Errores de autorización.
 *
 * Regla: si el recurso existe pero está fuera del alcance del usuario se
 * responde 404 (`NotFoundError`), no 403, para no revelar su existencia.
 * 403 (`ForbiddenError`) se reserva para recursos que el usuario SÍ puede ver
 * pero sobre los que no tiene la capacidad para la acción pedida.
 */
export class NotFoundError extends Error {
  readonly status = 404
  readonly code = 'NOT_FOUND'
  constructor(message = 'No encontrado') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ForbiddenError extends Error {
  readonly status = 403
  readonly code = 'FORBIDDEN'
  constructor(message = 'No tenés permiso para hacer esto') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class UnauthenticatedError extends Error {
  readonly status = 401
  readonly code = 'UNAUTHENTICATED'
  constructor(message = 'Necesitás iniciar sesión') {
    super(message)
    this.name = 'UnauthenticatedError'
  }
}

export class ValidationError extends Error {
  readonly status = 422
  readonly code = 'VALIDATION'
  readonly fieldErrors: Record<string, string[]>
  constructor(message = 'Datos inválidos', fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ValidationError'
    this.fieldErrors = fieldErrors
  }
}

export class ConflictError extends Error {
  readonly status = 409
  readonly code = 'CONFLICT'
  constructor(message = 'El registro cambió mientras lo editabas. Recargá y volvé a intentar.') {
    super(message)
    this.name = 'ConflictError'
  }
}

export class RateLimitError extends Error {
  readonly status = 429
  readonly code = 'RATE_LIMITED'
  readonly retryAfterSeconds: number
  constructor(retryAfterSeconds: number, message = 'Demasiados intentos. Probá de nuevo en un rato.') {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
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
