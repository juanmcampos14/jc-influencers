import { beforeEach, describe, expect, it } from 'vitest'
import { acceptInvitation, createInvitation, login } from '@/lib/auth/flows'
import { withSystemScope } from '@/lib/db/scope'
import { contextFor, createClientTenant, createUser, resetDatabase, seedCatalogs, TEST_PASSWORD } from '../helpers/fixtures'
import type { AuthContext } from '@/lib/authz/context'

const meta = { ip: '127.0.0.1', userAgent: 'vitest' }

/** Los datos del actor que pide `createInvitation` para la auditoría. */
const actorDe = (ctx: AuthContext) => ({
  userId: ctx.user.id,
  email: ctx.user.email,
  role: ctx.agencyRole ?? null,
  ...meta,
})

/**
 * Una invitación no puede convertirse en una forma de tomar cuentas.
 *
 * Esto pasó de verdad: aceptar una invitación de CLIENTE dirigida al email del
 * administrador de la agencia le reescribió la contraseña a esa cuenta. El
 * `upsert` por email actualizaba `passwordHash` en la rama de actualización, así
 * que cualquiera con el enlace le fijaba la clave a una cuenta que ya existía.
 */
describe('Una invitación nunca toma una cuenta existente', () => {
  let admin: AuthContext
  let clientId: string

  beforeEach(async () => {
    await resetDatabase()
    await seedCatalogs()
    clientId = (await createClientTenant('Marca')).id
    admin = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)
  })

  it('no deja invitar como cliente a un email que ya es de la agencia', async () => {
    const empleado = await createUser({ agencyRole: 'ACCOUNT_MANAGER', agencyClientIds: [clientId] })

    await expect(
      createInvitation({
        email: empleado.email,
        name: 'Empleado',
        clientId,
        clientRole: 'CLIENT_ADMIN',
        createdById: admin.user.id,
        actor: actorDe(admin),
      }),
    ).rejects.toThrow(/empleado de la agencia/i)
  })

  it('aunque la invitación exista, aceptarla no le cambia la contraseña a la cuenta', async () => {
    // Se crea la invitación ANTES de que el email tenga cuenta, y la cuenta
    // aparece después: es la secuencia que la validación de alta no cubre.
    const invitacion = await createInvitation({
      email: 'futuro.empleado@ejemplo.test',
      name: 'Futuro',
      clientId,
      clientRole: 'CLIENT_ADMIN',
      createdById: admin.user.id,
      actor: actorDe(admin),
    })

    const empleado = await createUser({
      email: 'futuro.empleado@ejemplo.test',
      agencyRole: 'AGENCY_ADMIN',
    })
    const claveOriginal = await withSystemScope((tx) =>
      tx.user.findUnique({ where: { id: empleado.id }, select: { passwordHash: true } }),
    )

    const resultado = await acceptInvitation({
      token: invitacion.token,
      name: 'Alguien',
      password: 'UnaClaveNueva.2026!',
      ...meta,
    })

    expect(resultado.ok).toBe(false)

    const despues = await withSystemScope((tx) =>
      tx.user.findUnique({ where: { id: empleado.id }, select: { passwordHash: true } }),
    )
    expect(despues?.passwordHash).toBe(claveOriginal?.passwordHash)

    // Y la contraseña que tenía sigue funcionando.
    const entrada = await login({ email: empleado.email, password: TEST_PASSWORD, ...meta })
    expect(entrada.ok).toBe(true)
  })

  it('una persona no queda de los dos lados del aislamiento', async () => {
    const invitacion = await createInvitation({
      email: 'otro.futuro@ejemplo.test',
      name: 'Otro',
      clientId,
      clientRole: 'CLIENT_ADMIN',
      createdById: admin.user.id,
      actor: actorDe(admin),
    })
    await createUser({ email: 'otro.futuro@ejemplo.test', agencyRole: 'SCOUT', agencyClientIds: [clientId] })

    await acceptInvitation({ token: invitacion.token, name: 'Otro', password: 'OtraClave.2026!', ...meta })

    // El lado se decide por tener rol de agencia, así que alguien con las dos
    // membresías entra siempre como agencia: la de cliente no le daría el
    // acceso que promete y quedaría colgada sobre una cuenta que ve más.
    const membresias = await withSystemScope((tx) =>
      tx.clientMembership.count({ where: { user: { email: 'otro.futuro@ejemplo.test' } } }),
    )
    expect(membresias).toBe(0)
  })

  it('una invitación a un email nuevo sigue funcionando', async () => {
    const invitacion = await createInvitation({
      email: 'persona.nueva@ejemplo.test',
      name: 'Persona Nueva',
      clientId,
      clientRole: 'CLIENT_REVIEWER',
      createdById: admin.user.id,
      actor: actorDe(admin),
    })

    const resultado = await acceptInvitation({
      token: invitacion.token,
      name: 'Persona Nueva',
      password: 'ClaveDePrueba.2026!',
      ...meta,
    })

    expect(resultado.ok).toBe(true)
    const entrada = await login({ email: 'persona.nueva@ejemplo.test', password: 'ClaveDePrueba.2026!', ...meta })
    expect(entrada.ok).toBe(true)
  })
})
