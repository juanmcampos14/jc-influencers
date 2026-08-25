import { beforeAll, describe, expect, it } from 'vitest'
import type { AuthContext } from '@/lib/authz/context'
import { confirmImport, previewImport, cancelImport } from '@/lib/import/runner'
import { parseWorkbook } from '@/lib/import/excel'
import { withScope, withSystemScope } from '@/lib/db/scope'
import { searchInfluencers, listOpenDuplicates } from '@/lib/repos/influencers'
import { NotFoundError } from '@/lib/authz/errors'
import { buildTestWorkbook } from '../helpers/build-workbook'
import { contextFor, createClientTenant, createUser, resetDatabase, seedCatalogs } from '../helpers/fixtures'

/** REQUISITO 9: el importador es idempotente y reporta antes de escribir. */
describe('Importador de Excel', () => {
  let admin: AuthContext
  let clientId: string
  let data: Buffer

  beforeAll(async () => {
    await resetDatabase()
    await seedCatalogs()
    const client = await createClientTenant('Cliente Import')
    clientId = client.id
    admin = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)
    data = await buildTestWorkbook()
  })

  it('lee todas las hojas y conserva hoja y fila de origen', async () => {
    const parsed = await parseWorkbook(data)
    expect(parsed.sheetsSeen.map((sheet) => sheet.name)).toEqual([
      'SCOUTING KAST',
      'SCOUTING Anteriores de kast',
      'Perfiles para agregar si aplica',
      'Brief 2',
      'RESUMEN',
      'vista funnel',
    ])
    const ana = parsed.people.find((person) => person.displayName === 'Ana Ficticia')
    expect(ana?.sheetName).toBe('SCOUTING KAST')
    expect(ana?.rowNumber).toBe(2)
  })

  it('preserva el valor original junto al normalizado', async () => {
    const parsed = await parseWorkbook(data)
    const ana = parsed.people.find((person) => person.displayName === 'Ana Ficticia')
    expect(ana?.profiles[0]?.followers).toBe(78_900)
    expect(ana?.profiles[0]?.followersRaw).toBe('78,9k')
  })

  it('no inventa un número cuando el separador es ambiguo', async () => {
    const parsed = await parseWorkbook(data)
    const issue = parsed.issues.find((entry) => entry.message.includes('83.4'))
    expect(issue?.outcome).toBe('UNPARSEABLE')
    const dani = parsed.people.find((person) => person.displayName === 'Dani Ambiguo')
    expect(dani?.profiles[0]?.followers).toBeNull()
    expect(dani?.profiles[0]?.followersUnparsed).toBe(true)
  })

  it('reporta filas con dos personas en lugar de partirlas por su cuenta', async () => {
    const parsed = await parseWorkbook(data)
    const issue = parsed.issues.find((entry) => entry.outcome === 'MULTI_PERSON')
    expect(issue?.message).toContain('Eli Uno + Fer Dos')
    expect(parsed.people.some((person) => person.displayName.includes('Eli Uno'))).toBe(false)
  })

  it('reporta cuando el hipervínculo contradice el texto visible', async () => {
    const parsed = await parseWorkbook(data)
    const conflict = parsed.issues.find((entry) => entry.outcome === 'CONFLICT')
    expect(conflict?.message).toContain('hugo.conflicto')
    expect(conflict?.message).toContain('otro.distinto')
    // Se importa lo que dice el texto, no lo que dice el link.
    const hugo = parsed.people.find((person) => person.displayName === 'Hugo Conflicto')
    expect(hugo?.profiles[0]?.url).toContain('hugo.conflicto')
  })

  it('no repite filas por celdas combinadas', async () => {
    const parsed = await parseWorkbook(data)
    const mora = parsed.people.filter((person) => person.displayName === 'Mora Combinada')
    expect(mora).toHaveLength(1)
  })

  it('lee el brief estructurado y la distribución del squad', async () => {
    const parsed = await parseWorkbook(data)
    expect(parsed.brief.followersMin).toBe(10_000)
    expect(parsed.brief.followersMax).toBe(50_000)
    expect(parsed.brief.platforms).toEqual(['INSTAGRAM', 'TIKTOK'])
    expect(parsed.brief.clusters.map((cluster) => cluster.targetPercent)).toEqual([35, 25, 20, 15, 5])
  })

  it('no mezcla dos distribuciones del squad en una sola', async () => {
    const parsed = await parseWorkbook(data)
    // Los clusters activos son los del brief: suman 100, no 200.
    const total = parsed.brief.clusters.reduce((sum, cluster) => sum + cluster.targetPercent, 0)
    expect(total).toBe(100)
    expect(parsed.brief.clusters.map((cluster) => cluster.label)).not.toContain('Crypto / Fintech')

    // La segunda propuesta se conserva como alternativa y queda anotada.
    expect(parsed.brief.alternativeClusters.map((cluster) => cluster.label)).toEqual([
      'Crypto / Fintech',
      'Travel',
      'Remote / Business',
    ])
    expect(parsed.brief.internalNotes).toContain('Distribución alternativa')
    expect(parsed.decisions.some((decision) => decision.includes('segunda distribución'))).toBe(true)
  })

  it('lee el presupuesto del pie de la hoja', async () => {
    const parsed = await parseWorkbook(data)
    expect(parsed.budget.amount).toBe(10_000)
    expect(parsed.budget.currency).toBe('USD')
  })

  it('la previsualización no crea nada', async () => {
    const summary = await previewImport(admin, { clientId, filename: 'prueba.xlsx', data })
    expect(summary.counts.totalRows).toBeGreaterThan(0)
    const influencers = await searchInfluencers(admin, {})
    expect(influencers.total).toBe(0)
    await cancelImport(admin, summary.importRunId)
  })

  it('detecta duplicados y no los fusiona', async () => {
    const summary = await previewImport(admin, { clientId, filename: 'prueba.xlsx', data })
    const duplicate = summary.duplicates.find((entry) => entry.name === 'Ana F.')
    expect(duplicate?.reason).toContain('Misma URL')
    await confirmImport(admin, summary.importRunId)

    // Las dos entran por separado y el par queda marcado para que decida una persona.
    const found = await searchInfluencers(admin, { search: 'Ana' })
    expect(found.total).toBe(2)
    const duplicates = await listOpenDuplicates(admin)
    expect(duplicates.total).toBeGreaterThan(0)
  })

  it('9 · ejecutarlo dos veces no duplica registros', async () => {
    const count = async () =>
      withScope(admin.db, async (tx) => ({
        influencers: await tx.influencer.count(),
        profiles: await tx.socialProfile.count(),
        candidacies: await tx.candidacy.count(),
        campaigns: await tx.campaign.count(),
        snapshots: await tx.metricSnapshot.count(),
        clusters: await tx.briefCluster.count(),
      }))

    const before = await count()
    expect(before.influencers).toBeGreaterThan(0)

    const second = await previewImport(admin, { clientId, filename: 'prueba.xlsx', data })
    expect(second.counts.newInfluencers).toBe(0)
    expect(second.counts.existingInfluencers).toBe(second.counts.totalRows)
    const result = await confirmImport(admin, second.importRunId)
    expect(result.created).toBe(0)

    const after = await count()
    expect(after).toEqual(before)
  })

  it('la importación queda auditada y con log por fila', async () => {
    const runs = await withScope(admin.db, (tx) => tx.importRun.findMany({ orderBy: { startedAt: 'asc' } }))
    expect(runs.length).toBeGreaterThanOrEqual(2)
    expect(runs.some((run) => run.status === 'CONFIRMED')).toBe(true)
    expect(runs.some((run) => run.status === 'CANCELLED')).toBe(true)

    const rows = await withScope(admin.db, (tx) => tx.importRowLog.findMany({ take: 5 }))
    expect(rows.length).toBeGreaterThan(0)

    const audit = await withScope(admin.db, (tx) =>
      tx.auditLog.findMany({ where: { action: { startsWith: 'import.' } } }),
    )
    expect(audit.map((entry) => entry.action)).toContain('import.confirmed')
  })

  it('deja la procedencia del dato con su fuente y fecha', async () => {
    const sources = await withScope(admin.db, (tx) => tx.sourceReference.findMany({ take: 5 }))
    expect(sources.length).toBeGreaterThan(0)
    expect(sources[0]?.name).toContain('Excel')
    expect(sources[0]?.supports).toContain('seguidores')
  })

  it('un usuario sin permiso no puede importar', async () => {
    const scout = await contextFor(
      (await createUser({ agencyRole: 'SCOUT', agencyClientIds: [clientId] })).id,
    )
    await expect(previewImport(scout, { clientId, filename: 'x.xlsx', data })).rejects.toBeInstanceOf(Error)
  })

  it('no se puede importar hacia un cliente fuera de alcance', async () => {
    const other = await createClientTenant('Cliente Ajeno')
    const manager = await contextFor(
      (await createUser({ agencyRole: 'ACCOUNT_MANAGER', agencyClientIds: [clientId] })).id,
    )
    await expect(previewImport(manager, { clientId: other.id, filename: 'x.xlsx', data })).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('el archivo importado queda asociado a su cliente', async () => {
    const runs = await withSystemScope((tx) => tx.importRun.findMany())
    expect(runs.every((run) => run.clientId === clientId)).toBe(true)
  })
})
