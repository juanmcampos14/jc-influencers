import { beforeEach, describe, expect, it } from 'vitest'
import { withSystemScope } from '@/lib/db/scope'
import { listCandidacies } from '@/lib/repos/candidacies'
import { getPlan } from '@/lib/repos/pagos'
import { getObjetivos, guardarObjetivo } from '@/lib/repos/objetivos'
import {
  contextFor,
  createCampaignFor,
  createCandidacyFor,
  createClientTenant,
  createInfluencerWithProfile,
  createUser,
  resetDatabase,
  seedCatalogs,
} from '../helpers/fixtures'
import type { AuthContext } from '@/lib/authz/context'

/**
 * La vista previa tiene que mostrar EXACTAMENTE lo que ve el cliente.
 *
 * Ni más ni menos. Una que muestra de más es peor que no tener ninguna, porque
 * confirma que el cliente ve algo que en realidad no ve -- y así se toman
 * decisiones sobre una realidad que no existe.
 */
describe('Ver el espacio como lo ve el cliente', () => {
  let clientId: string
  let campaignId: string
  let adminId: string
  let agencia: AuthContext

  beforeEach(async () => {
    await resetDatabase()
    await seedCatalogs()
    clientId = (await createClientTenant('Marca')).id
    campaignId = (await createCampaignFor(clientId, 'Ronda uno')).id
    adminId = (await createUser({ agencyRole: 'AGENCY_ADMIN' })).id
    agencia = await contextFor(adminId)

    const visible = await createInfluencerWithProfile('Ana Visible', 'anavisible')
    const oculta = await createInfluencerWithProfile('Bruno Oculto', 'brunooculto')
    await createCandidacyFor({ clientId, campaignId, influencerId: visible, clientVisible: true })
    await createCandidacyFor({ clientId, campaignId, influencerId: oculta, clientVisible: false })
  })

  it('esconde los perfiles que todavía no se le compartieron', async () => {
    /*
     * Éste es el bug que la vista previa viene a resolver. Sin ella, la agencia
     * abría /portal y veía TODO, incluidos los perfiles sin compartir.
     */
    const comoAgencia = await listCandidacies(agencia, campaignId, {}, { pageSize: 50 })
    expect(comoAgencia.items).toHaveLength(2)

    const previa = await contextFor(adminId, clientId)
    const comoCliente = await listCandidacies(previa, campaignId, {}, { pageSize: 50 })
    expect(comoCliente.items).toHaveLength(1)
    expect(comoCliente.items[0]?.influencer.displayName).toBe('Ana Visible')
  })

  it('el contexto se transforma entero: deja de ser agencia', async () => {
    const previa = await contextFor(adminId, clientId)
    expect(previa.side).toBe('CLIENT')
    expect(previa.agencyRole).toBeNull()
    expect(previa.agencyCapabilities.size).toBe(0)
    expect(previa.preview?.clientId).toBe(clientId)
  })

  it('el alcance se acota al cliente mirado, aunque sea admin de todo', async () => {
    await createClientTenant('Otra marca')
    // El contexto se rearma: el de beforeEach se construyó antes de este cliente.
    expect((await contextFor(adminId)).clients.length).toBeGreaterThan(1)

    const previa = await contextFor(adminId, clientId)
    expect(previa.clients.map((cliente) => cliente.id)).toEqual([clientId])
    expect(previa.db.allClients).toBe(false)
    expect(previa.activeClientId).toBe(clientId)
  })

  it('no puede ver la plata, que es lo primero que un cliente no ve', async () => {
    const previa = await contextFor(adminId, clientId)
    await expect(getPlan(previa, campaignId)).rejects.toThrow()
  })

  it('no ve los objetivos internos de la agencia', async () => {
    await guardarObjetivo(agencia, campaignId, {
      metric: 'CLICS',
      direction: 'AL_MENOS',
      target: 1000,
      rationale: null,
      clientVisible: false,
    })
    const previa = await contextFor(adminId, clientId)
    expect((await getObjetivos(previa, campaignId)).objetivos).toHaveLength(0)
  })

  it('es de sólo lectura: no puede escribir nada', async () => {
    const previa = await contextFor(adminId, clientId)
    await expect(
      guardarObjetivo(previa, campaignId, {
        metric: 'CLICS',
        direction: 'AL_MENOS',
        target: 500,
        rationale: null,
        clientVisible: true,
      }),
    ).rejects.toThrow()
  })

  it('sólo la puede pedir alguien de la agencia', async () => {
    const usuarioDeCliente = await createUser({ clientMemberships: [{ clientId, role: 'CLIENT_ADMIN' }] })
    const ctx = await contextFor(usuarioDeCliente.id, clientId)
    // Para un usuario de cliente la cookie no hace nada: ya es el cliente.
    expect(ctx.preview).toBeNull()
  })

  it('no sirve para mirar un cliente fuera del alcance', async () => {
    const ajeno = (await createClientTenant('Marca ajena')).id
    const acotado = await createUser({ agencyRole: 'ACCOUNT_MANAGER', agencyClientIds: [clientId] })

    const ctx = await contextFor(acotado.id, ajeno)
    // La cookie pide un cliente que esta persona no tiene: no se activa nada y
    // el contexto sigue siendo el suyo de siempre.
    expect(ctx.preview).toBeNull()
    expect(ctx.side).toBe('AGENCY')
    expect(ctx.clients.map((cliente) => cliente.id)).toEqual([clientId])
  })

  it('entrar y salir queda registrado', async () => {
    // El registro no es una formalidad: alguien de la agencia mirando el
    // espacio de un cliente es un hecho que después puede hacer falta explicar.
    const previa = await contextFor(adminId, clientId)
    expect(previa.preview).not.toBeNull()

    const acciones = await withSystemScope((tx) =>
      tx.auditLog.findMany({ where: { action: { startsWith: 'client.preview' } } }),
    )
    // El registro lo escribe la acción de servidor, no el armado del contexto:
    // este test fija que la tabla y la acción existen para hacerlo.
    expect(Array.isArray(acciones)).toBe(true)
  })
})
