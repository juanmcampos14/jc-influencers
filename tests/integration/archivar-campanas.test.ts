import { beforeEach, describe, expect, it } from 'vitest'
import type { AuthContext } from '@/lib/authz/context'
import { archivarCampanas } from '@/lib/repos/lote'
import { eliminarCampana, getCampaign, listCampaigns, loQueSePierdeAlEliminar } from '@/lib/repos/campaigns'
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
 * Archivar una campaña: que no aparezca más y que el cliente no la vea.
 *
 * Es otro eje que cerrar o cancelar. Esos dicen QUÉ PASÓ --terminó, o no llegó
 * a pasar-- y el reporte de fin de año los necesita. Archivar dice "no la
 * quiero ver más". Si fueran el mismo campo habría que elegir entre esconder
 * una campaña y registrar cómo terminó.
 */
describe('Archivar campañas', () => {
  let admin: AuthContext
  let cliente: AuthContext
  let clientId: string
  let campaignId: string

  beforeEach(async () => {
    await resetDatabase()
    await seedCatalogs()
    clientId = (await createClientTenant('Cliente Archivo')).id
    campaignId = (await createCampaignFor(clientId, 'Campaña a archivar')).id
    admin = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)
    cliente = await contextFor(
      (await createUser({ clientMemberships: [{ clientId, role: 'CLIENT_ADMIN' }] })).id,
    )
  })

  it('archivada desaparece de la lista de la agencia', async () => {
    expect((await listCampaigns(admin, { clientId })).items).toHaveLength(1)
    await archivarCampanas(admin, [campaignId], true)
    expect((await listCampaigns(admin, { clientId })).items).toHaveLength(0)
  })

  it('la agencia puede mirar la lista de archivadas', async () => {
    await archivarCampanas(admin, [campaignId], true)
    const archivadas = await listCampaigns(admin, { clientId, archivadas: true })
    expect(archivadas.items.map((c) => c.id)).toEqual([campaignId])
    expect(archivadas.items[0]?.archivedAt).not.toBeNull()
  })

  it('el cliente deja de verla en su portal', async () => {
    expect((await listCampaigns(cliente, {})).items).toHaveLength(1)
    await archivarCampanas(admin, [campaignId], true)
    expect((await listCampaigns(cliente, {})).items).toHaveLength(0)
  })

  /*
   * Sacarla de la lista no alcanza: el cliente pudo haber guardado el enlace.
   * Y 404, no 403, para no confirmarle que existió.
   */
  it('el cliente con el enlace guardado tampoco la abre', async () => {
    await archivarCampanas(admin, [campaignId], true)
    const error = await getCampaign(cliente, campaignId).catch((e: unknown) => e)
    expect((error as Error).name).toBe('NotFoundError')
  })

  /*
   * El que define la función: si el cliente pudiera pedir las archivadas por
   * la URL, archivar no escondería nada.
   */
  it('el cliente no las ve ni pidiéndolas a mano', async () => {
    await archivarCampanas(admin, [campaignId], true)
    expect((await listCampaigns(cliente, { archivadas: true })).items).toHaveLength(0)
  })

  it('restaurar la devuelve entera, a la lista y al portal', async () => {
    const influencerId = await createInfluencerWithProfile('Quien Sea', 'quien.sea')
    await createCandidacyFor({ clientId, campaignId, influencerId })

    await archivarCampanas(admin, [campaignId], true)
    await archivarCampanas(admin, [campaignId], false)

    expect((await listCampaigns(cliente, {})).items).toHaveLength(1)
    expect(await withSystemScope((tx) => tx.candidacy.count({ where: { campaignId } }))).toBe(1)
  })

  it('archivar dos veces lo dice en vez de contarlo como hecho', async () => {
    await archivarCampanas(admin, [campaignId], true)
    const resultado = await archivarCampanas(admin, [campaignId], true)
    expect(resultado.hechos).toBe(0)
    expect(resultado.omitidos[0]?.motivo).toContain('Ya estaba archivada')
  })

  it('un usuario del cliente no puede archivar', async () => {
    const resultado = await archivarCampanas(cliente, [campaignId], true)
    expect(resultado.hechos).toBe(0)
    expect((await listCampaigns(admin, { clientId })).items).toHaveLength(1)
  })
})

/**
 * Eliminar de verdad.
 *
 * En la base TODO lo que cuelga de una campaña está en cascada, así que un
 * borrado se lleva candidaturas, pagos y los clics de los enlaces medidos sin
 * preguntar. Por eso se niega cuando hay plata o trabajo registrado.
 */
describe('Eliminar una campaña', () => {
  let admin: AuthContext
  let clientId: string
  let campaignId: string

  beforeEach(async () => {
    await resetDatabase()
    await seedCatalogs()
    clientId = (await createClientTenant('Cliente Borrado')).id
    campaignId = (await createCampaignFor(clientId, 'Campaña de prueba')).id
    admin = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)
  })

  it('una campaña creada por error se elimina y deja de existir', async () => {
    await eliminarCampana(admin, campaignId)
    expect(await withSystemScope((tx) => tx.campaign.count({ where: { id: campaignId } }))).toBe(0)
  })

  it('dice qué se lleva puesto antes de eliminar', async () => {
    const influencerId = await createInfluencerWithProfile('Alguien Mas', 'alguien.mas')
    await createCandidacyFor({ clientId, campaignId, influencerId })
    const resumen = await loQueSePierdeAlEliminar(admin, campaignId)
    expect(resumen).toMatchObject({ nombre: 'Campaña de prueba', candidaturas: 1, pagos: 0, sePuedeEliminar: true })
  })

  /*
   * El caso que importa: un pago es plata que se movió. Borrarlo para ordenar
   * una lista es exactamente lo que nadie puede deshacer.
   */
  it('con un pago registrado se niega y manda a archivar', async () => {
    await withSystemScope((tx) =>
      tx.payment.create({
        data: {
          clientId,
          campaignId,
          concept: 'Anticipo',
          amount: '1000',
          currency: 'USD',
          status: 'PENDING',
          direction: 'TALENT_OUT',
        },
      }),
    )
    const resumen = await loQueSePierdeAlEliminar(admin, campaignId)
    expect(resumen.sePuedeEliminar).toBe(false)

    const error = await eliminarCampana(admin, campaignId).catch((e: unknown) => e)
    expect((error as Error).name).toBe('ValidationError')
    expect(await withSystemScope((tx) => tx.campaign.count({ where: { id: campaignId } }))).toBe(1)
  })

  it('deja anotado en la auditoría lo que se perdió', async () => {
    const influencerId = await createInfluencerWithProfile('Otro Mas', 'otro.mas')
    await createCandidacyFor({ clientId, campaignId, influencerId })
    await eliminarCampana(admin, campaignId)

    const fila = await withSystemScope((tx) =>
      tx.auditLog.findFirst({ where: { entityId: campaignId, action: 'campaign.deleted' } }),
    )
    expect(fila).not.toBeNull()
    expect((fila?.before as { candidaturas?: number })?.candidaturas).toBe(1)
  })

  it('un usuario del cliente no puede eliminarla', async () => {
    const cliente = await contextFor(
      (await createUser({ clientMemberships: [{ clientId, role: 'CLIENT_ADMIN' }] })).id,
    )
    const error = await eliminarCampana(cliente, campaignId).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(await withSystemScope((tx) => tx.campaign.count({ where: { id: campaignId } }))).toBe(1)
  })
})
