import 'server-only'
import type { AgencyRole, ClientRole } from '@/generated/prisma/enums'
import { env } from '@/lib/env'
import { withSystemScope, type Tx } from '@/lib/db/scope'
import { AUDIT, recordAudit } from '@/lib/audit'
import { emailSender } from '@/lib/ports/email'
import { ValidationError } from '@/lib/authz/errors'
import { consumeRateLimit } from './rate-limit'
import { idiomaDelPedido, textoDelPedido } from '@/lib/i18n/castellano'
import { intlDe } from '@/lib/util/format'
import { hashPassword, passwordProblems, verifyPassword } from './password'
import { generateToken, hashToken, normalizeEmail } from './tokens'
import {
  createSession,
  revokeAllSessionsForUser,
  revokeOtherSessionsForUser,
  type CreatedSession,
} from './session'

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
  /**
   * Clave genérica deliberada: no revela si el email existe.
   *
   * Viaja como clave y no como frase escrita porque el texto lo arma la acción,
   * en el idioma de quien está intentando entrar.
   */
  | { ok: false; clave: string }

const GENERIC_LOGIN_ERROR = 'loginGenerico'

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
    return { ok: false, clave: GENERIC_LOGIN_ERROR }
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    return { ok: false, clave: GENERIC_LOGIN_ERROR }
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
    return { ok: false, clave: GENERIC_LOGIN_ERROR }
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
  deniedCapabilities?: string[]
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
    throw new ValidationError({ clave: 'invitacionSinRol' })
  }
  if (input.agencyRole && input.clientId) {
    throw new ValidationError({ clave: 'invitacionDobleLado' })
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
        throw new ValidationError({ clave: 'emailYaEsDeAgencia' })
      }
      if (input.clientId && existingUser.clientMemberships.some((m) => m.clientId === input.clientId)) {
        throw new ValidationError({ clave: 'emailYaTieneAcceso' })
      }
      /*
       * Una persona no puede estar de los dos lados del aislamiento.
       *
       * El lado se decide por tener o no rol de agencia, así que alguien con
       * los dos entra siempre como agencia: la invitación de cliente no le da
       * el acceso que promete, y encima queda una membresía de cliente colgada
       * sobre una cuenta que ve todo.
       */
      if (input.clientId && existingUser.agencyMembership) {
        throw new ValidationError(
          { clave: 'emailEsDeAgencia' },
        )
      }
      if (input.agencyRole && existingUser.clientMemberships.length > 0) {
        throw new ValidationError(
          { clave: 'emailEsDeCliente' },
        )
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
        deniedCapabilities: input.deniedCapabilities ?? [],
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
  /*
   * El mail se escribe en el idioma de quien invita: es la única preferencia que
   * existe en ese momento --la persona invitada todavía no tiene cuenta-- y en
   * una agencia es la misma que la de su cliente.
   */
  const texto = await textoDelPedido('emails')
  const idioma = await idiomaDelPedido()
  await emailSender().send({
    to: email,
    subject: texto('invitacionAsunto'),
    text: [
      texto('invitacionSaludo', { nombre: input.name }),
      '',
      texto('invitacionCuerpo'),
      texto('invitacionActivar'),
      '',
      acceptUrl,
      '',
      texto('invitacionVence', { fecha: expiresAt.toLocaleString(intlDe(idioma)) }),
      texto('invitacionIgnorar'),
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
  | { ok: false; clave: string }

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
  if (problems.length > 0) throw new ValidationError({ clave: 'claveNoCumple' }, { password: problems })

  const passwordHash = await hashPassword(input.password)
  const tokenHash = hashToken(input.token)
  const now = new Date()

  return withSystemScope(async (tx) => {
    const invitation = await tx.invitation.findUnique({ where: { tokenHash } })
    const invalid = { ok: false as const, clave: 'invitacionNoValida' }
    if (!invitation) return invalid
    if (invitation.status !== 'PENDING') return invalid
    if (invitation.expiresAt <= now) {
      await tx.invitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } })
      return invalid
    }

    /*
     * Una invitación NUNCA cambia las credenciales de una cuenta que ya existe.
     *
     * Antes esto era un `upsert` que en la rama de actualización escribía
     * `passwordHash`. O sea: quien tuviera el enlace de una invitación dirigida
     * a un email que ya tenía cuenta le fijaba la contraseña a esa cuenta. Con
     * un email de un empleado de la agencia, eso es tomar control de su cuenta
     * desde un enlace. Pasó de verdad: una invitación de cliente le reescribió
     * la clave al administrador de la agencia.
     *
     * Para una cuenta existente la invitación sólo puede sumar una membresía, y
     * quien entra lo hace con la contraseña que ya tenía.
     */
    const existente = await tx.user.findUnique({
      where: { email: invitation.email },
      include: { agencyMembership: true },
    })

    if (existente && invitation.clientId && existente.agencyMembership) {
      return { ok: false as const, clave: 'invitacionEmailEsDeAgencia' }
    }

    const user = existente
      ? existente
      : await tx.user.create({
          data: {
            email: invitation.email,
            name: input.name.trim() || invitation.name,
            passwordHash,
            passwordSetAt: now,
            status: 'ACTIVE',
          },
        })

    if (invitation.agencyRole) {
      await tx.agencyMembership.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          role: invitation.agencyRole,
          extraCapabilities: invitation.extraCapabilities,
          deniedCapabilities: invitation.deniedCapabilities,
          createdById: invitation.createdById,
        },
        update: {
          role: invitation.agencyRole,
          extraCapabilities: invitation.extraCapabilities,
          deniedCapabilities: invitation.deniedCapabilities,
        },
      })

      /*
       * Los clientes elegidos al invitar. Antes viajaban escondidos dentro de
       * las capacidades y nadie los leía: quien invitaba elegía dos clientes y
       * la persona entraba sin ninguno, viendo una pantalla vacía sin entender
       * por qué.
       */
      if (invitation.agencyClientIds.length > 0) {
        const existentes = await tx.client.findMany({
          where: { id: { in: invitation.agencyClientIds } },
          select: { id: true },
        })
        for (const cliente of existentes) {
          await tx.agencyClientAssignment.upsert({
            where: { userId_clientId: { userId: user.id, clientId: cliente.id } },
            create: { userId: user.id, clientId: cliente.id, createdById: invitation.createdById },
            update: {},
          })
        }
      }
    } else if (invitation.clientId && invitation.clientRole) {
      await tx.clientMembership.upsert({
        where: { userId_clientId: { userId: user.id, clientId: invitation.clientId } },
        create: {
          userId: user.id,
          clientId: invitation.clientId,
          role: invitation.clientRole,
          extraCapabilities: invitation.extraCapabilities,
          deniedCapabilities: invitation.deniedCapabilities,
          createdById: invitation.createdById,
        },
        update: {
          role: invitation.clientRole,
          extraCapabilities: invitation.extraCapabilities,
          deniedCapabilities: invitation.deniedCapabilities,
        },
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

  const texto = await textoDelPedido('emails')
  await emailSender().send({
    to: email,
    subject: texto('recuperarAsunto'),
    text: [
      texto('recuperarSaludo', { nombre: user.name }),
      '',
      texto('recuperarCuerpo'),
      '',
      `${env().APP_URL}/recuperar/${token}`,
      '',
      texto('recuperarVence'),
      texto('recuperarIgnorar'),
    ].join('\n'),
  })
}

export async function completePasswordReset(input: {
  token: string
  password: string
  ip: string | null
  userAgent: string | null
}): Promise<{ ok: boolean; clave?: string }> {
  const problems = passwordProblems(input.password)
  if (problems.length > 0) throw new ValidationError({ clave: 'claveNoCumple' }, { password: problems })

  const passwordHash = await hashPassword(input.password)
  const now = new Date()

  const result = await withSystemScope(async (tx) => {
    const reset = await tx.passwordReset.findUnique({ where: { tokenHash: hashToken(input.token) } })
    if (!reset || reset.usedAt || reset.expiresAt <= now) {
      return { ok: false, clave: 'enlaceNoValido' }
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

/**
 * Cambia la contraseña de quien ya inició sesión.
 *
 * Pide la actual: la sesión abierta prueba quién entró, no que quien está
 * frente a la pantalla en este momento sea esa persona. Y como el cambio
 * invalida cualquier sesión robada, se cierran todas las demás -- la que hizo
 * el cambio sigue viva, porque cerrarle la puerta a quien acaba de hacer lo
 * correcto no protege de nada.
 */
export async function changeOwnPassword(input: {
  userId: string
  sessionId: string
  currentPassword: string
  newPassword: string
  ip: string | null
  userAgent: string | null
}): Promise<{ ok: boolean; clave?: string; otrasSesionesCerradas?: number }> {
  await consumeRateLimit('passwordChange', input.userId)

  const user = await withSystemScope((tx) => tx.user.findUnique({ where: { id: input.userId } }))
  if (!user) return { ok: false, clave: 'cuentaNoEncontrada' }

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    return { ok: false, clave: 'claveActualIncorrecta' }
  }

  const problems = passwordProblems(input.newPassword)
  if (problems.length > 0) {
    throw new ValidationError({ clave: 'claveNuevaNoCumple' }, { newPassword: problems })
  }
  if (await verifyPassword(input.newPassword, user.passwordHash)) {
    return { ok: false, clave: 'claveNuevaIgual' }
  }

  const now = new Date()
  const passwordHash = await hashPassword(input.newPassword)

  await withSystemScope(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: { passwordHash, passwordSetAt: now, failedLoginCount: 0, lockedUntil: null },
    })
    await recordAudit(tx, { userId: input.userId, ip: input.ip, userAgent: input.userAgent }, {
      action: AUDIT.PASSWORD_CHANGED,
      entityType: 'User',
      entityId: input.userId,
    })
  })

  const cerradas = await revokeOtherSessionsForUser(input.userId, input.sessionId, 'password_changed')

  return { ok: true, otrasSesionesCerradas: cerradas }
}
