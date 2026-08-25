import { beforeAll, describe, expect, it } from 'vitest'
import { ForbiddenError, NotFoundError } from '@/lib/authz/errors'
import type { AuthContext } from '@/lib/authz/context'
import { exportCampaignCandidacies } from '@/lib/repos/exports'
import { changeCandidacyStatus, setClientApproval } from '@/lib/repos/candidacies'
import { updateCampaign } from '@/lib/repos/campaigns'
import { listAudit } from '@/lib/repos/audit'
import { withScope, withSystemScope } from '@/lib/db/scope'
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

/** REQUISITOS 8 y 10: exportaciones acotadas y auditoría de transiciones. */
describe('Exportaciones y auditoría', () => {
  let clientId: string
  let campaignId: string
  let candidacyId: string
  let reviewer: AuthContext
  let scout: AuthContext
  let finance: AuthContext
  let agencyAdmin: AuthContext

  beforeAll(async () => {
    await resetDatabase()
    await seedCatalogs()
    const client = await createClientTenant('Cliente Export')
    clientId = client.id
    const campaign = await createCampaignFor(clientId, 'Campaña Export')
    campaignId = campaign.id
    const influencerId = await createInfluencerWithProfile('Creador Export', 'export')
    candidacyId = await createCandidacyFor({ clientId, campaignId, influencerId })

    const mk = async (spec: Parameters<typeof createUser>[0]) => contextFor((await createUser(spec)).id)
    reviewer = await mk({ clientMemberships: [{ clientId, role: 'CLIENT_REVIEWER' }] })
    scout = await mk({ agencyRole: 'SCOUT', agencyClientIds: [clientId] })
    finance = await mk({ agencyRole: 'FINANCE', agencyClientIds: [clientId] })
    agencyAdmin = await mk({ agencyRole: 'AGENCY_ADMIN' })
  })

  it('8 · la exportación del cliente no incluye presupuesto ni notas internas', async () => {
    const result = await exportCampaignCandidacies(reviewer, campaignId)
    expect(result.body).toContain('Creador Export')
    expect(result.body).not.toContain('Presupuesto solicitado')
    expect(result.body).not.toContain('Notas internas')
    expect(result.body).not.toContain('MARGEN INTERNO')
    expect(result.body).not.toContain('1200')
  })

  it('8 · la exportación de finanzas sí incluye la columna de presupuesto', async () => {
    const result = await exportCampaignCandidacies(finance, campaignId)
    expect(result.body).toContain('Presupuesto solicitado')
    expect(result.body).toContain('1200')
  })

  it('8 · la exportación del scout incluye notas internas pero no presupuesto', async () => {
    const result = await exportCampaignCandidacies(scout, campaignId)
    expect(result.body).toContain('Notas internas')
    expect(result.body).not.toContain('Presupuesto solicitado')
  })

  it('8 · no se puede exportar una campaña de otro tenant', async () => {
    const other = await createClientTenant('Otro Export')
    const otherCampaign = await createCampaignFor(other.id, 'Ajena')
    await expect(exportCampaignCandidacies(reviewer, otherCampaign.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('8 · si la agencia deshabilita exportaciones, el cliente no puede descargar', async () => {
    await withSystemScope((tx) => tx.client.update({ where: { id: clientId }, data: { allowClientExports: false } }))
    const refreshed = await contextFor(reviewer.user.id)
    await expect(exportCampaignCandidacies(refreshed, campaignId)).rejects.toBeInstanceOf(ForbiddenError)
    await withSystemScope((tx) => tx.client.update({ where: { id: clientId }, data: { allowClientExports: true } }))
  })

  it('8 · cada exportación queda auditada con las columnas entregadas', async () => {
    await exportCampaignCandidacies(finance, campaignId)
    const audit = await listAudit(agencyAdmin, { action: 'export.created' })
    expect(audit.total).toBeGreaterThan(0)
    const last = audit.items[0]
    expect(last?.entityId).toBe(campaignId)
    expect(JSON.stringify(last?.metadata)).toContain('Presupuesto solicitado')
  })

  it('10 · cada transición de estado queda registrada con usuario y fecha', async () => {
    await changeCandidacyStatus(scout, candidacyId, 'CONTACTAR', 'Le escribimos por DM')

    const events = await withScope(scout.db, (tx) =>
      tx.candidacyStatusEvent.findMany({ where: { candidacyId }, orderBy: { createdAt: 'desc' } }),
    )
    const last = events[0]
    expect(last?.toStatusKey).toBe('CONTACTAR')
    expect(last?.fromStatusKey).toBe('PROPUESTO')
    expect(last?.actorEmail).toBe(scout.user.email)
    expect(last?.comment).toBe('Le escribimos por DM')
    expect(last?.createdAt).toBeInstanceOf(Date)

    const audit = await listAudit(agencyAdmin, { action: 'candidacy.status.changed' })
    expect(audit.total).toBeGreaterThan(0)
    expect(JSON.stringify(audit.items[0]?.after)).toContain('CONTACTAR')
  })

  it('10 · la aprobación del cliente queda auditada', async () => {
    await setClientApproval(reviewer, candidacyId, 'APPROVED', 'Nos gusta')
    const audit = await listAudit(agencyAdmin, { action: 'candidacy.approval' })
    expect(audit.total).toBeGreaterThan(0)
    expect(audit.items[0]?.actorEmail).toBe(reviewer.user.email)
    expect(JSON.stringify(audit.items[0]?.after)).toContain('APPROVED')
  })

  it('10 · un cambio de presupuesto deja su propio evento', async () => {
    await updateCampaign(finance, campaignId, { name: 'Campaña Export', version: 1, budgetEstimated: 15_000 })
    const audit = await listAudit(agencyAdmin, { action: 'budget.changed' })
    expect(audit.total).toBeGreaterThan(0)
    expect(JSON.stringify(audit.items[0]?.after)).toContain('15000')
  })

  it('10 · el log de auditoría es inmutable incluso para la aplicación', async () => {
    const row = await withScope(agencyAdmin.db, (tx) => tx.auditLog.findFirst({}))
    expect(row).not.toBeNull()

    const update = await withScope(agencyAdmin.db, (tx) =>
      tx.auditLog.updateMany({ where: { id: row?.id }, data: { action: 'ADULTERADO' } }),
    ).catch((error: unknown) => error)
    expect(update).toBeInstanceOf(Error)

    const remove = await withScope(agencyAdmin.db, (tx) =>
      tx.auditLog.deleteMany({ where: { id: row?.id } }),
    ).catch((error: unknown) => error)
    expect(remove).toBeInstanceOf(Error)
  })

  it('10 · la auditoría no guarda contraseñas ni tokens', async () => {
    const audit = await listAudit(agencyAdmin, {}, { pageSize: 100 })
    const serialized = JSON.stringify(audit.items)
    expect(serialized).not.toContain('scrypt$')
    expect(serialized).not.toMatch(/"passwordHash":"(?!\[redactado\])/)
    expect(serialized).not.toMatch(/"tokenHash":"(?!\[redactado\])/)
  })

  it('la auditoría de un tenant no se ve desde otro', async () => {
    const other = await createClientTenant('Otro Auditoría')
    const otherAdmin = await contextFor(
      (await createUser({ clientMemberships: [{ clientId: other.id, role: 'CLIENT_ADMIN' }] })).id,
    )
    await expect(listAudit(otherAdmin, {})).rejects.toBeInstanceOf(ForbiddenError)
  })
})
