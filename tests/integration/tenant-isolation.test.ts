import { beforeAll, describe, expect, it } from 'vitest'
import { NotFoundError, ValidationError } from '@/lib/authz/errors'
import type { AuthContext } from '@/lib/authz/context'
import { listCampaigns, getCampaign, getBrief, upsertBrief, updateCampaign, createCampaign } from '@/lib/repos/campaigns'
import { getCandidacy, listCandidacies, createCandidacy, updateCandidacy, setCandidacyVisibility, setShortlist, changeCandidacyStatus } from '@/lib/repos/candidacies'
import { listClients, getClient } from '@/lib/repos/clients'
import { createComment, listComments } from '@/lib/repos/comments'
import { withScope } from '@/lib/db/scope'
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

/**
 * REQUISITO 1, 2 y 11: aislamiento entre tenants.
 * Un usuario del cliente A no puede listar, consultar ni modificar datos del
 * cliente B, ni cambiando ids en la URL, ni mandando ids en el payload.
 */
describe('Aislamiento entre tenants', () => {
  let clientA: { id: string }
  let clientB: { id: string }
  let campaignA: { id: string }
  let campaignB: { id: string }
  let candidacyA: string
  let candidacyB: string
  let clusterB: string
  let influencerB: string
  let userA: AuthContext
  let userB: AuthContext
  let scoutA: AuthContext

  beforeAll(async () => {
    await resetDatabase()
    await seedCatalogs()

    clientA = await createClientTenant('Cliente A')
    clientB = await createClientTenant('Cliente B')
    campaignA = await createCampaignFor(clientA.id, 'Campaña A')
    campaignB = await createCampaignFor(clientB.id, 'Campaña B')

    const influencerA = await createInfluencerWithProfile('Creador A', 'creadora')
    influencerB = await createInfluencerWithProfile('Creador B', 'creadorb')
    candidacyA = await createCandidacyFor({ clientId: clientA.id, campaignId: campaignA.id, influencerId: influencerA })
    candidacyB = await createCandidacyFor({ clientId: clientB.id, campaignId: campaignB.id, influencerId: influencerB })

    const adminUser = await createUser({ agencyRole: 'AGENCY_ADMIN' })
    const admin = await contextFor(adminUser.id)
    await upsertBrief(admin, campaignB.id, {
      clusters: [{ key: 'crypto', label: 'Crypto', targetPercent: 50 }],
    })
    const briefB = await getBrief(admin, campaignB.id)
    clusterB = briefB?.clusters[0]?.id ?? ''

    const a = await createUser({ clientMemberships: [{ clientId: clientA.id, role: 'CLIENT_ADMIN' }] })
    const b = await createUser({ clientMemberships: [{ clientId: clientB.id, role: 'CLIENT_ADMIN' }] })
    const scout = await createUser({ agencyRole: 'SCOUT', agencyClientIds: [clientA.id] })
    userA = await contextFor(a.id)
    userB = await contextFor(b.id)
    scoutA = await contextFor(scout.id)
  })

  it('1 · el listado de campañas sólo muestra las propias', async () => {
    const listA = await listCampaigns(userA, {})
    expect(listA.items).toHaveLength(1)
    expect(listA.items[0]?.clientId).toBe(clientA.id)
    expect(listA.items.some((item) => item.clientId === clientB.id)).toBe(false)
  })

  it('1 · el listado de clientes sólo muestra el propio', async () => {
    const clients = await listClients(userA)
    expect(clients.map((client) => client.id)).toEqual([clientA.id])
  })

  it('2 · cambiar el id de campaña en la URL devuelve 404, no 403', async () => {
    const error = await getCampaign(userA, campaignB.id).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(NotFoundError)
    expect((error as NotFoundError).status).toBe(404)
    // El mensaje no menciona el recurso ni revela que exista.
    expect((error as NotFoundError).message).toBe('No encontrado')
  })

  it('2 · cambiar el id de candidatura en la URL devuelve 404', async () => {
    await expect(getCandidacy(userA, candidacyB)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('2 · cambiar el id de cliente en la URL devuelve 404', async () => {
    await expect(getClient(userA, clientB.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('2 · el brief de otra campaña devuelve 404', async () => {
    await expect(getBrief(userA, campaignB.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('11 · un filtro con clientId de otro tenant se rechaza', async () => {
    await expect(listCampaigns(userA, { clientId: clientB.id })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('11 · no se puede crear una campaña en otro tenant', async () => {
    await expect(createCampaign(userA, clientB.id, { name: 'Intento' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('11 · no se puede modificar una campaña de otro tenant', async () => {
    await expect(updateCampaign(userA, campaignB.id, { name: 'Secuestrada', version: 1 })).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('11 · no se puede editar una candidatura de otro tenant', async () => {
    await expect(updateCandidacy(userA, candidacyB, { version: 1, rank: 1 })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('11 · no se puede cambiar el estado de una candidatura de otro tenant', async () => {
    await expect(changeCandidacyStatus(userA, candidacyB, 'APROBADO')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('11 · un lote de visibilidad con un id ajeno falla entero', async () => {
    // La agencia de A tampoco puede tocar la candidatura de B mezclándola en un lote.
    await expect(setCandidacyVisibility(scoutA, [candidacyA, candidacyB], true)).rejects.toBeInstanceOf(NotFoundError)
    // Y la candidatura propia queda como estaba: la operación es atómica.
    const own = await getCandidacy(scoutA, candidacyA)
    expect(own.clientVisible).toBe(true)
  })

  it('11 · una shortlist con una candidatura de otra campaña se rechaza', async () => {
    await expect(setShortlist(scoutA, campaignA.id, [{ candidacyId: candidacyB, order: 1 }])).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('11 · no se puede asignar un cluster de otra campaña a una candidatura propia', async () => {
    const candidacy = await getCandidacy(scoutA, candidacyA)
    await expect(
      updateCandidacy(scoutA, candidacyA, { version: candidacy.version, clusterId: clusterB }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('11 · no se puede agregar un influencer a una campaña de otro tenant', async () => {
    await expect(createCandidacy(userA, campaignB.id, influencerB)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('11 · no se puede comentar en una candidatura de otro tenant', async () => {
    await expect(
      createComment(userA, { candidacyId: candidacyB }, 'Hola', 'CLIENT_AUTHORED'),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('1 · los comentarios de otro tenant no se leen', async () => {
    await expect(listComments(userA, { campaignId: campaignB.id })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('1 · cada usuario ve sólo sus candidaturas', async () => {
    const listA = await listCandidacies(userA, campaignA.id)
    const listB = await listCandidacies(userB, campaignB.id)
    expect(listA.items.map((item) => item.id)).toEqual([candidacyA])
    expect(listB.items.map((item) => item.id)).toEqual([candidacyB])
  })

  it('RLS · aunque la aplicación fallara, la base filtra por tenant', async () => {
    // Se consulta SIN pasar por los repositorios, simulando un `where` incompleto.
    const rows = await withScope(userA.db, (tx) => tx.candidacy.findMany({}))
    expect(rows.map((row) => row.id)).toEqual([candidacyA])

    const campaigns = await withScope(userA.db, (tx) => tx.campaign.findMany({}))
    expect(campaigns.map((row) => row.id)).toEqual([campaignA.id])

    // Un UPDATE masivo tampoco alcanza al otro tenant.
    const updated = await withScope(userA.db, (tx) =>
      tx.candidacy.updateMany({ where: {}, data: { rank: 99 } }),
    )
    expect(updated.count).toBe(1)
  })
})
