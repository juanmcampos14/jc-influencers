import 'server-only'
import type { AgencyRole, ClientRole } from '@/generated/prisma/enums'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope, capabilitiesFor } from '@/lib/authz/context'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import { createInvitation, revokeInvitation } from '@/lib/auth/flows'
import { revokeAllSessionsForUser } from '@/lib/auth/session'
import { normalizeEmail } from '@/lib/auth/tokens'
import {
  CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE,
  GRANTABLE_AGENCY_EXTRAS,
  GRANTABLE_CLIENT_EXTRAS,
  isCapability,
} from '@/lib/authz/capabilities'
import { actorOf, scoped } from './base'

export type UserRow = {
  id: string
  email: string
  name: string
  status: string
  lastLoginAt: string | null
  agencyRole: AgencyRole | null
  agencyExtras: string[]
  clients: Array<{ clientId: string; clientName: string; role: ClientRole; extras: string[] }>
  agencyClients: Array<{ clientId: string; clientName: string }>
}

export type InvitationRow = {
  id: string
  email: string
  name: string
  status: string
  agencyRole: AgencyRole | null
  clientRole: ClientRole | null
  clientName: string | null
  expiresAt: string
  createdAt: string
}

/** Lista de usuarios. La agencia ve los suyos y los de sus clientes; el cliente sólo los propios. */
export async function listUsers(ctx: AuthContext, clientId?: string | null): Promise<UserRow[]> {
  if (clientId) assertClientInScope(ctx, clientId)
  const scopeClient = clientId ?? (ctx.side === 'CLIENT' ? ctx.activeClientId : null)
  assertCan(ctx, ctx.side === 'CLIENT' ? 'membership.manage' : 'client.view', scopeClient)

  return scoped(ctx, async (tx) => {
    const rows = await tx.user.findMany({
      where: scopeClient ? { clientMemberships: { some: { clientId: scopeClient } } } : {},
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: {
        agencyMembership: true,
        clientMemberships: { include: { client: { select: { id: true, name: true } } } },
        agencyClientAssignments: { include: { client: { select: { id: true, name: true } } } },
      },
      take: 500,
    })
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      status: row.status,
      lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
      agencyRole: row.agencyMembership?.role ?? null,
      agencyExtras: row.agencyMembership?.extraCapabilities ?? [],
      clients: row.clientMemberships.map((m) => ({
        clientId: m.client.id,
        clientName: m.client.name,
        role: m.role,
        extras: m.extraCapabilities,
      })),
      agencyClients: row.agencyClientAssignments.map((a) => ({ clientId: a.client.id, clientName: a.client.name })),
    }))
  })
}

export async function listInvitations(ctx: AuthContext, clientId?: string | null): Promise<InvitationRow[]> {
  if (clientId) assertClientInScope(ctx, clientId)
  const scopeClient = clientId ?? (ctx.side === 'CLIENT' ? ctx.activeClientId : null)
  assertCan(ctx, 'user.invite', scopeClient)

  return scoped(ctx, async (tx) => {
    const rows = await tx.invitation.findMany({
      where: scopeClient ? { clientId: scopeClient } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { client: { select: { name: true } } },
    })
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      status: row.status,
      agencyRole: row.agencyRole,
      clientRole: row.clientRole,
      clientName: row.client?.name ?? null,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }))
  })
}

export type InviteInput = {
  email: string
  name: string
  kind: 'AGENCY' | 'CLIENT'
  agencyRole?: AgencyRole
  clientId?: string
  clientRole?: ClientRole
  extraCapabilities?: string[]
  agencyClientIds?: string[]
}

/**
 * Invita a una persona. Un administrador de cliente sólo puede invitar a su
 * propio tenant y con roles de cliente: no puede otorgarse permisos de agencia.
 */
