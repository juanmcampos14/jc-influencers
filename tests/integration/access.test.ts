import { beforeAll, describe, expect, it } from 'vitest'
import { buildAuthContext } from '@/lib/authz/context'
import { withSystemScope } from '@/lib/db/scope'
import { createSession } from '@/lib/auth/session'
import {
  acceptInvitation,
  completePasswordReset,
  createInvitation,
  inspectInvitation,
  login,
  requestPasswordReset,
} from '@/lib/auth/flows'
import { setUserStatus, revokeUserInvitation } from '@/lib/repos/users'
import { hashToken } from '@/lib/auth/tokens'
import {
  contextFor,
  createClientTenant,
  createUser,
  resetDatabase,
  seedCatalogs,
  TEST_PASSWORD,
} from '../helpers/fixtures'

const meta = { ip: '127.0.0.1', userAgent: 'vitest' }

/** REQUISITOS 5 y 6: desactivación de usuarios y ciclo de vida de las invitaciones. */
describe('Acceso, invitaciones y recuperación', () => {
  let clientId: string
  let adminId: string

  beforeAll(async () => {
    await resetDatabase()
    await seedCatalogs()
    const client = await createClientTenant('Cliente Acceso')
    clientId = client.id
    const admin = await createUser({ agencyRole: 'AGENCY_ADMIN', email: 'admin-acceso@test.local' })
    adminId = admin.id
  })

  it('5 · un usuario desactivado pierde el acceso en el acto', async () => {
    const user = await createUser({ clientMemberships: [{ clientId, role: 'CLIENT_REVIEWER' }] })
    const session = await withSystemScope((tx) => createSession(tx, user.id, meta))

    // Con la sesión abierta funciona.
    expect(await buildAuthContext(session.token, meta)).not.toBeNull()

    const admin = await contextFor(adminId)
    await setUserStatus(admin, user.id, false)

    // La misma cookie deja de servir sin necesidad de que expire.
    expect(await buildAuthContext(session.token, meta)).toBeNull()

    // Y tampoco puede volver a entrar con su contraseña.
    const result = await login({ email: user.email, password: TEST_PASSWORD, ...meta })
    expect(result.ok).toBe(false)
  })

  it('5 · un cambio de rol cierra las sesiones abiertas', async () => {
    const user = await createUser({ clientMemberships: [{ clientId, role: 'CLIENT_VIEWER' }] })
    const session = await withSystemScope((tx) => createSession(tx, user.id, meta))
    expect(await buildAuthContext(session.token, meta)).not.toBeNull()

    const { updateMemberships } = await import('@/lib/repos/users')
    const admin = await contextFor(adminId)
    await updateMemberships(admin, {
      userId: user.id,
      clientMemberships: [{ clientId, role: 'CLIENT_ADMIN' }],
    })
    expect(await buildAuthContext(session.token, meta)).toBeNull()
  })

  it('6 · una invitación válida se acepta una sola vez', async () => {
    const admin = await contextFor(adminId)
    const invitation = await createInvitation({
      email: `invitado-${Date.now()}@test.local`,
      name: 'Invitado',
      clientId,
      clientRole: 'CLIENT_REVIEWER',
      createdById: admin.user.id,
      actor: { userId: admin.user.id, email: admin.user.email, role: 'AGENCY_ADMIN', ...meta },
    })

    expect(await inspectInvitation(invitation.token)).not.toBeNull()

    const first = await acceptInvitation({
      token: invitation.token,
      name: 'Invitado',
      password: 'Invitado.Seguro.2026',
      ...meta,
    })
    expect(first.ok).toBe(true)

    // El mismo token ya no sirve.
    const second = await acceptInvitation({
      token: invitation.token,
      name: 'Invitado',
      password: 'Invitado.Seguro.2026',
      ...meta,
    })
    expect(second.ok).toBe(false)
    expect(await inspectInvitation(invitation.token)).toBeNull()
  })

  it('6 · una invitación revocada deja de funcionar', async () => {
    const admin = await contextFor(adminId)
    const invitation = await createInvitation({
      email: `revocado-${Date.now()}@test.local`,
      name: 'Revocado',
      clientId,
      clientRole: 'CLIENT_VIEWER',
      createdById: admin.user.id,
      actor: { userId: admin.user.id, email: admin.user.email, role: 'AGENCY_ADMIN', ...meta },
    })

    await revokeUserInvitation(admin, invitation.id)
    expect(await inspectInvitation(invitation.token)).toBeNull()

    const result = await acceptInvitation({
      token: invitation.token,
      name: 'Revocado',
      password: 'Revocado.Seguro.2026',
      ...meta,
    })
    expect(result.ok).toBe(false)
  })

  it('6 · una invitación vencida deja de funcionar', async () => {
    const admin = await contextFor(adminId)
    const invitation = await createInvitation({
      email: `vencido-${Date.now()}@test.local`,
      name: 'Vencido',
      clientId,
      clientRole: 'CLIENT_VIEWER',
      createdById: admin.user.id,
      actor: { userId: admin.user.id, email: admin.user.email, role: 'AGENCY_ADMIN', ...meta },
    })

    await withSystemScope((tx) =>
      tx.invitation.update({ where: { id: invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } }),
    )

    expect(await inspectInvitation(invitation.token)).toBeNull()
    const result = await acceptInvitation({
      token: invitation.token,
      name: 'Vencido',
      password: 'Vencido.Seguro.2026',
      ...meta,
    })
    expect(result.ok).toBe(false)
  })

  it('6 · un token inventado no revela nada', async () => {
    expect(await inspectInvitation('token-inventado-que-no-existe')).toBeNull()
    const result = await acceptInvitation({
      token: 'token-inventado-que-no-existe',
      name: 'X',
      password: 'Inventado.Seguro.2026',
      ...meta,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      // Misma clave que para un token vencido o usado: no distingue casos.
      expect(result.clave).toBe('invitacionNoValida')
    }
  })

  it('el token de invitación no se guarda en claro', async () => {
    const admin = await contextFor(adminId)
    const invitation = await createInvitation({
      email: `hash-${Date.now()}@test.local`,
      name: 'Hash',
      clientId,
      clientRole: 'CLIENT_VIEWER',
      createdById: admin.user.id,
      actor: { userId: admin.user.id, email: admin.user.email, role: 'AGENCY_ADMIN', ...meta },
    })
    const row = await withSystemScope((tx) => tx.invitation.findUnique({ where: { id: invitation.id } }))
    expect(row?.tokenHash).toBe(hashToken(invitation.token))
    expect(row?.tokenHash).not.toBe(invitation.token)
  })

  it('el login no distingue email inexistente de contraseña incorrecta', async () => {
    const user = await createUser({ clientMemberships: [{ clientId, role: 'CLIENT_VIEWER' }] })
    const wrongPassword = await login({ email: user.email, password: 'incorrecta', ...meta })
    const unknownEmail = await login({ email: 'nadie@test.local', password: 'incorrecta', ...meta })
    expect(wrongPassword.ok).toBe(false)
    expect(unknownEmail.ok).toBe(false)
    if (!wrongPassword.ok && !unknownEmail.ok) {
      expect(wrongPassword.clave).toBe(unknownEmail.clave)
    }
  })

  it('la recuperación no revela si el email existe', async () => {
    const user = await createUser({ clientMemberships: [{ clientId, role: 'CLIENT_VIEWER' }] })
    // Ninguna de las dos llamadas lanza ni devuelve algo distinto.
    await expect(requestPasswordReset({ email: user.email, ...meta })).resolves.toBeUndefined()
    await expect(requestPasswordReset({ email: 'fantasma@test.local', ...meta })).resolves.toBeUndefined()

    const sent = await withSystemScope((tx) => tx.emailOutbox.findMany({ where: { to: 'fantasma@test.local' } }))
    expect(sent).toHaveLength(0)
  })

  it('el reseteo de contraseña cierra todas las sesiones', async () => {
    const user = await createUser({ clientMemberships: [{ clientId, role: 'CLIENT_VIEWER' }] })
    const session = await withSystemScope((tx) => createSession(tx, user.id, meta))
    expect(await buildAuthContext(session.token, meta)).not.toBeNull()

    await requestPasswordReset({ email: user.email, ...meta })
    const reset = await withSystemScope((tx) =>
      tx.passwordReset.findFirst({ where: { userId: user.id, usedAt: null }, orderBy: { createdAt: 'desc' } }),
    )
    expect(reset).not.toBeNull()

    // El token en claro sólo viaja por email; acá se reconstruye desde la bandeja.
    const email = await withSystemScope((tx) =>
      tx.emailOutbox.findFirst({ where: { to: user.email }, orderBy: { createdAt: 'desc' } }),
    )
    const match = email?.bodyText.match(/\/recuperar\/([A-Za-z0-9_-]+)/)
    const token = match?.[1]
    expect(token).toBeTruthy()

    const result = await completePasswordReset({ token: token as string, password: 'Nueva.Clave.2026', ...meta })
    expect(result.ok).toBe(true)

    // La sesión vieja murió y el token de reseteo no se puede reusar.
    expect(await buildAuthContext(session.token, meta)).toBeNull()
    const reuse = await completePasswordReset({ token: token as string, password: 'Otra.Clave.2026', ...meta })
    expect(reuse.ok).toBe(false)

    const newLogin = await login({ email: user.email, password: 'Nueva.Clave.2026', ...meta })
    expect(newLogin.ok).toBe(true)
  })

  it('la política de contraseña se aplica en el servidor', async () => {
    const admin = await contextFor(adminId)
    const invitation = await createInvitation({
      email: `debil-${Date.now()}@test.local`,
      name: 'Débil',
      clientId,
      clientRole: 'CLIENT_VIEWER',
      createdById: admin.user.id,
      actor: { userId: admin.user.id, email: admin.user.email, role: 'AGENCY_ADMIN', ...meta },
    })
    const error = await acceptInvitation({ token: invitation.token, name: 'Débil', password: '123', ...meta }).catch(
      (caught: unknown) => caught,
    )
    expect((error as Error).name).toBe('ValidationError')
  })
})
