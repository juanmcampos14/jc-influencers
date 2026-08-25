import { beforeEach, describe, expect, it } from 'vitest'
import { changeOwnPassword, login } from '@/lib/auth/flows'
import { createSession } from '@/lib/auth/session'
import { withSystemScope } from '@/lib/db/scope'
import { contextFor, createUser, resetDatabase, seedCatalogs, TEST_PASSWORD } from '../helpers/fixtures'
import type { AuthContext } from '@/lib/authz/context'

const meta = { ip: '127.0.0.1', userAgent: 'vitest' }
const NUEVA = 'Jc.Nueva.Clave.2026'

/**
 * Cambiar la propia contraseña es la contracara del arreglo de invitaciones:
 * ahora que aceptar una invitación NO puede tocar una cuenta existente, tiene
 * que haber una forma legítima de cambiarla desde adentro. Y esa forma pide la
 * actual, porque una sesión abierta prueba quién entró, no quién está frente a
 * la pantalla ahora.
 */
describe('Cambio de contraseña desde la propia cuenta', () => {
  let ctx: AuthContext

  beforeEach(async () => {
    await resetDatabase()
    await seedCatalogs()
    ctx = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)
  })

  it('cambia la clave y deja entrar con la nueva', async () => {
    const result = await changeOwnPassword({
      userId: ctx.user.id,
      sessionId: ctx.sessionId,
      currentPassword: TEST_PASSWORD,
      newPassword: NUEVA,
      ...meta,
    })
    expect(result.ok).toBe(true)

    expect((await login({ email: ctx.user.email, password: NUEVA, ...meta })).ok).toBe(true)
    expect((await login({ email: ctx.user.email, password: TEST_PASSWORD, ...meta })).ok).toBe(false)
  })

  it('rechaza el cambio si la contraseña actual no es la correcta', async () => {
    const result = await changeOwnPassword({
      userId: ctx.user.id,
      sessionId: ctx.sessionId,
      currentPassword: 'Cualquier.Otra.2026',
      newPassword: NUEVA,
      ...meta,
    })

    expect(result.ok).toBe(false)
    // Y la de siempre sigue sirviendo: no se tocó nada.
    expect((await login({ email: ctx.user.email, password: TEST_PASSWORD, ...meta })).ok).toBe(true)
  })

  it('exige que la nueva cumpla la política', async () => {
    await expect(
      changeOwnPassword({
        userId: ctx.user.id,
        sessionId: ctx.sessionId,
        currentPassword: TEST_PASSWORD,
        newPassword: 'corta',
        ...meta,
      }),
    ).rejects.toThrow()
  })

  it('cierra las otras sesiones y conserva la que hizo el cambio', async () => {
    const otra = await withSystemScope((tx) => createSession(tx, ctx.user.id, meta))

    const result = await changeOwnPassword({
      userId: ctx.user.id,
      sessionId: ctx.sessionId,
      currentPassword: TEST_PASSWORD,
      newPassword: NUEVA,
      ...meta,
    })
    expect(result.otrasSesionesCerradas).toBe(1)

    const sesiones = await withSystemScope((tx) =>
      tx.session.findMany({ where: { userId: ctx.user.id }, select: { id: true, revokedAt: true } }),
    )
    const actual = sesiones.find((s) => s.id === ctx.sessionId)
    const cerrada = sesiones.find((s) => s.id === otra.id)

    expect(actual?.revokedAt).toBeNull()
    expect(cerrada?.revokedAt).not.toBeNull()
  })
})
