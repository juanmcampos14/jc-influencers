import { beforeEach, describe, expect, it } from 'vitest'
import { mergeInfluencers } from '@/lib/repos/influencers'
import { withSystemScope } from '@/lib/db/scope'
import { contextFor, createClientTenant, createUser, resetDatabase, seedCatalogs } from '../helpers/fixtures'
import type { AuthContext } from '@/lib/authz/context'

/**
 * Fusionar dos influencers es lo más destructivo que hace el producto: mueve
 * historia de campañas. Estos tests fijan que no se pierda nada y que lo que no
 * se puede mover se informe en vez de forzarse.
 */
describe('Fusión de influencers duplicados', () => {
  let admin: AuthContext
  let clientId: string

  async function crearInfluencer(nombre: string, handle: string): Promise<string> {
    return withSystemScope(async (tx) => {
      const creado = await tx.influencer.create({ data: { displayName: nombre, primaryHandle: handle } })
      await tx.socialProfile.create({
        data: {
          influencerId: creado.id,
          platform: 'INSTAGRAM',
          url: `https://www.instagram.com/${handle}`,
          urlNormalized: `instagram.com/${handle}`,
          handle,
          followers: 1000,
          isPrimary: true,
        },
      })
      return creado.id
    })
  }

  async function crearCampana(nombre: string): Promise<string> {
    return withSystemScope(async (tx) => {
      const campana = await tx.campaign.create({
        data: { clientId, name: nombre, slug: `${nombre.toLowerCase()}-${Date.now()}`, currency: 'USD' },
      })
      return campana.id
    })
  }

  async function proponer(campaignId: string, influencerId: string): Promise<void> {
    await withSystemScope((tx) =>
      tx.candidacy.create({ data: { campaignId, clientId, influencerId, statusKey: 'PROPUESTO' } }),
    )
  }

  beforeEach(async () => {
    await resetDatabase()
    await seedCatalogs()
    clientId = (await createClientTenant('Marca')).id
    admin = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)
  })

  it('mueve perfiles y candidaturas al que sobrevive', async () => {
    const bueno = await crearInfluencer('Ana Real', 'ana')
    const repetido = await crearInfluencer('Ana R.', 'ana.r')
    const campana = await crearCampana('Verano')
    await proponer(campana, repetido)

    const resultado = await mergeInfluencers(admin, { keepId: bueno, mergeId: repetido })

    expect(resultado.movedProfiles).toBe(1)
    expect(resultado.movedCandidacies).toBe(1)

    const candidatura = await withSystemScope((tx) => tx.candidacy.findFirst({ where: { campaignId: campana } }))
    expect(candidatura?.influencerId).toBe(bueno)

    const perfiles = await withSystemScope((tx) => tx.socialProfile.count({ where: { influencerId: bueno } }))
    expect(perfiles).toBe(2)
  })

  it('archiva al absorbido en vez de borrarlo', async () => {
    // Borrar a alguien que participó de campañas destruiría la historia de esas
    // campañas, que es lo que el producto existe para conservar.
    const bueno = await crearInfluencer('Ana Real', 'ana2')
    const repetido = await crearInfluencer('Ana R.', 'ana.r2')

    await mergeInfluencers(admin, { keepId: bueno, mergeId: repetido })

    const archivado = await withSystemScope((tx) => tx.influencer.findUnique({ where: { id: repetido } }))
    expect(archivado).not.toBeNull()
    expect(archivado?.status).toBe('ARCHIVED')
    expect(archivado?.internalNotes).toContain('Fusionado en Ana Real')
  })

  it('no pisa una candidatura que ya existe en esa campaña', async () => {
    // Los dos participaron de la misma campaña. Cuál de las dos participaciones
    // sobrevive no es algo que deba decidir un script.
    const bueno = await crearInfluencer('Ana Real', 'ana3')
    const repetido = await crearInfluencer('Ana R.', 'ana.r3')
    const campana = await crearCampana('Invierno')
    await proponer(campana, bueno)
    await proponer(campana, repetido)

    const resultado = await mergeInfluencers(admin, { keepId: bueno, mergeId: repetido })

    expect(resultado.movedCandidacies).toBe(0)
    expect(resultado.conflictedCandidacies).toBe(1)

    // Y la del archivado sigue existiendo: no se perdió.
    const total = await withSystemScope((tx) => tx.candidacy.count({ where: { campaignId: campana } }))
    expect(total).toBe(2)
  })

  it('no duplica un perfil social que el sobreviviente ya tiene', async () => {
    const bueno = await crearInfluencer('Ana Real', 'anamisma')
    const repetido = await withSystemScope(async (tx) => {
      const creado = await tx.influencer.create({ data: { displayName: 'Ana R.', primaryHandle: 'anamisma' } })
      await tx.socialProfile.create({
        data: {
          influencerId: creado.id,
          platform: 'INSTAGRAM',
          url: 'https://www.instagram.com/anamisma',
          urlNormalized: 'instagram.com/anamisma',
          handle: 'anamisma',
          isPrimary: true,
        },
      })
      return creado.id
    })

    const resultado = await mergeInfluencers(admin, { keepId: bueno, mergeId: repetido })

    expect(resultado.movedProfiles).toBe(0)
    expect(resultado.conflictedProfiles).toBe(1)
    const perfiles = await withSystemScope((tx) => tx.socialProfile.count({ where: { influencerId: bueno } }))
    expect(perfiles).toBe(1)
  })

  it('cierra el par de duplicados como fusionado', async () => {
    const bueno = await crearInfluencer('Ana Real', 'ana4')
    const repetido = await crearInfluencer('Ana R.', 'ana.r4')
    const par = await withSystemScope((tx) =>
      tx.influencerDuplicate.create({
        data: { influencerAId: bueno, influencerBId: repetido, reason: 'nombre parecido', score: 90 },
      }),
    )

    await mergeInfluencers(admin, { keepId: bueno, mergeId: repetido, duplicateId: par.id })

    const cerrado = await withSystemScope((tx) => tx.influencerDuplicate.findUnique({ where: { id: par.id } }))
    expect(cerrado?.status).toBe('MERGED')
    expect(cerrado?.resolvedAt).not.toBeNull()
  })

  it('rechaza fusionar algo consigo mismo', async () => {
    const uno = await crearInfluencer('Ana', 'ana5')
    await expect(mergeInfluencers(admin, { keepId: uno, mergeId: uno })).rejects.toThrow()
  })

  it('deja registro en auditoría', async () => {
    const bueno = await crearInfluencer('Ana Real', 'ana6')
    const repetido = await crearInfluencer('Ana R.', 'ana.r6')
    await mergeInfluencers(admin, { keepId: bueno, mergeId: repetido })

    const evento = await withSystemScope((tx) =>
      tx.auditLog.findFirst({ where: { action: 'influencer.merged' }, orderBy: { occurredAt: 'desc' } }),
    )
    expect(evento?.entityId).toBe(bueno)
  })
})
