import { describe, expect, it } from 'vitest'
import {
  cuerpoDeBusqueda,
  leerCreador,
  leerSobre,
  paginasPara,
  POR_PAGINA,
  redDe,
  urlDePerfil,
} from '@/lib/ports/hypeauditor-consulta'

/**
 * Lo que se prueba acá es una traducción, y las traducciones fallan mudas: un
 * nombre de campo mal escrito no rompe nada, devuelve una lista vacía. Estos
 * tests fijan el contrato documentado por HypeAuditor para que ese error se vea
 * antes de pagar una consulta.
 *
 * Contrato: https://hypeauditor.readme.io/reference/example_instagram.md
 */

describe('a qué redes se le puede preguntar', () => {
  it('traduce las cinco que HypeAuditor cubre', () => {
    expect(redDe('INSTAGRAM')).toBe('instagram')
    expect(redDe('TIKTOK')).toBe('tiktok')
    expect(redDe('YOUTUBE')).toBe('youtube')
    expect(redDe('TWITCH')).toBe('twitch')
    expect(redDe('X')).toBe('twitter')
  })

  it('dice que no a las que no cubre, en vez de inventar un nombre', () => {
    expect(redDe('LINKEDIN')).toBeNull()
    expect(redDe('SPOTIFY')).toBeNull()
    expect(redDe('WEBSITE')).toBeNull()
  })
})

describe('cuántas páginas se pagan', () => {
  it('una página alcanza hasta veinte', () => {
    expect(paginasPara(1)).toBe(1)
    expect(paginasPara(20)).toBe(1)
  })

  it('pedir veintiuno cuesta dos páginas, igual que pedir cuarenta', () => {
    expect(paginasPara(21)).toBe(2)
    expect(paginasPara(40)).toBe(2)
  })

  it('nunca es cero, porque preguntar siempre cuesta', () => {
    expect(paginasPara(0)).toBe(1)
  })
})

describe('el cuerpo del pedido', () => {
  const base = { platform: 'INSTAGRAM' as const, palabras: ['gastronomía'], filtros: {}, audiencia: {}, pagina: 1 }

  it('lleva la red, la página y las palabras', () => {
    expect(cuerpoDeBusqueda(base)).toEqual({
      social_network: 'instagram',
      page: 1,
      search: ['gastronomía'],
    })
  })

  it('no manda filtros que nadie pidió', () => {
    const cuerpo = cuerpoDeBusqueda(base)
    expect(cuerpo).not.toHaveProperty('subscribers_count')
    expect(cuerpo).not.toHaveProperty('er')
    expect(cuerpo).not.toHaveProperty('audience_geo')
    expect(cuerpo).not.toHaveProperty('aqs')
  })

  it('descarta palabras vacías en vez de mandar cadenas en blanco', () => {
    const cuerpo = cuerpoDeBusqueda({ ...base, palabras: ['  ', 'vino', ''] })
    expect(cuerpo.search).toEqual(['vino'])
  })

  it('traduce los filtros del creador con los nombres que espera HypeAuditor', () => {
    const cuerpo = cuerpoDeBusqueda({
      ...base,
      filtros: { seguidoresDesde: 10_000, seguidoresHasta: 100_000, engagementMinimo: 3, pais: 'ar' },
    })
    expect(cuerpo.subscribers_count).toEqual({ from: 10_000, to: 100_000 })
    expect(cuerpo.er).toEqual({ from: 3 })
    expect(cuerpo.account_geo).toEqual({ country: ['AR'] })
  })

  it('manda sólo el extremo que se pidió', () => {
    const cuerpo = cuerpoDeBusqueda({ ...base, filtros: { seguidoresDesde: 5_000 } })
    expect(cuerpo.subscribers_count).toEqual({ from: 5_000 })
  })

  /*
   * Este bloque es la razón entera de mirar a HypeAuditor: es lo único que un
   * scraper no puede contestar.
   */
  it('traduce los filtros de AUDIENCIA, que es lo que ningún scraper sabe', () => {
    const cuerpo = cuerpoDeBusqueda({
      ...base,
      audiencia: {
        paisDelPublico: { pais: 'ar', porcentajeMinimo: 60 },
        generoDelPublico: { genero: 'female', porcentajeMinimo: 55 },
        edadDelPublico: { tramos: ['25-34', '35-44'], porcentajeMinimo: 40 },
        calidadMinima: 70,
      },
    })
    expect(cuerpo.audience_geo).toEqual({ countries: [{ id: 'AR', prc: 60 }] })
    expect(cuerpo.audience_gender).toEqual({ gender: 'female', prc: 55 })
    expect(cuerpo.audience_age).toEqual({ groups: ['25-34', '35-44'], prc: 40 })
    expect(cuerpo.aqs).toEqual({ from: 70 })
  })

  it('sin tramos de edad no manda el filtro vacío', () => {
    const cuerpo = cuerpoDeBusqueda({ ...base, audiencia: { edadDelPublico: { tramos: [], porcentajeMinimo: 40 } } })
    expect(cuerpo).not.toHaveProperty('audience_age')
  })

  it('se planta cuando la red no existe, en vez de mandar un pedido inválido', () => {
    expect(() => cuerpoDeBusqueda({ ...base, platform: 'LINKEDIN' })).toThrow(/LINKEDIN/)
  })
})

