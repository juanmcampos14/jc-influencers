import { beforeAll, describe, expect, it } from 'vitest'
import { withSystemScope } from '@/lib/db/scope'
import {
  buscarEnBase,
  importarDescubiertos,
  fichaDeBase,
  registrarHallazgos,
  vincularConInfluencer,
  type HallazgoParaGuardar,
} from '@/lib/repos/base-conocimiento'
import { contextFor, createClientTenant, createUser, resetDatabase, seedCatalogs } from '../helpers/fixtures'
import type { AuthContext } from '@/lib/authz/context'
import { NotFoundError } from '@/lib/authz/errors'

/**
 * La base de conocimiento de la agencia.
 *
 * Lo que se prueba acá es la acumulación, que es donde esto se puede arruinar
 * en silencio: si una corrida pobre pisa lo que sabía una corrida rica, la base
 * empeora con el uso en vez de mejorar, y nadie se entera hasta que alguien
 * busca algo que estaba y ya no está.
 */

const perfil = (over: Partial<HallazgoParaGuardar> = {}): HallazgoParaGuardar => ({
  platform: 'INSTAGRAM',
  url: 'https://www.instagram.com/lachef.ok',
  urlNormalized: 'https://www.instagram.com/lachef.ok',
  handle: 'lachef.ok',
  displayName: 'La Chef',
  followers: 48_210,
  engagementRate: 4.31,
  country: 'AR',
  bio: 'Cocina de barrio en Córdoba.',
  ...over,
})

