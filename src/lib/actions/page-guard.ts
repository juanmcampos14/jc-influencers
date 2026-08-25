import { notFound } from 'next/navigation'
import { ForbiddenError, NotFoundError, UnauthenticatedError } from '@/lib/authz/errors'

export class PageForbidden extends Error {
  constructor() {
    super('forbidden')
    this.name = 'PageForbidden'
  }
}

/**
 * Convierte los errores de autorización en respuestas de página.
 *
 * Fuera de alcance → 404, para no revelar que el recurso existe.
 * Dentro de alcance pero sin la capacidad → pantalla de "sin permiso".
 */
export function handleAccessError(error: unknown): never {
  if (error instanceof NotFoundError || error instanceof UnauthenticatedError) notFound()
  if (error instanceof ForbiddenError) throw new PageForbidden()
  throw error
}

/** Ejecuta una carga de datos de página traduciendo los errores de acceso. */
export async function loadPage<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader()
  } catch (error) {
    handleAccessError(error)
  }
}
