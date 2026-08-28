import { beforeEach, describe, expect, it } from 'vitest'
import { withSystemScope } from '@/lib/db/scope'
import { inviteUser, updateMemberships } from '@/lib/repos/users'
import { can } from '@/lib/authz/context'
import { AGENCY_ROLE_CAPABILITIES, CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE } from '@/lib/authz/capabilities'
import { contextFor, createClientTenant, createUser, resetDatabase, seedCatalogs } from '../helpers/fixtures'
import type { AuthContext } from '@/lib/authz/context'

/**
 * Quitarle un permiso a alguien tiene que quitárselo de verdad.
 *
 * El árbol de permisos es una pantalla; esto prueba que lo que se marca ahí
 * llega hasta la autorización. Un casillero que no cambia nada es peor que no
 * tenerlo: hace creer que el acceso está cerrado cuando sigue abierto.
 */
describe('permisos quitados a una persona', () => {
  let admin: AuthContext
  let clientId: string

  beforeEach(async () => {
    await resetDatabase()
    await seedCatalogs()
    clientId = (await createClientTenant('Marca')).id
    admin = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)
  })

  it('un account manager deja de ver la plata si se le desmarca', async () => {
    /*
     * Con el cliente asignado: un account manager sin clientes no puede nada
     * sobre ninguno, y el test estaría midiendo el alcance en vez del permiso.
     */
    const persona = await createUser({ agencyRole: 'ACCOUNT_MANAGER', agencyClientIds: [clientId] })

    // Antes: el rol se la da.
    expect(can(await contextFor(persona.id), 'budget.view', clientId)).toBe(true)

    const sinPlata = AGENCY_ROLE_CAPABILITIES.ACCOUNT_MANAGER.filter((c) => c !== 'budget.view')
    await updateMemberships(admin, {
      userId: persona.id,
      agencyRole: 'ACCOUNT_MANAGER',
      agencyConcedidas: [...sinPlata],
    })

    // Después: sigue siendo account manager, pero sin eso.
    const despues = await contextFor(persona.id)
    expect(can(despues, 'budget.view', clientId)).toBe(false)
    expect(can(despues, 'campaign.view', clientId)).toBe(true)

    const guardado = await withSystemScope((tx) =>
      tx.agencyMembership.findUnique({ where: { userId: persona.id } }),
    )
    /*
     * Se guarda como QUITADO, no como una lista completa: si mañana cambia lo
     * que da el rol, el cambio le llega igual, salvo en lo que se decidió a
     * mano.
     */
    expect(guardado?.deniedCapabilities).toEqual(['budget.view'])
    expect(guardado?.extraCapabilities).toEqual([])
  })

  it('sumar algo que el rol no da queda como sumado', async () => {
    const persona = await createUser({ agencyRole: 'SCOUT', agencyClientIds: [clientId] })
    expect(can(await contextFor(persona.id), 'audit.view', clientId)).toBe(false)

    await updateMemberships(admin, {
      userId: persona.id,
      agencyRole: 'SCOUT',
      agencyConcedidas: [...AGENCY_ROLE_CAPABILITIES.SCOUT, 'audit.view'],
    })

    expect(can(await contextFor(persona.id), 'audit.view', clientId)).toBe(true)
    const guardado = await withSystemScope((tx) =>
      tx.agencyMembership.findUnique({ where: { userId: persona.id } }),
    )
    expect(guardado?.extraCapabilities).toEqual(['audit.view'])
  })

  /*
   * El cerrojo que no levanta nadie: lo prohibido para el lado cliente se
   * descarta al final, después de sumar y de quitar.
   */
  it('a un usuario de cliente no se le cuela lo prohibido', async () => {
    const persona = await createUser({
      clientMemberships: [{ clientId, role: 'CLIENT_ADMIN' }],
    })
    const prohibida = [...CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE][0]!

    await updateMemberships(admin, {
      userId: persona.id,
      clientMemberships: [{ clientId, role: 'CLIENT_ADMIN', concedidas: [prohibida, 'campaign.view'] }],
    })

    const despues = await contextFor(persona.id)
    expect(can(despues, prohibida, clientId)).toBe(false)

    const guardado = await withSystemScope((tx) =>
      tx.clientMembership.findFirst({ where: { userId: persona.id, clientId } }),
    )
    expect(guardado?.extraCapabilities).not.toContain(prohibida)
  })

  it('no mandar permisos no le borra los que ya tenía', async () => {
    const persona = await createUser({ agencyRole: 'ACCOUNT_MANAGER', agencyClientIds: [clientId] })
    const sinPlata = AGENCY_ROLE_CAPABILITIES.ACCOUNT_MANAGER.filter((c) => c !== 'budget.view')
    await updateMemberships(admin, {
      userId: persona.id,
      agencyRole: 'ACCOUNT_MANAGER',
      agencyConcedidas: [...sinPlata],
    })

    // Un cambio que sólo toca los clientes asignados no puede tocar los permisos.
    await updateMemberships(admin, { userId: persona.id, agencyClientIds: [clientId] })

    const guardado = await withSystemScope((tx) =>
      tx.agencyMembership.findUnique({ where: { userId: persona.id } }),
    )
    expect(guardado?.deniedCapabilities).toEqual(['budget.view'])
  })
})

/**
 * La invitación tiene que llegar entera.
 *
 * Los clientes elegidos al invitar viajaban escondidos dentro de las
 * capacidades como `__client:<id>` y **nadie los leía de vuelta**: quien
 * invitaba elegía dos clientes y la persona entraba sin ninguno, viendo una
 * pantalla vacía sin entender por qué. Además esos marcadores se copiaban a la
 * membresía y la pantalla de usuarios los imprimía como si fueran permisos.
 */
describe('lo que se elige al invitar llega al aceptar', () => {
  it('guarda los clientes en su propia columna, no entre los permisos', async () => {
    await resetDatabase()
    await seedCatalogs()
    const cliente = await createClientTenant('Marca')
    const admin2 = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)

    const { id } = await inviteUser(admin2, {
      email: `am-${Date.now()}@test.local`,
      name: 'Account manager',
      kind: 'AGENCY',
      agencyRole: 'ACCOUNT_MANAGER',
      agencyClientIds: [cliente.id],
      concedidas: [...AGENCY_ROLE_CAPABILITIES.ACCOUNT_MANAGER.filter((c) => c !== 'budget.view')],
    })

    const invitacion = await withSystemScope((tx) => tx.invitation.findUnique({ where: { id } }))
    expect(invitacion?.agencyClientIds).toEqual([cliente.id])
    // Y ningún marcador se cuela entre las capacidades.
    expect(invitacion?.extraCapabilities.some((c) => c.startsWith('__client:'))).toBe(false)
    // Lo desmarcado viaja con la invitación: entra ya ajustado.
    expect(invitacion?.deniedCapabilities).toEqual(['budget.view'])
  })
})