export async function inviteUser(ctx: AuthContext, input: InviteInput): Promise<{ id: string }> {
  const email = normalizeEmail(input.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ValidationError('El email no es válido.')

  if (input.kind === 'AGENCY') {
    // Sólo la agencia con alcance total invita empleados de agencia.
    if (ctx.side !== 'AGENCY') throw new ForbiddenError('No podés crear usuarios de agencia.')
    assertCan(ctx, 'user.invite', null)
    assertCan(ctx, 'membership.manage', null)
    if (!ctx.allClients) throw new ForbiddenError('Sólo un administrador de agencia puede invitar empleados.')
    if (!input.agencyRole) throw new ValidationError('Elegí el rol de agencia.')
    if (input.agencyRole === 'PLATFORM_SUPERADMIN' && ctx.agencyRole !== 'PLATFORM_SUPERADMIN') {
      throw new ForbiddenError('Sólo un superadministrador puede crear otro superadministrador.')
    }
  } else {
    if (!input.clientId || !input.clientRole) throw new ValidationError('Elegí el cliente y el rol.')
    assertClientInScope(ctx, input.clientId)
    assertCan(ctx, 'user.invite', input.clientId)
    if (ctx.side === 'CLIENT') {
      const access = ctx.clients.find((c) => c.id === input.clientId)
      if (!access?.allowClientUserInvites) throw new ForbiddenError('La agencia no habilitó invitaciones para este cliente.')
    }
  }

  const extras = sanitizeExtras(input.extraCapabilities ?? [], input.kind, ctx)

  const invitation = await createInvitation({
    email,
    name: input.name,
    agencyRole: input.kind === 'AGENCY' ? (input.agencyRole ?? null) : null,
    clientId: input.kind === 'CLIENT' ? (input.clientId ?? null) : null,
    clientRole: input.kind === 'CLIENT' ? (input.clientRole ?? null) : null,
    extraCapabilities: extras,
    createdById: ctx.user.id,
    actor: actorOf(ctx),
  })

  // Alcance por cliente de un empleado de agencia (account manager, scout, finanzas).
  if (input.kind === 'AGENCY' && input.agencyClientIds?.length) {
    await scoped(ctx, async (tx) => {
      const valid = await tx.client.findMany({ where: { id: { in: input.agencyClientIds ?? [] } }, select: { id: true } })
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { extraCapabilities: [...extras, ...valid.map((c) => `__client:${c.id}`)] },
      })
    })
  }

  return { id: invitation.id }
}

function sanitizeExtras(raw: string[], kind: 'AGENCY' | 'CLIENT', ctx: AuthContext): string[] {
  const allowed = kind === 'AGENCY' ? GRANTABLE_AGENCY_EXTRAS : GRANTABLE_CLIENT_EXTRAS
  const grantable = new Set<string>(allowed)
  const own = ctx.side === 'AGENCY' ? ctx.agencyCapabilities : capabilitiesFor(ctx, ctx.activeClientId)
  return raw.filter((cap) => {
    if (!isCapability(cap)) return false
    if (!grantable.has(cap)) return false
    if (kind === 'CLIENT' && CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE.has(cap)) return false
    // Nadie puede otorgar una capacidad que no tiene.
    return own.has(cap)
  })
}

export async function revokeUserInvitation(ctx: AuthContext, invitationId: string): Promise<void> {
  await scoped(ctx, async (tx) => {
    const invitation = await tx.invitation.findUnique({ where: { id: invitationId } })
    if (!invitation) throw new NotFoundError()
    if (invitation.clientId) {
      assertClientInScope(ctx, invitation.clientId)
      assertCan(ctx, 'user.invite', invitation.clientId)
    } else {
      if (ctx.side !== 'AGENCY' || !ctx.allClients) throw new NotFoundError()
      assertCan(ctx, 'user.invite', null)
    }
    await revokeInvitation(tx, invitationId, actorOf(ctx))
  })
}

/** Desactiva un usuario sin borrar su historial y le cierra todas las sesiones. */
export async function setUserStatus(ctx: AuthContext, userId: string, active: boolean): Promise<void> {
  if (ctx.side !== 'AGENCY' || !ctx.allClients) throw new ForbiddenError('Sólo la agencia puede activar o desactivar usuarios.')
  assertCan(ctx, 'membership.manage', null)
  if (userId === ctx.user.id) throw new ValidationError('No podés desactivarte a vos mismo.')

  await scoped(ctx, async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId }, include: { agencyMembership: true } })
    if (!before) throw new NotFoundError()
    if (before.agencyMembership?.role === 'PLATFORM_SUPERADMIN' && ctx.agencyRole !== 'PLATFORM_SUPERADMIN') {
      throw new ForbiddenError('No podés desactivar a un superadministrador.')
    }
    await tx.user.update({
      where: { id: userId },
      data: {
        status: active ? 'ACTIVE' : 'DISABLED',
        disabledAt: active ? null : new Date(),
        disabledById: active ? null : ctx.user.id,
      },
    })
    await recordAudit(tx, actorOf(ctx), {
      action: active ? AUDIT.USER_ENABLED : AUDIT.USER_DISABLED,
      entityType: 'User',
      entityId: userId,
      before: { status: before.status },
      after: { status: active ? 'ACTIVE' : 'DISABLED' },
    })
  })

  if (!active) await revokeAllSessionsForUser(userId, 'disabled_by_admin')
}

export type MembershipChange = {
  userId: string
  agencyRole?: AgencyRole | null
  agencyExtras?: string[]
  agencyClientIds?: string[]
  clientMemberships?: Array<{ clientId: string; role: ClientRole; extras?: string[] }>
}

