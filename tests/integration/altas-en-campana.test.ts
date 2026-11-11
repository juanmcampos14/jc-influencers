import { beforeAll, describe, expect, it } from 'vitest'
import type { AuthContext } from '@/lib/authz/context'
import { agregarPorEnlace, crearYAgregarPorNombre, resolverEnlaces } from '@/lib/repos/altas-en-campana'
import { searchInfluencers } from '@/lib/repos/influencers'
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
 * Agregar gente a una campaña pegando los links de sus perfiles.
 *
 * El valor no está en ahorrar clics: está en NO crear duplicados. Pegar el
 * enlace de alguien que ya está en la base tiene que encontrarlo. Si no, cada
 * vez que alguien agrega a una campaña nace un segundo "moyanoflor" y la base
 * --que es lo único que la agencia realmente acumula-- se arruina de a poco.
 */
describe('Agregar a la campaña por enlace', () => {
  let admin: AuthContext
  let clientId: string
  let campaignId: string
  let yaExiste: string

  beforeAll(async () => {
    await resetDatabase()
    await seedCatalogs()
    clientId = (await createClientTenant('Cliente Campaña')).id
    campaignId = (await createCampaignFor(clientId, 'Campaña de prueba')).id
    admin = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)
    yaExiste = await createInfluencerWithProfile('Flor Moyano', 'moyanoflor')
  })

  /*
   * El reporte de Juan, exacto: pegó el link de alguien que SÍ estaba en la
   * base y la pantalla dijo "No hay resultados". El buscador comparaba el
   * texto contra el nombre y el handle, y `instagram.com/moyanoflor` no
   * contiene a `moyanoflor` al revés.
   */
  it('pegar el link de alguien que ya está en la base lo encuentra', async () => {
    const page = await searchInfluencers(admin, { search: 'https://www.instagram.com/moyanoflor' })
    expect(page.items.map((item) => item.id)).toContain(yaExiste)
  })

  it('el link con parámetros de tracking encuentra a la misma persona', async () => {
    const page = await searchInfluencers(admin, { search: 'https://www.instagram.com/moyanoflor/?igsh=abc123&hl=es' })
    expect(page.items.map((item) => item.id)).toContain(yaExiste)
  })

  it('un nombre sigue buscando por nombre, no se lee como enlace', async () => {
    const page = await searchInfluencers(admin, { search: 'Flor' })
    expect(page.items.map((item) => item.id)).toContain(yaExiste)
  })

  it('dice de cada link si ya está, si hay que crearlo, o si ya está en la campaña', async () => {
    const lectura = await resolverEnlaces(
      admin,
      campaignId,
      'https://www.instagram.com/moyanoflor https://www.instagram.com/nadie.todavia https://midominio.com/equipo',
    )
    expect(lectura.enlaces.map((e) => e.estado)).toEqual(['EN_LA_BASE', 'NUEVO'])
    expect(lectura.enlaces[0]?.nombre).toBe('Flor Moyano')
    expect(lectura.enlaces[1]?.nombre).toBe('nadie.todavia')
    expect(lectura.noReconocidos).toEqual(['https://midominio.com/equipo'])
  })

  it('agrega los que están y da de alta los que faltan, en una sola pasada', async () => {
    const resultado = await agregarPorEnlace(admin, {
      campaignId,
      texto: 'https://www.instagram.com/moyanoflor\nhttps://www.instagram.com/nadie.todavia',
    })
    expect(resultado).toMatchObject({ agregados: 2, creados: 1, yaEstaban: 0, fallidos: [] })

    const candidaturas = await withSystemScope((tx) =>
      tx.candidacy.findMany({ where: { campaignId }, select: { influencerId: true } }),
    )
    expect(candidaturas.map((c) => c.influencerId)).toContain(yaExiste)
    expect(candidaturas).toHaveLength(2)
  })

  /*
   * El alta nace con su perfil o no sirve de nada: sin la dirección guardada,
   * el mismo enlace la volvería a crear la próxima vez.
   */
  it('el que se crea nace con su perfil, así que el mismo link ya lo reconoce', async () => {
    const lectura = await resolverEnlaces(admin, campaignId, 'https://www.instagram.com/nadie.todavia')
    expect(lectura.enlaces[0]?.estado).toBe('YA_EN_CAMPANA')

    const page = await searchInfluencers(admin, { search: 'https://www.instagram.com/nadie.todavia' })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.profiles[0]?.handle).toBe('nadie.todavia')
  })

  it('volver a pegar lo mismo no duplica a nadie', async () => {
    const antes = await withSystemScope((tx) => tx.influencer.count())
    const resultado = await agregarPorEnlace(admin, {
      campaignId,
      texto: 'https://www.instagram.com/moyanoflor https://www.instagram.com/nadie.todavia',
    })
    expect(resultado).toMatchObject({ agregados: 0, creados: 0, yaEstaban: 2 })
    expect(await withSystemScope((tx) => tx.influencer.count())).toBe(antes)
  })

  /*
   * Pegar seis y perder los seis porque uno estaba mal sería el peor resultado
   * posible de esta pantalla.
   */
  it('un link que falla no voltea a los demás', async () => {
    const otra = (await createCampaignFor(clientId, 'Otra campaña')).id
    const rota = await createInfluencerWithProfile('Perfil Roto', 'perfil.roto')
    await createCandidacyFor({ clientId, campaignId: otra, influencerId: rota })

    const resultado = await agregarPorEnlace(admin, {
      campaignId: otra,
      texto: 'https://www.instagram.com/perfil.roto https://www.instagram.com/uno.nuevo',
    })
    expect(resultado.yaEstaban).toBe(1)
    expect(resultado.agregados).toBe(1)
    expect(resultado.creados).toBe(1)
  })

  it('sin ningún link utilizable lo dice en vez de no hacer nada', async () => {
    const error = await agregarPorEnlace(admin, { campaignId, texto: 'https://midominio.com/equipo' }).catch(
      (e: unknown) => e,
    )
    expect((error as Error).name).toBe('ValidationError')
  })

  it('dar de alta por nombre crea la ficha y la suma a la campaña', async () => {
    const otra = (await createCampaignFor(clientId, 'Campaña por nombre')).id
    const { influencerId } = await crearYAgregarPorNombre(admin, { campaignId: otra, displayName: 'Alguien Sin Link' })

    const candidatura = await withSystemScope((tx) =>
      tx.candidacy.findUnique({ where: { campaignId_influencerId: { campaignId: otra, influencerId } } }),
    )
    expect(candidatura).not.toBeNull()
  })
})

