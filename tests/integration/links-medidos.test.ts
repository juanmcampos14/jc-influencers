import { beforeEach, describe, expect, it } from 'vitest'
import { archivarLink, crearLink, listarLinks, registrarClic } from '@/lib/repos/links'
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

const VISITA = {
  ip: '190.1.2.3',
  userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Safari/604.1',
  referer: 'https://www.instagram.com/p/abc?igsh=secreto',
  country: 'AR',
}

describe('Links medidos', () => {
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

  const nuevo = (destino = 'https://lamarca.com/producto') =>
    crearLink(agencia, campaignId, {
      destination: destino,
      label: 'Historia del 12',
      candidacyId: null,
      utm: { source: 'Instagram', medium: 'Influencer', campaign: 'Ronda Uno' },
    })

  it('arma el destino con los UTMs normalizados', async () => {
    await nuevo()
    const [link] = await listarLinks(agencia, campaignId)
    const url = new URL(link!.destination)
    expect(url.searchParams.get('utm_source')).toBe('instagram')
    expect(url.searchParams.get('utm_campaign')).toBe('ronda-uno')
  })

  it('cuenta el clic y devuelve el destino', async () => {
    const creado = await nuevo()
    const slug = creado.url.split('/r/')[1]!

    expect(await registrarClic({ slug, ...VISITA })).toContain('lamarca.com')

    const [link] = await listarLinks(agencia, campaignId)
    expect(link!.clics).toBe(1)
    expect(link!.personas).toBe(1)
  })

  it('NUNCA guarda la dirección IP ni la URL completa del referente', async () => {
    const creado = await nuevo()
    const slug = creado.url.split('/r/')[1]!
    await registrarClic({ slug, ...VISITA })

    const clics = await withSystemScope((tx) => tx.linkClick.findMany())
    const serializado = JSON.stringify(clics)
    expect(serializado).not.toContain('190.1.2.3')
    // Del referente sólo el host: la URL entera puede llevar datos de la persona.
    expect(serializado).not.toContain('igsh=secreto')
    expect(clics[0]?.referrerHost).toBe('www.instagram.com')
  })

  it('el mismo visitante no se cuenta diez veces en la misma tarde', async () => {
    const creado = await nuevo()
    const slug = creado.url.split('/r/')[1]!
    await registrarClic({ slug, ...VISITA })
    await registrarClic({ slug, ...VISITA })
    await registrarClic({ slug, ...VISITA })

    const [link] = await listarLinks(agencia, campaignId)
    expect(link!.clics).toBe(3)
    // Tres clics, una sola persona.
    expect(link!.personas).toBe(1)
  })

  it('los bots se guardan aparte y no ensucian el número', async () => {
    const creado = await nuevo()
    const slug = creado.url.split('/r/')[1]!
    await registrarClic({ slug, ...VISITA, userAgent: 'facebookexternalhit/1.1' })
    await registrarClic({ slug, ...VISITA })

    const [link] = await listarLinks(agencia, campaignId)
    expect(link!.clics).toBe(1)
    expect(link!.bots).toBe(1)
  })

  it('un slug archivado no manda a ningún lado', async () => {
    const creado = await nuevo()
    const slug = creado.url.split('/r/')[1]!
    await archivarLink(agencia, creado.id, true)
    expect(await registrarClic({ slug, ...VISITA })).toBeNull()
  })

  it('un slug que no existe no dice nada', async () => {
    expect(await registrarClic({ slug: 'noexiste', ...VISITA })).toBeNull()
  })

  it.each([['javascript:alert(1)'], ['data:text/html,<b>x</b>']])('rechaza el destino %s', async (destino) => {
    await expect(nuevo(destino)).rejects.toThrow()
  })

  it('no deja apuntar un link a alguien de otra campaña', async () => {
    const influencerId = await createInfluencerWithProfile('Ana Pérez', 'anaperez')
    const otraCampana = (await createCampaignFor(clientId, 'Ronda dos')).id
    const ajena = await createCandidacyFor({ clientId, campaignId: otraCampana, influencerId })

    await expect(
      crearLink(agencia, campaignId, {
        destination: 'https://lamarca.com',
        label: null,
        candidacyId: ajena,
        utm: { source: 'ig', medium: 'inf', campaign: 'x' },
      }),
    ).rejects.toThrow(/no está en esta campaña/i)
  })

  it('una agencia acotada a otro cliente no ve estos links', async () => {
    await nuevo()
    const otro = (await createClientTenant('Otra marca')).id
    const acotado = await contextFor(
      (await createUser({ agencyRole: 'ACCOUNT_MANAGER', agencyClientIds: [otro] })).id,
    )
    await expect(listarLinks(acotado, campaignId)).rejects.toThrow()
  })
})
