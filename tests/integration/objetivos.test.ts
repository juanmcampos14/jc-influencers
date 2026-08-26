import { beforeEach, describe, expect, it } from 'vitest'
import { getObjetivos, guardarObjetivo } from '@/lib/repos/objetivos'
import { withSystemScope } from '@/lib/db/scope'
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

describe('Objetivos de campaña', () => {
  let agencia: AuthContext
  let clientId: string
  let campaignId: string

  beforeEach(async () => {
    await resetDatabase()
    await seedCatalogs()
    clientId = (await createClientTenant('Marca')).id
    campaignId = (await createCampaignFor(clientId, 'Ronda uno')).id
    agencia = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)
  })

  const objetivoDeClics = (target = 1000, clientVisible = true) =>
    guardarObjetivo(agencia, campaignId, {
      metric: 'CLICS',
      direction: 'AL_MENOS',
      target,
      rationale: 'Es el piso que pidió la marca.',
      clientVisible,
    })

  it('un objetivo sin métrica cargada NO figura como incumplido', async () => {
    await objetivoDeClics()
    const resumen = await getObjetivos(agencia, campaignId)
    expect(resumen.objetivos[0]?.estado).toBe('SIN_DATO')
    expect(resumen.objetivos[0]?.progreso).toBeNull()
    expect(resumen.noAlcanzados).toBe(0)
  })

  it('mide los perfiles aprobados de verdad', async () => {
    const influencerId = await createInfluencerWithProfile('Ana Pérez', 'anaperez')
    const candidacyId = await createCandidacyFor({ clientId, campaignId, influencerId })
    await withSystemScope((tx) =>
      tx.candidacy.update({ where: { id: candidacyId }, data: { clientApproval: 'APPROVED' } }),
    )

    await guardarObjetivo(agencia, campaignId, {
      metric: 'PERFILES_APROBADOS',
      direction: 'AL_MENOS',
      target: 1,
      rationale: null,
      clientVisible: true,
    })

    const resumen = await getObjetivos(agencia, campaignId)
    expect(resumen.objetivos[0]?.actual).toBe(1)
    expect(resumen.objetivos[0]?.estado).toBe('CUMPLIDO')
  })

  it('el cliente no ve un objetivo marcado como interno', async () => {
    await objetivoDeClics(1000, false)
    const cliente = await contextFor(
      (await createUser({ clientMemberships: [{ clientId, role: 'CLIENT_ADMIN' }] })).id,
    )
    const resumen = await getObjetivos(cliente, campaignId)
    expect(resumen.objetivos).toHaveLength(0)
  })

  it('el cliente NUNCA ve un tope de inversión, aunque esté marcado visible', async () => {
    // De ese número se deduce el margen de la agencia.
    await guardarObjetivo(agencia, campaignId, {
      metric: 'INVERSION_EN_TALENTO',
      direction: 'COMO_MUCHO',
      target: 5000,
      rationale: null,
      clientVisible: true,
    })
    const cliente = await contextFor(
      (await createUser({ clientMemberships: [{ clientId, role: 'CLIENT_ADMIN' }] })).id,
    )
    const resumen = await getObjetivos(cliente, campaignId)
    expect(JSON.stringify(resumen)).not.toContain('5000')
    expect(resumen.objetivos).toHaveLength(0)
  })

  it('sin permiso de plata, la inversión ni se calcula', async () => {
    const scout = await contextFor(
      (await createUser({ agencyRole: 'SCOUT', agencyClientIds: [clientId] })).id,
    )
    const resumen = await getObjetivos(scout, campaignId)
    expect(resumen.mediciones.INVERSION_EN_TALENTO).toBeNull()
  })

  it('un tope de plata sólo lo pone quien maneja plata', async () => {
    const scout = await contextFor(
      (await createUser({ agencyRole: 'SCOUT', agencyClientIds: [clientId] })).id,
    )
    await expect(
      guardarObjetivo(scout, campaignId, {
        metric: 'INVERSION_EN_TALENTO',
        direction: 'COMO_MUCHO',
        target: 5000,
        rationale: null,
        clientVisible: false,
      }),
    ).rejects.toThrow()
  })

  it('guardar dos veces la misma métrica actualiza, no duplica', async () => {
    await objetivoDeClics(1000)
    await objetivoDeClics(2000)
    const resumen = await getObjetivos(agencia, campaignId)
    expect(resumen.objetivos).toHaveLength(1)
    expect(resumen.objetivos[0]?.target).toBe(2000)
  })

  it('una campaña de otro cliente no existe', async () => {
    const otro = (await createClientTenant('Otra marca')).id
    const acotado = await contextFor(
      (await createUser({ agencyRole: 'ACCOUNT_MANAGER', agencyClientIds: [otro] })).id,
    )
    await expect(getObjetivos(acotado, campaignId)).rejects.toThrow()
  })
})
