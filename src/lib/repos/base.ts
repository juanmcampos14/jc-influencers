import type { AuthContext } from '@/lib/authz/context'
import { withScope, type Tx } from '@/lib/db/scope'

export type { Tx }
import { ConflictError } from '@/lib/authz/errors'

/** Abre una transacción con el alcance del usuario. Punto único de entrada a datos. */
export function scoped<T>(ctx: AuthContext, fn: (tx: Tx) => Promise<T>, timeoutMs?: number): Promise<T> {
  return withScope(ctx.db, fn, timeoutMs ? { timeoutMs } : undefined)
}

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export type Pagination = { page: number; pageSize: number }
export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number; pageCount: number }

export function normalizePagination(input: Partial<Pagination> | undefined): Pagination {
  const page = Math.max(1, Math.floor(input?.page ?? 1))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(input?.pageSize ?? DEFAULT_PAGE_SIZE)))
  return { page, pageSize }
}

export function paginate<T>(items: T[], total: number, pagination: Pagination): Paginated<T> {
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
  }
}

export const skipTake = (pagination: Pagination) => ({
  skip: (pagination.page - 1) * pagination.pageSize,
  take: pagination.pageSize,
})

/** Traduce un update con `version` que no afectó filas a un conflicto de edición. */
export function assertUpdated(count: number): void {
  if (count === 0) throw new ConflictError()
}

/** Metadatos del actor para auditoría. */
export function actorOf(ctx: AuthContext) {
  return {
    userId: ctx.user.id,
    email: ctx.user.email,
    role: ctx.agencyRole ?? ctx.clients.find((c) => c.id === ctx.activeClientId)?.role ?? null,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    correlationId: ctx.correlationId,
  }
}