/** Cambia roles y alcances. Aplica el cerrojo contra escalada de privilegios. */
export async function updateMemberships(ctx: AuthContext, change: MembershipChange): Promise<void> {
  const isAgencyAdmin = ctx.side === 'AGENCY' && ctx.allClients

  if (change.agencyRole !== undefined || change.agencyClientIds !== undefined || change.agencyExtras !== undefined) {
    if (!isAgencyAdmin) throw new ForbiddenError('Sólo un administrador de agencia puede tocar roles internos.')
    assertCan(ctx, 'membership.manage', null)
    if (change.agencyRole === 'PLATFORM_SUPERADMIN' && ctx.agencyRole !== 'PLATFORM_SUPERADMIN') {
      throw new ForbiddenError('Sólo un superadministrador puede otorgar ese rol.')
    }
    if (change.userId === ctx.user.id && change.agencyRole !== undefined && change.agencyRole !== ctx.agencyRole) {
      throw new ValidationError('No podés cambiarte tu propio rol.')
    }
  }

  if (change.clientMemberships) {
    for (const membership of change.clientMemberships) {
      assertClientInScope(ctx, membership.clientId)
      assertCan(ctx, 'membership.manage', membership.clientId)
    }
  }

  await scoped(ctx, async (tx) => {
    const target = await tx.user.findUnique({ where: { id: change.userId }, include: { agencyMembership: true } })
    if (!target) throw new NotFoundError()

    if (change.agencyRole !== undefined) {
      if (change.agencyRole === null) {
        await tx.agencyMembership.deleteMany({ where: { userId: change.userId } })
      } else {
        const extras = sanitizeExtras(change.agencyExtras ?? [], 'AGENCY', ctx)
        await tx.agencyMembership.upsert({
          where: { userId: change.userId },
          create: { userId: change.userId, role: change.agencyRole, extraCapabilities: extras, createdById: ctx.user.id },
          update: { role: change.agencyRole, extraCapabilities: extras },
        })
      }
    }

    if (change.agencyClientIds) {
      const valid = await tx.client.findMany({ where: { id: { in: change.agencyClientIds } }, select: { id: true } })
      await tx.agencyClientAssignment.deleteMany({ where: { userId: change.userId } })
      if (valid.length > 0) {
        await tx.agencyClientAssignment.createMany({
          data: valid.map((c) => ({ userId: change.userId, clientId: c.id, createdById: ctx.user.id })),
        })
      }
    }

    if (change.clientMemberships) {
      for (const membership of change.clientMemberships) {
        const extras = sanitizeExtras(membership.extras ?? [], 'CLIENT', ctx)
        await tx.clientMembership.upsert({
          where: { userId_clientId: { userId: change.userId, clientId: membership.clientId } },
          create: {
            userId: change.userId,
            clientId: membership.clientId,
            role: membership.role,
            extraCapabilities: extras,
            createdById: ctx.user.id,
          },
          update: { role: membership.role, extraCapabilities: extras },
        })
      }
    }

    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.MEMBERSHIP_CHANGED,
      entityType: 'User',
      entityId: change.userId,
      before: { agencyRole: target.agencyMembership?.role ?? null },
      after: { agencyRole: change.agencyRole ?? target.agencyMembership?.role ?? null },
    })
  })

  // Un cambio de rol invalida las sesiones abiertas: el alcance se recalcula al reingresar.
  await revokeAllSessionsForUser(change.userId, 'membership_changed')
}

export async function removeClientMembership(ctx: AuthContext, userId: string, clientId: string): Promise<void> {
  assertClientInScope(ctx, clientId)
  assertCan(ctx, 'membership.manage', clientId)
  await scoped(ctx, async (tx) => {
    const result = await tx.clientMembership.deleteMany({ where: { userId, clientId } })
    if (result.count === 0) throw new NotFoundError()
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.MEMBERSHIP_REMOVED,
      entityType: 'User',
      entityId: userId,
      clientId,
    })
  })
  await revokeAllSessionsForUser(userId, 'membership_removed')
}

/**
 * Cifras de la pantalla de accesos.
 *
 * Se cuentan en la base: las listas están acotadas (500 personas, 200
 * invitaciones) y sumarlas sería un total que deja de serlo justo cuando la
 * agencia crece.
 */
export type ResumenDeAccesos = {
  activas: number
  desactivadas: number
  invitacionesPendientes: number
  /** Invitaciones que se vencen en los próximos 7 días: son las accionables. */
  vencenPronto: number
}

export async function resumenDeAccesos(ctx: AuthContext): Promise<ResumenDeAccesos> {
  assertCan(ctx, ctx.side === 'CLIENT' ? 'membership.manage' : 'client.view', null)
  const enUnaSemana = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  return scoped(ctx, async (tx) => {
    const [activas, desactivadas, invitacionesPendientes, vencenPronto] = await Promise.all([
      tx.user.count({ where: { status: 'ACTIVE' } }),
      tx.user.count({ where: { status: 'DISABLED' } }),
      tx.invitation.count({ where: { status: 'PENDING' } }),
      tx.invitation.count({ where: { status: 'PENDING', expiresAt: { lt: enUnaSemana } } }),
    ])
    return { activas, desactivadas, invitacionesPendientes, vencenPronto }
  })
}
