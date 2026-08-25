import 'server-only'
import type { AgencyRole, ClientRole } from '@/generated/prisma/enums'
import { env } from '@/lib/env'
import { withSystemScope, type Tx } from '@/lib/db/scope'
import { AUDIT, recordAudit } from '@/lib/audit'
import { emailSender } from '@/lib/ports/email'
import { ValidationError } from '@/lib/authz/errors'
import { consumeRateLimit } from './rate-limit'
import { hashPassword, passwordProblems, verifyPassword } from './password'
import { generateToken, hashToken, normalizeEmail } from './tokens'
import { createSession, revokeAllSessionsForUser, type CreatedSession } from './session'

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000
const MAX_FAILED_LOGINS = 10
const LOCK_DURATION_MS = 15 * 60 * 1000

/** Hash descartable para igualar el tiempo de respuesta cuando el email no existe. */
const DUMMY_HASH =
  'scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

export type LoginInput = { email: string; password: string; ip: string | null; userAgent: string | null }

export type LoginResult =
  | { ok: true; session: CreatedSession; userId: string }
  /** Mensaje genérico deliberado: no revela si el email existe. */
  | { ok: false; message: string }

const GENERIC_LOGIN_ERROR = 'Email o contraseña incorrectos.'

export async function login(input: LoginInput): Promise<LoginResult> {
  const email = normalizeEmail(input.email)
  await consumeRateLimit('login', input.ip ?? 'sin-ip')
  await consumeRateLimit('loginPerEmail', email)

  const user = await withSystemScope((tx) => tx.user.findUnique({ where: { email } }))
  const now = new Date()

  if (!user) {
    // Se verifica igual contra un hash falso para no filtrar la existencia por timing.
    await verifyPassword(input.password, DUMMY_HASH)
    await withSystemScope((tx) =>
      recordAudit(tx, { email, ip: input.ip, userAgent: input.userAgent }, {
        action: AUDIT.LOGIN_FAILURE,
        entityType: 'User',
        metadata: { reason: 'unknown_email' },
      }),
    )
    return { ok: false, message: GENERIC_LOGIN_ERROR }
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    return { ok: false, message: GENERIC_LOGIN_ERROR }
  }

  const valid = await verifyPassword(input.password, user.passwordHash)

  if (!valid || user.status !== 'ACTIVE') {
    await withSystemScope(async (tx) => {
      if (!valid) {
        const failed = user.failedLoginCount + 1
        await tx.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: failed,
            lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCK_DURATION_MS) : null,
          },
        })
      }
      await recordAudit(tx, { userId: user.id, email, ip: input.ip, userAgent: input.userAgent }, {
        action: AUDIT.LOGIN_FAILURE,
        entityType: 'User',
        entityId: user.id,
        metadata: { reason: valid ? 'user_disabled' : 'bad_password' },
      })
    })
    return { ok: false, message: GENERIC_LOGIN_ERROR }
  }

  const session = await withSystemScope(async (tx) => {
    const created = await createSession(tx, user.id, { ip: input.ip, userAgent: input.userAgent }, now)
    await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now, failedLoginCount: 0, lockedUntil: null },
    })
    await recordAudit(tx, { userId: user.id, email, ip: input.ip, userAgent: input.userAgent }, {
      action: AUDIT.LOGIN_SUCCESS,
      entityType: 'User',
      entityId: user.id,
    })
    return created
  })

  return { ok: true, session, userId: user.id }
}

// ── Invitaciones ─────────────────────────────────────────────────────────────

export type CreateInvitationInput = {
  email: string
  name: string
  agencyRole?: AgencyRole | null
  clientId?: string | null
  clientRole?: ClientRole | null
  extraCapabilities?: string[]
  createdById: string
  actor: { userId: string; email: string; role: string | null; ip: string | null; userAgent: string | null }
}

export type CreatedInvitation = { id: string; token: string; expiresAt: Date; acceptUrl: string }

/**
 * Crea una invitación de un solo uso con vencimiento y manda el mail.
 * El token en claro sólo existe acá y en el email: en base va hasheado.
 */
