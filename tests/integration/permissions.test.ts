import { beforeAll, describe, expect, it } from 'vitest'
import { ForbiddenError, NotFoundError } from '@/lib/authz/errors'
import type { AuthContext } from '@/lib/authz/context'
import { can, capabilitiesFor } from '@/lib/authz/context'
import { getCampaign } from '@/lib/repos/campaigns'
import { getCandidacy, listCandidacies, setClientApproval, updateCandidacy } from '@/lib/repos/candidacies'
import { createComment, listComments } from '@/lib/repos/comments'
import { searchInfluencers, getInfluencer } from '@/lib/repos/influencers'
import { inviteUser, updateMemberships, setUserStatus } from '@/lib/repos/users'
import { listAudit } from '@/lib/repos/audit'
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

/**
 * REQUISITOS 3, 4, 7 y 12: qué puede ver y hacer cada rol,
 * y qué nunca aparece serializado hacia el cliente.
 */
describe('Roles y campos sensibles', () => {
  let clientId: string
  let campaignId: string
  let candidacyId: string
  let hiddenCandidacyId: string
  let influencerId: string

  let reviewer: AuthContext
  let viewer: AuthContext
  let clientAdmin: AuthContext
  let scout: AuthContext
  let finance: AuthContext
  let accountManager: AuthContext
  let agencyAdmin: AuthContext

  beforeAll(async () => {
    await resetDatabase()
    await seedCatalogs()

    const client = await createClientTenant('Cliente Único')
    clientId = client.id
    const campaign = await createCampaignFor(clientId, 'Campaña de prueba')
    campaignId = campaign.id
    influencerId = await createInfluencerWithProfile('Creador Visible', 'visible')
    const hiddenInfluencer = await createInfluencerWithProfile('Creador Oculto', 'oculto')
    candidacyId = await createCandidacyFor({ clientId, campaignId, influencerId })
    hiddenCandidacyId = await createCandidacyFor({
      clientId,
      campaignId,
      influencerId: hiddenInfluencer,
      clientVisible: false,
      statusKey: 'EN_SCREENING',
    })

    const mk = async (spec: Parameters<typeof createUser>[0]) => contextFor((await createUser(spec)).id)
    reviewer = await mk({ clientMemberships: [{ clientId, role: 'CLIENT_REVIEWER' }] })
    viewer = await mk({ clientMemberships: [{ clientId, role: 'CLIENT_VIEWER' }] })
    clientAdmin = await mk({ clientMemberships: [{ clientId, role: 'CLIENT_ADMIN' }] })
    scout = await mk({ agencyRole: 'SCOUT', agencyClientIds: [clientId] })
    finance = await mk({ agencyRole: 'FINANCE', agencyClientIds: [clientId] })
    accountManager = await mk({ agencyRole: 'ACCOUNT_MANAGER', agencyClientIds: [clientId] })
    agencyAdmin = await mk({ agencyRole: 'AGENCY_ADMIN' })

    // Notas internas y feedback visible, para comprobar el filtro por visibilidad.
    await createComment(accountManager, { candidacyId }, 'NOTA INTERNA DE AGENCIA', 'INTERNAL')
    await createComment(accountManager, { candidacyId }, 'Comentario para el cliente', 'CLIENT_VISIBLE')
    await createComment(finance, { candidacyId }, 'MARGEN 40%', 'BUDGET_PRIVATE')
  })

  it('3 · el revisor no recibe notas internas ni presupuesto en el objeto serializado', async () => {
    const candidacy = await getCandidacy(reviewer, candidacyId)
    // No es que estén en null: la clave directamente no existe.
    expect('internalNotes' in candidacy).toBe(false)
    expect('budget' in candidacy).toBe(false)
    expect(JSON.stringify(candidacy)).not.toContain('MARGEN INTERNO')
    expect(JSON.stringify(candidacy)).not.toContain('NOTA INTERNA')
  })

  it('12 · tampoco llegan las notas internas del influencer ni su contacto', async () => {
    const candidacy = await getCandidacy(reviewer, candidacyId)
    expect('internalNotes' in candidacy.influencer).toBe(false)
    expect('contact' in candidacy.influencer).toBe(false)
    const serialized = JSON.stringify(candidacy)
    expect(serialized).not.toContain('NOTA INTERNA SECRETA')
    expect(serialized).not.toContain('@contacto.test')
  })

  it('12 · el listado completo del cliente no filtra ningún campo interno', async () => {
    const page = await listCandidacies(reviewer, campaignId)
    const serialized = JSON.stringify(page)
    for (const secret of ['NOTA INTERNA', 'MARGEN INTERNO', 'budgetPrivateNotes', 'contactEmail', '1200', '900']) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('3 · el revisor no ve los comentarios internos ni los de presupuesto', async () => {
    const comments = await listComments(reviewer, { candidacyId })
    const bodies = comments.map((comment) => comment.body)
    expect(bodies).toContain('Comentario para el cliente')
    expect(bodies).not.toContain('NOTA INTERNA DE AGENCIA')
    expect(bodies).not.toContain('MARGEN 40%')
  })

  it('3 · el scout ve notas internas pero no presupuesto (permiso separado)', async () => {
    const candidacy = await getCandidacy(scout, candidacyId)
    expect(candidacy.internalNotes).toContain('NOTA INTERNA')
    expect('budget' in candidacy).toBe(false)

    const comments = await listComments(scout, { candidacyId })
    expect(comments.map((c) => c.body)).toContain('NOTA INTERNA DE AGENCIA')
    expect(comments.map((c) => c.body)).not.toContain('MARGEN 40%')
  })

  it('3 · finanzas ve presupuesto', async () => {
    const candidacy = await getCandidacy(finance, candidacyId)
    expect(candidacy.budget?.negotiated).toBe(900)
    expect(candidacy.budget?.privateNotes).toContain('MARGEN INTERNO')
  })

  it('3 · el presupuesto de la campaña tampoco llega al cliente', async () => {
    const forClient = await getCampaign(reviewer, campaignId)
    expect('budget' in forClient).toBe(false)
    const forFinance = await getCampaign(finance, campaignId)
    expect(forFinance.budget?.estimated).toBe(10_000)
  })

  it('12 · una candidatura no marcada como visible no existe para el cliente', async () => {
    await expect(getCandidacy(reviewer, hiddenCandidacyId)).rejects.toBeInstanceOf(NotFoundError)
    const page = await listCandidacies(reviewer, campaignId)
    expect(page.items.map((item) => item.id)).toEqual([candidacyId])
    // La agencia sí las ve todas.
    const agencyPage = await listCandidacies(scout, campaignId)
    expect(agencyPage.total).toBe(2)
  })

  it('4 · el lector no puede aprobar', async () => {
    await expect(setClientApproval(viewer, candidacyId, 'APPROVED')).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('4 · el lector no puede comentar', async () => {
    await expect(createComment(viewer, { candidacyId }, 'Me gusta', 'CLIENT_AUTHORED')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('4 · el revisor sí puede aprobar y comentar', async () => {
    await setClientApproval(reviewer, candidacyId, 'APPROVED', 'Nos sirve.')
    const candidacy = await getCandidacy(reviewer, candidacyId)
    expect(candidacy.clientApproval).toBe('APPROVED')
  })

  it('4 · rechazar sin motivo se rechaza', async () => {
    const error = await setClientApproval(reviewer, candidacyId, 'REJECTED').catch((caught: unknown) => caught)
    expect((error as Error).name).toBe('ValidationError')
  })

  it('4 · un usuario de cliente no puede escribir una nota interna aunque lo pida explícitamente', async () => {
    await expect(createComment(reviewer, { candidacyId }, 'Colar nota', 'INTERNAL')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    await expect(createComment(reviewer, { candidacyId }, 'Colar margen', 'BUDGET_PRIVATE')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('4 · un usuario de cliente no puede editar la candidatura', async () => {
    const candidacy = await getCandidacy(reviewer, candidacyId)
    await expect(
      updateCandidacy(reviewer, candidacyId, { version: candidacy.version, rank: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('12 · un usuario de cliente no puede recorrer la base global de influencers', async () => {
    await expect(searchInfluencers(clientAdmin, {})).rejects.toBeInstanceOf(NotFoundError)
    await expect(getInfluencer(clientAdmin, influencerId)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('7 · un administrador de cliente no puede darse permisos de agencia', async () => {
    await expect(
      updateMemberships(clientAdmin, { userId: clientAdmin.user.id, agencyRole: 'AGENCY_ADMIN' }),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('7 · un administrador de cliente no puede invitar empleados de agencia', async () => {
    await expect(
      inviteUser(clientAdmin, { email: 'colado@test.local', name: 'Colado', kind: 'AGENCY', agencyRole: 'AGENCY_ADMIN' }),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('7 · un administrador de cliente no puede desactivar usuarios', async () => {
    await expect(setUserStatus(clientAdmin, scout.user.id, false)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('7 · las capacidades prohibidas se limpian aunque estén guardadas en la membresía', async () => {
    // Se fuerza en base una capacidad interna en la membresía de un usuario de cliente.
    await withSystemScope((tx) =>
      tx.clientMembership.updateMany({
        where: { userId: clientAdmin.user.id, clientId },
        data: { extraCapabilities: ['internal_notes.view', 'budget.view', 'client.manage'] },
      }),
    )
    const refreshed = await contextFor(clientAdmin.user.id)
    const caps = capabilitiesFor(refreshed, clientId)
    expect(caps.has('internal_notes.view')).toBe(false)
    expect(caps.has('budget.view')).toBe(false)
    expect(caps.has('client.manage')).toBe(false)

    const candidacy = await getCandidacy(refreshed, candidacyId)
    expect('internalNotes' in candidacy).toBe(false)
    expect('budget' in candidacy).toBe(false)
  })

  it('7 · nadie puede otorgar una capacidad que no tiene', async () => {
    const invitation = await inviteUser(accountManager, {
      email: `colega-${Date.now()}@test.local`,
      name: 'Colega',
      kind: 'CLIENT',
      clientId,
      clientRole: 'CLIENT_REVIEWER',
      extraCapabilities: ['user.invite', 'export.create'],
    }).catch((error: unknown) => error)
    // El account manager de este test no tiene `user.invite`, así que ni siquiera puede invitar.
    expect(invitation).toBeInstanceOf(ForbiddenError)
  })

  it('el account manager no accede a la auditoría sin el permiso separado', async () => {
    await expect(listAudit(accountManager, {})).rejects.toBeInstanceOf(ForbiddenError)
    await expect(listAudit(agencyAdmin, {})).resolves.toBeDefined()
  })

  it('el alcance del account manager se limita a los clientes asignados', async () => {
    const otherClient = await createClientTenant('Otro Cliente')
    expect(can(accountManager, 'campaign.view', otherClient.id)).toBe(false)
    expect(accountManager.clients.map((client) => client.id)).toEqual([clientId])
    // El administrador de agencia sí llega a todos.
    const refreshedAdmin = await contextFor(agencyAdmin.user.id)
    expect(refreshedAdmin.clients.map((client) => client.id)).toContain(otherClient.id)
  })
})
