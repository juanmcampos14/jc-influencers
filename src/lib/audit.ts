import type { Tx } from '@/lib/db/scope'

export type AuditActor = {
  userId?: string | null
  email?: string | null
  role?: string | null
  ip?: string | null
  userAgent?: string | null
  correlationId?: string | null
}

export type AuditInput = {
  action: string
  entityType: string
  entityId?: string | null
  clientId?: string | null
  before?: unknown
  after?: unknown
  metadata?: Record<string, unknown>
}

/** Campos que nunca se copian al log de auditoría. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'plainPassword',
  'token',
  'tokenHash',
  'csrf',
  'secret',
  'contactEmail',
  'contactPhone',
])

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (depth > 6) return '[…]'
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1))
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key) ? '[redactado]' : redact(raw, depth + 1)
    }
    return out
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`
  if (typeof value === 'bigint') return value.toString()
  return value
}

/**
 * Escribe un evento de auditoría. La tabla es inmutable: el rol de aplicación
 * tiene INSERT y SELECT, pero no UPDATE ni DELETE (ver migración RLS).
 */
export async function recordAudit(tx: Tx, actor: AuditActor, input: AuditInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      clientId: input.clientId ?? null,
      actorUserId: actor.userId ?? null,
      actorEmail: actor.email ?? null,
      actorRole: actor.role ?? null,
      ip: actor.ip ?? null,
      userAgent: actor.userAgent?.slice(0, 500) ?? null,
      correlationId: actor.correlationId ?? null,
      before: input.before === undefined ? undefined : (redact(input.before) as never),
      after: input.after === undefined ? undefined : (redact(input.after) as never),
      metadata: input.metadata === undefined ? undefined : (redact(input.metadata) as never),
    },
  })
}

/** Acciones auditadas, como constantes para no escribir strings sueltos. */
export const AUDIT = {
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILURE: 'auth.login.failure',
  LOGOUT: 'auth.logout',
  PASSWORD_RESET_REQUEST: 'auth.password_reset.request',
  PASSWORD_RESET_COMPLETE: 'auth.password_reset.complete',
  PASSWORD_CHANGED: 'auth.password.changed',
  SESSION_REVOKED: 'auth.session.revoked',
  INVITATION_CREATED: 'invitation.created',
  INVITATION_ACCEPTED: 'invitation.accepted',
  INVITATION_REVOKED: 'invitation.revoked',
  USER_DISABLED: 'user.disabled',
  USER_ENABLED: 'user.enabled',
  MEMBERSHIP_CHANGED: 'membership.changed',
  MEMBERSHIP_REMOVED: 'membership.removed',
  CLIENT_CREATED: 'client.created',
  CLIENT_UPDATED: 'client.updated',
  CLIENT_PREVIEW_ENTERED: 'client.preview.entered',
  CLIENT_PREVIEW_LEFT: 'client.preview.left',
  CAMPAIGN_CREATED: 'campaign.created',
  CAMPAIGN_UPDATED: 'campaign.updated',
  CAMPAIGN_ARCHIVED: 'campaign.archived',
  CAMPAIGN_RESTORED: 'campaign.restored',
  CAMPAIGN_DELETED: 'campaign.deleted',
  GOAL_SAVED: 'campaign.goal.saved',
  GOAL_DELETED: 'campaign.goal.deleted',
  FINANCE_UPDATED: 'campaign.finance.updated',
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_UPDATED: 'payment.updated',
  PAYMENT_DELETED: 'payment.deleted',
  LINK_CREATED: 'link.created',
  LINK_ARCHIVED: 'link.archived',
  DELIVERABLE_SAVED: 'deliverable.saved',
  BRIEF_UPDATED: 'brief.updated',
  BUDGET_CHANGED: 'budget.changed',
  CANDIDACY_CREATED: 'candidacy.created',
  CANDIDACY_UPDATED: 'candidacy.updated',
  CANDIDACY_STATUS_CHANGED: 'candidacy.status.changed',
  CANDIDACY_APPROVAL: 'candidacy.approval',
  CANDIDACY_VISIBILITY: 'candidacy.visibility',
  SHORTLIST_CHANGED: 'candidacy.shortlist.changed',
  INFLUENCER_CREATED: 'influencer.created',
  INFLUENCER_UPDATED: 'influencer.updated',
  INFLUENCER_MERGED: 'influencer.merged',
  INFLUENCER_DELETED: 'influencer.deleted',
  COMMENT_CREATED: 'comment.created',
  IMPORT_PREVIEW: 'import.preview',
  IMPORT_CONFIRMED: 'import.confirmed',
  IMPORT_CANCELLED: 'import.cancelled',
  EXPORT_CREATED: 'export.created',
  BRAND_EXTRACTED: 'brand.extracted',
  BRAND_UPDATED: 'brand.updated',
  BRAND_RESET: 'brand.reset',
  BRAND_MURAL_DRAWN: 'brand.mural.drawn',
  BRAND_MURAL_REMOVED: 'brand.mural.removed',
  SCOUTING_PREVIEW: 'scouting.preview',
  SCOUTING_RUN: 'scouting.run',
  SCOUTING_IMPORTED: 'scouting.imported',
  SCOUTING_BUDGET_CHANGED: 'scouting.budget.changed',
  AI_INSIGHT_CREATED: 'ai.insight.created',
  AI_INSIGHT_SHARED: 'ai.insight.shared',
  ADMIN_ACCESS: 'admin.exceptional_access',
} as const