describe('leer un creador', () => {
  /** Un creador con la forma exacta del ejemplo documentado. */
  const creador = {
    basic: { username: 'lachef.ok', title: 'La Chef', avatar_url: 'https://cdn.hypeauditor.com/a.jpg' },
    metrics: { er: { value: 4.31 }, subscribers_count: { value: 48210 } },
  }

  it('lee los campos anidados como los manda HypeAuditor', () => {
    const leido = leerCreador('INSTAGRAM', creador)
    expect(leido).toMatchObject({
      handle: 'lachef.ok',
      displayName: 'La Chef',
      followers: 48210,
      engagementRate: 4.31,
      profileImageUrl: 'https://cdn.hypeauditor.com/a.jpg',
      url: 'https://www.instagram.com/lachef.ok',
    })
  })

  /*
   * Sin usuario no hay perfil: no hay URL, no hay forma de volver a encontrarlo
   * ni de saber si ya lo teníamos. Es el mismo error por el que hubo que
   * descartar un actor de Apify que devolvía posteos sin autor.
   */
  it('descarta al que no trae usuario, en vez de guardar una fila que no lleva a ningún lado', () => {
    expect(leerCreador('INSTAGRAM', { basic: { title: 'Sin usuario' } })).toBeNull()
    expect(leerCreador('INSTAGRAM', { basic: { username: '   ' } })).toBeNull()
    expect(leerCreador('INSTAGRAM', null)).toBeNull()
    expect(leerCreador('INSTAGRAM', 'texto suelto')).toBeNull()
  })

  it('deja en null lo que falta, sin convertirlo en cero', () => {
    const leido = leerCreador('INSTAGRAM', { basic: { username: 'alguien' } })
    expect(leido?.followers).toBeNull()
    expect(leido?.engagementRate).toBeNull()
    expect(leido?.displayName).toBeNull()
  })

  it('arma la URL según la red', () => {
    expect(urlDePerfil('TIKTOK', 'juan')).toBe('https://www.tiktok.com/@juan')
    expect(urlDePerfil('YOUTUBE', 'juan')).toBe('https://www.youtube.com/@juan')
    expect(urlDePerfil('X', 'juan')).toBe('https://x.com/juan')
    expect(urlDePerfil('LINKEDIN', 'juan')).toBeNull()
  })
})

describe('el sobre de la respuesta', () => {
  it('lee los creadores y cuántas consultas quedan', () => {
    const sobre = leerSobre({ result: { creators: [{ basic: { username: 'a' } }], restTokens: 498 } })
    expect(sobre).toMatchObject({ ok: true, consultasRestantes: 498 })
    expect(sobre.ok && sobre.creadores).toHaveLength(1)
  })

  /*
   * HypeAuditor puede contestar HTTP 200 con un error adentro. Mirar sólo el
   * código de estado convertiría "token inválido" en una lista vacía, que es
   * exactamente el fallo mudo que no queremos.
   */
  it('reconoce el error aunque venga en una respuesta que parece exitosa', () => {
    const sobre = leerSobre({ error: { code: 4, description: 'Invalid token' } })
    expect(sobre).toEqual({ ok: false, mensaje: 'Invalid token' })
  })

  it('no se cuelga si cambian el nombre de la lista', () => {
    const sobre = leerSobre({ result: { accounts: [{ basic: { username: 'a' } }] } })
    expect(sobre.ok && sobre.creadores).toHaveLength(1)
  })

  it('avisa cuando la respuesta no se entiende, en vez de devolver vacío', () => {
    expect(leerSobre(null).ok).toBe(false)
    expect(leerSobre({ nada: 1 }).ok).toBe(false)
  })

  it('una página son veinte, y eso define lo que se cobra', () => {
    expect(POR_PAGINA).toBe(20)
  })
})
