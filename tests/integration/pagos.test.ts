import { beforeEach, describe, expect, it } from 'vitest'
import { crearMovimiento, getPlan, guardarTerminos, marcarPagado } from '@/lib/repos/pagos'
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
 * La pestaña de Pagos tiene los márgenes de la agencia.
 *
 * Dos cosas se prueban acá y son de distinta naturaleza: que nadie de afuera
 * pueda mirarla, y que los números que muestra no inventen nada.
 */
describe('Pagos de una campaña', () => {
  let agencia: AuthContext
  let clientId: string
  let campaignId: string
  let candidacyId: string

  beforeEach(async () => {
    await resetDatabase()
    await seedCatalogs()
    clientId = (await createClientTenant('Marca')).id
    campaignId = (await createCampaignFor(clientId, 'Ronda uno')).id
    const influencerId = await createInfluencerWithProfile('Ana Pérez', 'anaperez')
    candidacyId = await createCandidacyFor({
      clientId,
      campaignId,
      influencerId,
      statusKey: 'CONFIRMADO',
    })
    agencia = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)
  })

  it('un usuario del cliente no puede ver los números', async () => {
    const cliente = await contextFor(
      (await createUser({ clientMemberships: [{ clientId, role: 'CLIENT_ADMIN' }] })).id,
    )
    await expect(getPlan(cliente, campaignId)).rejects.toThrow()
  })

  it('un empleado de agencia sin budget.view tampoco', async () => {
    // No alcanza con ser de la agencia: cuánto se gana con un cliente es un
    // permiso aparte, no una consecuencia de trabajar acá.
    const empleado = await contextFor(
      (await createUser({ agencyRole: 'SCOUT', agencyClientIds: [clientId] })).id,
    )
    await expect(getPlan(empleado, campaignId)).rejects.toThrow()
  })

  it('una campaña de otro cliente no existe para esta agencia acotada', async () => {
    const otro = (await createClientTenant('Otra marca')).id
    const acotado = await contextFor((await createUser({ agencyRole: 'ACCOUNT_MANAGER', agencyClientIds: [otro] })).id)
    await expect(getPlan(acotado, campaignId)).rejects.toThrow()
  })

  it('suma el cachet acordado y calcula el fee sobre eso', async () => {
    await guardarTerminos(agencia, campaignId, {
      feeMode: 'PERCENT',
      feePercent: 20,
      feeFixed: null,
      productionCost: null,
      adSpend: null,
      terms: null,
      notes: null,
    })

    const plan = await getPlan(agencia, campaignId)
    // La candidatura de prueba trae budgetNegotiated 987.65.
    expect(plan.cuentas.inversionEnTalento).toBeCloseTo(987.65, 2)
    expect(plan.cuentas.feeDeAgencia).toBeCloseTo(197.53, 2)
    expect(plan.cuentas.totalAlCliente).toBeCloseTo(1185.18, 2)
    expect(plan.cuentas.faltaParaCotizar).toEqual([])
  })

  it('sin porcentaje definido no inventa un total', async () => {
    await guardarTerminos(agencia, campaignId, {
      feeMode: 'PERCENT',
      feePercent: null,
      feeFixed: null,
      productionCost: null,
      adSpend: null,
      terms: null,
      notes: null,
    })
    const plan = await getPlan(agencia, campaignId)
    expect(plan.cuentas.feeDeAgencia).toBeNull()
    expect(plan.cuentas.totalAlCliente).toBeNull()
    expect(plan.cuentas.faltaParaCotizar).toContain('el porcentaje de la agencia')
  })

  it('los perfiles que todavía no están confirmados no cuestan plata', async () => {
    const otro = await createInfluencerWithProfile('Beto Gómez', 'betogomez')
    await createCandidacyFor({ clientId, campaignId, influencerId: otro, statusKey: 'EN_SCREENING' })

    const plan = await getPlan(agencia, campaignId)
    // Sumar a quien está en screening infla la cotización con gente que capaz
    // nunca participe.
    expect(plan.talento).toHaveLength(1)
    expect(plan.cuentas.inversionEnTalento).toBeCloseTo(987.65, 2)
  })

  it('lleva la cuenta de lo cobrado y lo adeudado en cada dirección', async () => {
    await crearMovimiento(agencia, campaignId, {
      direction: 'AGENCY_IN',
      status: 'PAID',
      amount: 500,
      concept: 'Anticipo del cliente',
      candidacyId: null,
      dueDate: null,
      paidAt: null,
      method: null,
      reference: null,
      notes: null,
      documento: null,
    })
    const pendiente = await crearMovimiento(agencia, campaignId, {
      direction: 'TALENT_OUT',
      status: 'PENDING',
      amount: 300,
      concept: 'Cachet de Ana',
      candidacyId,
      dueDate: null,
      paidAt: null,
      method: null,
      reference: null,
      notes: null,
      documento: null,
    })

    let plan = await getPlan(agencia, campaignId)
    expect(plan.saldos.AGENCY_IN.pagado).toBe(500)
    expect(plan.saldos.TALENT_OUT.pendiente).toBe(300)
    expect(plan.talento[0]?.pendiente).toBe(300)
    expect(plan.talento[0]?.pagado).toBe(0)

    await marcarPagado(agencia, pendiente.id, true)
    plan = await getPlan(agencia, campaignId)
    expect(plan.saldos.TALENT_OUT.pagado).toBe(300)
    expect(plan.saldos.TALENT_OUT.pendiente).toBe(0)
    expect(plan.talento[0]?.pagado).toBe(300)
  })

  it('no deja anotar un pago contra alguien de otra campaña', async () => {
    const otraCampana = (await createCampaignFor(clientId, 'Ronda dos')).id
    await expect(
      crearMovimiento(agencia, otraCampana, {
        direction: 'TALENT_OUT',
        status: 'PENDING',
        amount: 100,
        concept: 'Cachet cruzado',
        candidacyId,
        dueDate: null,
        paidAt: null,
        method: null,
        reference: null,
        notes: null,
        documento: null,
      }),
    ).rejects.toThrow(/no está en esta campaña/i)
  })

  it('marcar como pagado sin decir cuándo completa la fecha sola', async () => {
    // Un cobro sin fecha es un cobro que nadie puede ubicar en el tiempo.
    const creado = await crearMovimiento(agencia, campaignId, {
      direction: 'AGENCY_IN',
      status: 'PAID',
      amount: 100,
      concept: 'Pago contado',
      candidacyId: null,
      dueDate: null,
      paidAt: null,
      method: null,
      reference: null,
      notes: null,
      documento: null,
    })
    const plan = await getPlan(agencia, campaignId)
    expect(plan.movimientos.find((m) => m.id === creado.id)?.paidAt).not.toBeNull()
  })
})