describe('Base de conocimiento', () => {
  let agencia: AuthContext
  let clienteCtx: AuthContext
  let clientId: string

  beforeAll(async () => {
    await resetDatabase()
    await seedCatalogs()
    const cliente = await createClientTenant('Base')
    clientId = cliente.id
    const admin = await createUser({ agencyRole: 'AGENCY_ADMIN' })
    const usuarioCliente = await createUser({
      clientMemberships: [{ clientId, role: 'CLIENT_ADMIN' }],
    })
    agencia = await contextFor(admin.id)
    clienteCtx = await contextFor(usuarioCliente.id)
  })

  it('guarda lo que trajo una búsqueda', async () => {
    const resumen = await withSystemScope((tx) =>
      registrarHallazgos(tx, { provider: 'apify', keywords: ['#gastronomia'], hallazgos: [perfil()] }),
    )
    expect(resumen).toEqual({ nuevos: 1, actualizados: 0 })

    const encontrados = await buscarEnBase(agencia, {}, { page: 1, pageSize: 10 })
    expect(encontrados.total).toBe(1)
    expect(encontrados.items[0]).toMatchObject({
      handle: 'lachef.ok',
      followers: 48_210,
      country: 'AR',
      // El '#' se saca: quien busca "gastronomia" tiene que encontrarlo.
      keywords: ['gastronomia'],
      providers: ['apify'],
      timesSeen: 1,
    })
  })

  it('el mismo creador no se duplica: se acumula sobre la misma fila', async () => {
    await withSystemScope((tx) =>
      registrarHallazgos(tx, { provider: 'hypeauditor', keywords: ['recetas'], hallazgos: [perfil()] }),
    )
    const encontrados = await buscarEnBase(agencia, {}, { page: 1, pageSize: 10 })
    expect(encontrados.total).toBe(1)
    expect(encontrados.items[0]?.timesSeen).toBe(2)
    // Las palabras y los proveedores SE SUMAN: es lo que lo hace encontrable.
    expect(encontrados.items[0]?.keywords.sort()).toEqual(['gastronomia', 'recetas'])
    expect(encontrados.items[0]?.providers.sort()).toEqual(['apify', 'hypeauditor'])
  })

  /*
   * La regla que hace que la base mejore con el uso en vez de empeorar. Un
   * proveedor que no informa el país no está diciendo que el creador no tenga
   * país: está diciendo que él no lo sabe.
   */
  it('una corrida sin datos NO borra lo que ya sabíamos', async () => {
    await withSystemScope((tx) =>
      registrarHallazgos(tx, {
        provider: 'brightdata',
        keywords: [],
        hallazgos: [perfil({ country: null, bio: null, displayName: null, engagementRate: null })],
      }),
    )
    const encontrados = await buscarEnBase(agencia, {}, { page: 1, pageSize: 10 })
    expect(encontrados.items[0]).toMatchObject({
      country: 'AR',
      displayName: 'La Chef',
      engagementRate: 4.31,
    })
    expect(encontrados.items[0]?.bio).toContain('Córdoba')
  })

  it('archiva el número cuando cambia, para poder ver si crece', async () => {
    await withSystemScope((tx) =>
      registrarHallazgos(tx, { provider: 'apify', keywords: [], hallazgos: [perfil({ followers: 51_000 })] }),
    )
    const encontrados = await buscarEnBase(agencia, {}, { page: 1, pageSize: 10 })
    const ficha = await fichaDeBase(agencia, encontrados.items[0]!.id)

    expect(ficha.perfil.followers).toBe(51_000)
    const seguidores = ficha.historialDeMetricas.map((m) => m.followers)
    expect(seguidores).toContain(48_210)
    expect(seguidores).toContain(51_000)
  })

  describe('buscar por cualquier variable', () => {
    beforeAll(async () => {
      await withSystemScope((tx) =>
        registrarHallazgos(tx, {
          provider: 'hypeauditor',
          keywords: ['fitness'],
          hallazgos: [
            perfil({
              url: 'https://www.instagram.com/entrena.mx',
              urlNormalized: 'https://www.instagram.com/entrena.mx',
              handle: 'entrena.mx',
              displayName: 'Entrena MX',
              followers: 900_000,
              engagementRate: 1.2,
              country: 'MX',
              bio: 'Rutinas en casa.',
            }),
            perfil({
              platform: 'TIKTOK',
              url: 'https://www.tiktok.com/@sinnumeros',
              urlNormalized: 'https://www.tiktok.com/@sinnumeros',
              handle: 'sinnumeros',
              displayName: null,
              followers: null,
              engagementRate: null,
              country: null,
              bio: null,
            }),
          ],
        }),
      )
    })

    it('por texto libre, mirando usuario, nombre y bio', async () => {
      const porBio = await buscarEnBase(agencia, { texto: 'rutinas' }, { page: 1, pageSize: 10 })
      expect(porBio.items.map((p) => p.handle)).toEqual(['entrena.mx'])
    })

    it('por red, país y rango de seguidores', async () => {
      const porRed = await buscarEnBase(agencia, { platform: 'TIKTOK' }, { page: 1, pageSize: 10 })
      expect(porRed.items.map((p) => p.handle)).toEqual(['sinnumeros'])

      const porPais = await buscarEnBase(agencia, { pais: 'mx' }, { page: 1, pageSize: 10 })
      expect(porPais.items.map((p) => p.handle)).toEqual(['entrena.mx'])

      const porRango = await buscarEnBase(
        agencia,
        { seguidoresDesde: 40_000, seguidoresHasta: 100_000 },
        { page: 1, pageSize: 10 },
      )
      expect(porRango.items.map((p) => p.handle)).toEqual(['lachef.ok'])
    })

    it('por engagement, palabra clave y proveedor', async () => {
      const porEr = await buscarEnBase(agencia, { engagementDesde: 4 }, { page: 1, pageSize: 10 })
      expect(porEr.items.map((p) => p.handle)).toEqual(['lachef.ok'])

      const porPalabra = await buscarEnBase(agencia, { palabras: ['fitness'] }, { page: 1, pageSize: 10 })
      expect(porPalabra.items.map((p) => p.handle).sort()).toEqual(['entrena.mx', 'sinnumeros'])

      const porProveedor = await buscarEnBase(agencia, { proveedor: 'brightdata' }, { page: 1, pageSize: 10 })
      expect(porProveedor.items.map((p) => p.handle)).toEqual(['lachef.ok'])
    })

    /*
     * Al que le falta el dato no se lo premia poniéndolo primero ni se lo
     * esconde: va al final, que es donde no confunde.
     */
    it('ordenar por seguidores no pone adelante al que no informa', async () => {
      const orden = await buscarEnBase(agencia, { orden: { clave: 'seguidores', direccion: 'desc' } }, { page: 1, pageSize: 10 })
      expect(orden.items.map((p) => p.handle)).toEqual(['entrena.mx', 'lachef.ok', 'sinnumeros'])
    })
  })

  it('el historial de campañas y pagos se lee de la campaña, no de una copia', async () => {
    const encontrados = await buscarEnBase(agencia, { texto: 'lachef' }, { page: 1, pageSize: 10 })
    const perfilId = encontrados.items[0]!.id

    const { influencerId, campaignId } = await withSystemScope(async (tx) => {
      const influencer = await tx.influencer.create({ data: { displayName: 'La Chef' } })
      const campaign = await tx.campaign.create({
        data: { clientId, slug: 'verano', name: 'Verano', status: 'LIVE', currency: 'USD' },
      })
      const candidacy = await tx.candidacy.create({
        data: { clientId, campaignId: campaign.id, influencerId: influencer.id, statusKey: 'NUEVO' },
      })
      await tx.payment.create({
        data: {
          clientId,
          campaignId: campaign.id,
          candidacyId: candidacy.id,
          direction: 'TALENT_OUT',
          status: 'PAID',
          amount: '500.00',
          currency: 'USD',
          concept: 'Reel',
        },
      })
      await tx.payment.create({
        data: {
          clientId,
          campaignId: campaign.id,
          candidacyId: candidacy.id,
          direction: 'TALENT_OUT',
          status: 'PENDING',
          amount: '250.00',
          currency: 'USD',
          concept: 'Historias',
        },
      })
      await vincularConInfluencer(tx, {
        platform: 'INSTAGRAM',
        urlNormalized: 'https://www.instagram.com/lachef.ok',
        influencerId: influencer.id,
      })
      return { influencerId: influencer.id, campaignId: campaign.id }
    })

    const ficha = await fichaDeBase(agencia, perfilId)
    expect(ficha.perfil.influencerId).toBe(influencerId)
    expect(ficha.campanas).toHaveLength(1)
    expect(ficha.campanas[0]).toMatchObject({ campaignId, campana: 'Verano', cliente: 'Base' })
    expect(ficha.campanas[0]?.pagos).toEqual([{ moneda: 'USD', pagado: 500, pendiente: 250 }])
  })

  it('se puede filtrar por si ya está en el padrón y por si trabajó en campañas', async () => {
    const enPadron = await buscarEnBase(agencia, { enPadron: 'SI' }, { page: 1, pageSize: 10 })
    expect(enPadron.items.map((p) => p.handle)).toEqual(['lachef.ok'])

    const conCampanas = await buscarEnBase(agencia, { conCampanas: 'SI' }, { page: 1, pageSize: 10 })
    expect(conCampanas.items.map((p) => p.handle)).toEqual(['lachef.ok'])

    const sinCampanas = await buscarEnBase(agencia, { conCampanas: 'NO' }, { page: 1, pageSize: 10 })
    expect(sinCampanas.items.map((p) => p.handle).sort()).toEqual(['entrena.mx', 'sinnumeros'])
  })

  /*
   * La base es de la agencia. Que un usuario de cliente no la vea no puede
   * depender de que la pantalla le esconda el botón.
   */
  it('un usuario de cliente no la ve, ni buscando ni por ficha', async () => {
    await expect(buscarEnBase(clienteCtx, {}, { page: 1, pageSize: 10 })).rejects.toBeInstanceOf(NotFoundError)
    const encontrados = await buscarEnBase(agencia, {}, { page: 1, pageSize: 1 })
    await expect(fichaDeBase(clienteCtx, encontrados.items[0]!.id)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('pasar descubiertos al padrón', () => {
  let agencia: AuthContext
  let clienteCtx: AuthContext

  beforeAll(async () => {
    await resetDatabase()
    await seedCatalogs()
    const cliente = await createClientTenant('Puente')
    const admin = await createUser({ agencyRole: 'AGENCY_ADMIN' })
    const usuarioCliente = await createUser({
      clientMemberships: [{ clientId: cliente.id, role: 'CLIENT_ADMIN' }],
    })
    agencia = await contextFor(admin.id)
    clienteCtx = await contextFor(usuarioCliente.id)

    await withSystemScope((tx) =>
      registrarHallazgos(tx, { provider: 'influencers-club', keywords: ['vino'], hallazgos: [perfil()] }),
    )
  })

  it('crea la ficha en el padrón con lo que sabía la base', async () => {
    const antes = await buscarEnBase(agencia, {}, { page: 1, pageSize: 10 })
    const resultado = await importarDescubiertos(agencia, [antes.items[0]!.id])

    expect(resultado).toMatchObject({ hechos: 1, creados: 1, vinculados: 0 })
    expect(resultado.omitidos).toEqual([])

    const influencer = await withSystemScope((tx) =>
      tx.influencer.findFirst({ where: { primaryHandle: 'lachef.ok' }, include: { profiles: true } }),
    )
    expect(influencer?.displayName).toBe('La Chef')
    expect(influencer?.country).toBe('AR')
    expect(influencer?.profiles[0]?.followers).toBe(48_210)
    // Procedencia: la ficha dice de dónde salió ese número.
    expect(influencer?.profiles[0]?.metricSource).toContain('influencers-club')
  })

  /*
   * Decir "importé 30" cuando 12 ya estaban haría creer que hay 30 fichas
   * nuevas para trabajar.
   */
  it('el que ya está no se cuenta como importado ni se duplica', async () => {
    const enBase = await buscarEnBase(agencia, {}, { page: 1, pageSize: 10 })
    const resultado = await importarDescubiertos(agencia, [enBase.items[0]!.id])

    expect(resultado.hechos).toBe(0)
    expect(resultado.omitidos[0]?.motivo).toContain('Ya estaba en el padrón')

    const cuantos = await withSystemScope((tx) =>
      tx.influencer.count({ where: { primaryHandle: 'lachef.ok' } }),
    )
    expect(cuantos).toBe(1)
  })

  it('un usuario de cliente no puede importar nada', async () => {
    const enBase = await buscarEnBase(agencia, {}, { page: 1, pageSize: 1 })
    await expect(importarDescubiertos(clienteCtx, [enBase.items[0]!.id])).rejects.toThrow()
  })
})