export async function createInvitation(input: CreateInvitationInput): Promise<CreatedInvitation> {
  const email = normalizeEmail(input.email)
  await consumeRateLimit('invitation', input.createdById)

  if (!input.agencyRole && !(input.clientId && input.clientRole)) {
    throw new ValidationError('La invitación necesita un rol de agencia o un cliente con su rol.')
  }
  if (input.agencyRole && input.clientId) {
    throw new ValidationError('Una invitación no puede ser de agencia y de cliente a la vez.')
  }

  const token = generateToken(32)
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS)

  const invitation = await withSystemScope(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email },
      include: { agencyMembership: true, clientMemberships: true },
    })
    if (existingUser) {
      if (input.agencyRole && existingUser.agencyMembership) {
        throw new ValidationError('Ese email ya es usuario de la agencia.')
      }
      if (input.clientId && existingUser.clientMemberships.some((m) => m.clientId === input.clientId)) {
        throw new ValidationError('Ese email ya tiene acceso a este cliente.')
      }
    }

    // Invitaciones pendientes previas para el mismo destino quedan revocadas.
    await tx.invitation.updateMany({
      where: { email, status: 'PENDING', clientId: input.clientId ?? null },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedById: input.createdById },
    })

    const created = await tx.invitation.create({
      data: {
        email,
        name: input.name.trim(),
        tokenHash: hashToken(token),
        agencyRole: input.agencyRole ?? null,
        clientId: input.clientId ?? null,
        clientRole: input.clientRole ?? null,
        extraCapabilities: input.extraCapabilities ?? [],
        expiresAt,
        createdById: input.createdById,
      },
    })

    await recordAudit(tx, input.actor, {
      action: AUDIT.INVITATION_CREATED,
      entityType: 'Invitation',
      entityId: created.id,
      clientId: input.clientId ?? null,
      after: { email, agencyRole: input.agencyRole ?? null, clientRole: input.clientRole ?? null },
    })
    return created
  })

  const acceptUrl = `${env().APP_URL}/invitacion/${token}`
  await emailSender().send({
    to: email,
    subject: 'Te invitaron a JC Influencers',
    text: [
      `Hola ${input.name},`,
      '',
      'La agencia JC te dio acceso a la plataforma de campañas de influencers.',
      'Para activar tu cuenta y definir tu contraseña, entrá acá:',
      '',
      acceptUrl,
      '',
      `El enlace vence el ${expiresAt.toLocaleString('es-AR')} y se puede usar una sola vez.`,
      'Si no esperabas esta invitación, ignorá este mensaje.',
    ].join('\n'),
  })

  return { id: invitation.id, token, expiresAt, acceptUrl }
}

export type InvitationPreview = {
  name: string
  email: string
  kind: 'AGENCY' | 'CLIENT'
  clientName: string | null
  roleLabel: string
}

/** Estado de un token de invitación. Nunca dice por qué falló con detalle. */
export async function inspectInvitation(token: string): Promise<InvitationPreview | null> {
  const invitation = await withSystemScope((tx) =>
    tx.invitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { client: true } }),
  )
  if (!invitation) return null
  if (invitation.status !== 'PENDING') return null
  if (invitation.expiresAt <= new Date()) return null
  return {
    name: invitation.name,
    email: invitation.email,
    kind: invitation.agencyRole ? 'AGENCY' : 'CLIENT',
    clientName: invitation.client?.name ?? null,
    roleLabel: invitation.agencyRole ?? invitation.clientRole ?? '',
  }
}

export type AcceptInvitationResult =
  | { ok: true; session: CreatedSession; userId: string }
  | { ok: false; message: string }

/**
 * Acepta una invitación: verifica el email invitado (probar el token ES la
 * verificación), crea o actualiza el usuario, aplica la membresía y abre sesión.
 * Todo dentro de una transacción; el token se marca usado y no vuelve a servir.
 */
export async function acceptInvitation(input: {
  token: string
  name: string
  password: string
  ip: string | null
  userAgent: string | null
}): Promise<AcceptInvitationResult> {
  await consumeRateLimit('invitationAccept', input.ip ?? 'sin-ip')

  const problems = passwordProblems(input.password)
  if (problems.length > 0) throw new ValidationError('La contraseña no cumple la política.', { password: problems })

  const passwordHash = await hashPassword(input.password)
  const tokenHash = hashToken(input.token)
  const now = new Date()

  return withSystemScope(async (tx) => {
    const invitation = await tx.invitation.findUnique({ where: { tokenHash } })
    const invalid = { ok: false as const, message: 'La invitación no es válida, ya se usó o venció.' }
    if (!invitation) return invalid
    if (invitation.status !== 'PENDING') return invalid
    if (invitation.expiresAt <= now) {
      await tx.invitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } })
      return invalid
    }

    const user = await tx.user.upsert({
      where: { email: invitation.email },
      create: {
        email: invitation.email,
        name: input.name.trim() || invitation.name,
        passwordHash,
        passwordSetAt: now,
        status: 'ACTIVE',
      },
      update: { passwordHash, passwordSetAt: now, status: 'ACTIVE', disabledAt: null, failedLoginCount: 0 },
    })

    if (invitation.agencyRole) {
      await tx.agencyMembership.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          role: invitation.agencyRole,
          extraCapabilities: invitation.extraCapabilities,
          createdById: invitation.createdById,
        },
        update: { role: invitation.agencyRole, extraCapabilities: invitation.extraCapabilities },
      })
    } else if (invitation.clientId && invitation.clientRole) {
      await tx.clientMembership.upsert({
        where: { userId_clientId: { userId: user.id, clientId: invitation.clientId } },
        create: {
          userId: user.id,
          clientId: invitation.clientId,
          role: invitation.clientRole,
          extraCapabilities: invitation.extraCapabilities,
          createdById: invitation.createdById,
        },
        update: { role: invitation.clientRole, extraCapabilities: invitation.extraCapabilities },
      })
    }

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', acceptedAt: now, acceptedByUserId: user.id },
    })

    await recordAudit(tx, { userId: user.id, email: user.email, ip: input.ip, userAgent: input.userAgent }, {
      action: AUDIT.INVITATION_ACCEPTED,
      entityType: 'Invitation',
      entityId: invitation.id,
      clientId: invitation.clientId,
    })

    const session = await createSession(tx, user.id, { ip: input.ip, userAgent: input.userAgent }, now)
    return { ok: true as const, session, userId: user.id }
  })
}