/**
 * Quien no puede dar de alta no puede dar de alta desde acá tampoco.
 *
 * Una pantalla nueva es exactamente donde se cuela un permiso que nadie
 * comprobó: el camino es otro, pero la regla es la misma.
 */
describe('Agregar por enlace: permisos', () => {
  let clientId: string
  let campaignId: string

  beforeAll(async () => {
    await resetDatabase()
    await seedCatalogs()
    clientId = (await createClientTenant('Cliente Permisos')).id
    campaignId = (await createCampaignFor(clientId, 'Campaña permisos')).id
  })

  it('un usuario del cliente no puede agregar por enlace', async () => {
    const user = await createUser({ clientMemberships: [{ clientId, role: 'CLIENT_ADMIN' }] })
    const ctx = await contextFor(user.id)
    const error = await agregarPorEnlace(ctx, {
      campaignId,
      texto: 'https://www.instagram.com/alguien',
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(['ForbiddenError', 'NotFoundError']).toContain((error as Error).name)
  })

  it('la lectura previa tampoco se la muestra', async () => {
    const user = await createUser({ clientMemberships: [{ clientId, role: 'CLIENT_ADMIN' }] })
    const ctx = await contextFor(user.id)
    const error = await resolverEnlaces(ctx, campaignId, 'https://www.instagram.com/alguien').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
  })
})
