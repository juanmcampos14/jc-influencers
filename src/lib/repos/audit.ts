import 'server-only'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { normalizePagination, paginate, scoped, skipTake, type Paginated } from './base'

export type AuditRow = {
  id: string
  occurredAt: string
  actorEmail: string | null
  actorRole: string | null
  action: string
  entityType: string
  entityId: string | null
  clientId: string | null
  ip: string | null
  correlationId: string | null
  before: unknown
  after: unknown
  metadata: unknown
}

export type AuditFilters = {
  clientId?: string | null
  action?: string | null
  entityType?: string | null
  entityId?: string | null
  actorUserId?: string | null
  from?: Date | null
  to?: Date | null
}

export async function listAudit(
  ctx: AuthContext,
  filters: AuditFilters = {},
  pageInput?: { page?: number; pageSize?: number },
): Promise<Paginated<AuditRow>> {
  if (filters.clientId) assertClientInScope(ctx, filters.clientId)
  assertCan(ctx, 'audit.view', filters.clientId ?? null)

  const pagination = normalizePagination(pageInput)
  const where = {
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.action ? { action: { contains: filters.action, mode: 'insensitive' as const } } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
    ...(filters.from || filters.to
      ? { occurredAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
  }

  return scoped(ctx, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.auditLog.findMany({ where, orderBy: { occurredAt: 'desc' }, ...skipTake(pagination) }),
      tx.auditLog.count({ where }),
    ])
    return paginate(
      rows.map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        actorEmail: row.actorEmail,
        actorRole: row.actorRole,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        clientId: row.clientId,
        ip: row.ip,
        correlationId: row.correlationId,
        before: row.before,
        after: row.after,
        metadata: row.metadata,
      })),
      total,
      pagination,
    )
  })
}