export async function revokeInvitation(
  tx: Tx,
  invitationId: string,
  actor: { userId: string; email: string; role: string | null; ip: string | null; userAgent: string | null },
): Promise<void> {
  const invitation = await tx.invitation.findUnique({ where: { id: invitationId } })
  if (!invitation || invitation.status !== 'PENDING') return
  await tx.invitation.update({
    where: { id: invitationId },
    data: { status: 'REVOKED', revokedAt: new Date(), revokedById: actor.userId },
  })
  await recordAudit(tx, actor, {
    action: AUDIT.INVITATION_REVOKED,
    entityType: 'Invitation',
    entityId: invitationId,
    clientId: invitation.clientId,
  })
}

// ── Recuperación de acceso ───────────────────────────────────────────────────

/**
 * Siempre responde igual, exista o no el email. Si existe y está activo,
 * manda el enlace; si no, no hace nada visible.
 */
export async function requestPasswordReset(input: {
  email: string
  ip: string | null
  userAgent: string | null
}): Promise<void> {
  const email = normalizeEmail(input.email)
  await consumeRateLimit('passwordReset', input.ip ?? 'sin-ip')

  const user = await withSystemScope((tx) => tx.user.findUnique({ where: { email } }))
  if (!user || user.status !== 'ACTIVE') return

  const token = generateToken(32)
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS)

  await withSystemScope(async (tx) => {
    await tx.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } })
    await tx.passwordReset.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt, ip: input.ip },
    })
    await recordAudit(tx, { userId: user.id, email, ip: input.ip, userAgent: input.userAgent }, {
      action: AUDIT.PASSWORD_RESET_REQUEST,
      entityType: 'User',
      entityId: user.id,
    })
  })

  await emailSender().send({
    to: email,
    subject: 'Recuperar acceso a JC Influencers',
    text: [
      `Hola ${user.name},`,
      '',
      'Pediste recuperar el acceso a la plataforma. Definí una contraseña nueva acá:',
      '',
      `${env().APP_URL}/recuperar/${token}`,
      '',
      'El enlace vence en una hora y se puede usar una sola vez.',
      'Si no pediste esto, ignorá el mensaje: tu contraseña actual sigue funcionando.',
    ].join('\n'),
  })
}

export async function completePasswordReset(input: {
  token: string
  password: string
  ip: string | null
  userAgent: string | null
}): Promise<{ ok: boolean; message?: string }> {
  const problems = passwordProblems(input.password)
  if (problems.length > 0) throw new ValidationError('La contraseña no cumple la política.', { password: problems })

  const passwordHash = await hashPassword(input.password)
  const now = new Date()

  const result = await withSystemScope(async (tx) => {
    const reset = await tx.passwordReset.findUnique({ where: { tokenHash: hashToken(input.token) } })
    if (!reset || reset.usedAt || reset.expiresAt <= now) {
      return { ok: false, message: 'El enlace no es válido, ya se usó o venció.' }
    }
    await tx.passwordReset.update({ where: { id: reset.id }, data: { usedAt: now } })
    await tx.user.update({
      where: { id: reset.userId },
      data: { passwordHash, passwordSetAt: now, failedLoginCount: 0, lockedUntil: null },
    })
    await recordAudit(tx, { userId: reset.userId, ip: input.ip, userAgent: input.userAgent }, {
      action: AUDIT.PASSWORD_RESET_COMPLETE,
      entityType: 'User',
      entityId: reset.userId,
    })
    return { ok: true, userId: reset.userId }
  })

  // Cambiar la contraseña cierra todas las sesiones abiertas.
  if (result.ok && 'userId' in result && result.userId) {
    await revokeAllSessionsForUser(result.userId, 'password_reset')
  }
  return result
}
