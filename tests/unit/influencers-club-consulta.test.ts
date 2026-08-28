import { describe, expect, it } from 'vitest'
import {
  cuerpoDeBusqueda,
  nombreDePais,
  leerCreador,
  leerSobre,
  MAXIMO_POR_PAGINA,
  redDe,
  urlDePerfil,
} from '@/lib/ports/influencers-club-consulta'

/**
 * Traducir es donde una integración falla muda: un campo mal escrito no rompe
 * nada, devuelve una lista vacía. Estos tests fijan el contrato documentado de
 * influencers.club para que ese error se vea sin gastar un crédito.
 *
 * Contrato: https://docs.influencers.club/openapi/discovery-api/public_v1_discovery_create.md
 */

const base = {
  platform: 'INSTAGRAM' as const,
  palabras: [],
  filtros: {},
  audiencia: {},
  pagina: 1,
  limite: 20,
}

describe('a qué redes se le puede preguntar', () => {
  it('traduce las cinco que nos sirven', () => {
    expect(redDe('INSTAGRAM')).toBe('instagram')
    expect(redDe('TIKTOK')).toBe('tiktok')
    expect(redDe('YOUTUBE')).toBe('youtube')
    expect(redDe('TWITCH')).toBe('twitch')
    expect(redDe('X')).toBe('twitter')
  })

  it('dice que no a las que no cubre, en vez de inventar un nombre', () => {
    expect(redDe('LINKEDIN')).toBeNull()
    expect(redDe('WEBSITE')).toBeNull()
  })
})

describe('el paginado', () => {
  /*
   * Su primera página es la 0 y la nuestra la 1. Es el tipo de diferencia que
   * no rompe nada y hace que la primera página se pague dos veces.
   */
  it('convierte nuestra página 1 en la 0 de ellos', () => {
    expect(cuerpoDeBusqueda({ ...base, pagina: 1 })).toMatchObject({ paging: { page: 0 } })
    expect(cuerpoDeBusqueda({ ...base, pagina: 3 })).toMatchObject({ paging: { page: 2 } })
  })

  it('nunca manda una página negativa', () => {
    expect(cuerpoDeBusqueda({ ...base, pagina: 0 })).toMatchObject({ paging: { page: 0 } })
  })

  /*
   * Cobra por creador DEVUELTO. Pedir de más se paga aunque no se mire, así
   * que el límite es un tope de gasto, no una sugerencia.
   */
  it('respeta el límite pedido y no se pasa del máximo', () => {
    expect(cuerpoDeBusqueda({ ...base, limite: 5 })).toMatchObject({ paging: { limit: 5 } })
    expect(cuerpoDeBusqueda({ ...base, limite: 5_000 })).toMatchObject({
      paging: { limit: MAXIMO_POR_PAGINA },
    })
    expect(cuerpoDeBusqueda({ ...base, limite: 0 })).toMatchObject({ paging: { limit: 1 } })
  })
})

describe('el cuerpo del pedido', () => {
  it('no manda filtros que nadie pidió', () => {
    const cuerpo = cuerpoDeBusqueda(base)
    expect(cuerpo).toMatchObject({ platform: 'instagram' })
    expect(cuerpo.filters).toEqual({})
  })

  it('traduce los filtros del creador con los nombres que espera', () => {
    const cuerpo = cuerpoDeBusqueda({
      ...base,
      filtros: { seguidoresDesde: 10_000, seguidoresHasta: 100_000, engagementMinimo: 3, pais: 'AR' },
    })
    expect(cuerpo.filters).toMatchObject({
      number_of_followers: { min: 10_000, max: 100_000 },
      engagement_percent: { min: 3 },
      // Su filtro toma el NOMBRE del país, no el código ISO: mandar "AR" hace
      // fallar el pedido entero con `invalid_filters`. Probado contra la API.
      location: ['Argentina'],
    })
  })

  it('manda sólo el extremo que se pidió', () => {
    const cuerpo = cuerpoDeBusqueda({ ...base, filtros: { seguidoresDesde: 5_000 } })
    expect((cuerpo.filters as Record<string, unknown>).number_of_followers).toEqual({ min: 5_000 })
  })

  it('la zona y la mención se buscan en la bio, y los hashtags sin el numeral', () => {
    const cuerpo = cuerpoDeBusqueda({
      ...base,
      palabras: ['#gastronomia', '  ', 'vino'],
      filtros: { zona: 'Córdoba', bioMenciona: 'nutricionista' },
    })
    expect(cuerpo.filters).toMatchObject({
      keywords_in_bio: ['Córdoba', 'nutricionista'],
      hashtags: ['gastronomia', 'vino'],
    })
  })

  /*
   * El bloque por el que salimos a buscar un proveedor de datos: es lo único
   * que un scraper no puede contestar.
   */
  it('traduce los filtros de AUDIENCIA con la forma anidada que pide', () => {
    const cuerpo = cuerpoDeBusqueda({
      ...base,
      audiencia: {
        paisDelPublico: { pais: 'ar', porcentajeMinimo: 60 },
        generoDelPublico: { genero: 'female', porcentajeMinimo: 55 },
        edadDelPublico: { tramos: ['25-34', '35-44'], porcentajeMinimo: 40 },
        interesesDelPublico: { intereses: ['Food & Drink'], porcentajeMinimo: 30 },
        calidadMinima: 80,
      },
    })
    expect((cuerpo.filters as Record<string, unknown>).audience).toEqual({
      location: [{ name: 'Argentina', type: 'country', min_pct: 60 }],
      gender: { type: 'female', min_pct: 55 },
      age: [
        { range: '25-34', min_pct: 40 },
        { range: '35-44', min_pct: 40 },
      ],
      interests: [{ name: 'Food & Drink', min_pct: 30 }],
      credibility: 'high',
    })
  })

  /*
   * Pedir "70" tiene que traer también al que está en "good": si sólo trajera
   * "high" o mejor, el filtro sería más estricto de lo que la persona pidió y
   * escondería gente que sí cumple.
   */
  it('traduce la calidad de audiencia al escalón de abajo, no al de arriba', () => {
    const escalon = (calidadMinima: number): unknown =>
      ((cuerpoDeBusqueda({ ...base, audiencia: { calidadMinima } }).filters as Record<string, Record<string, unknown>>)
        .audience as Record<string, unknown>).credibility
    expect(escalon(95)).toBe('best')
    expect(escalon(80)).toBe('high')
    expect(escalon(70)).toBe('good')
    expect(escalon(50)).toBe('normal')
    expect(escalon(0)).toBe('bad')
  })

  /*
   * Un tramo inventado hace fallar el pedido entero. Perder los filtros buenos
   * por uno malo es peor que ignorar el malo.
   */
  it('descarta tramos de edad que no existen en vez de romper el pedido', () => {
    const cuerpo = cuerpoDeBusqueda({
      ...base,
      audiencia: { edadDelPublico: { tramos: ['25-34', '30-40'], porcentajeMinimo: 40 } },
    })
    const filtros = cuerpo.filters as { audience?: { age?: unknown } }
    expect(filtros.audience?.age).toEqual([{ range: '25-34', min_pct: 40 }])
  })

  it('sin tramos válidos no manda el filtro de edad vacío', () => {
    const cuerpo = cuerpoDeBusqueda({
      ...base,
      audiencia: { edadDelPublico: { tramos: ['99-100'], porcentajeMinimo: 40 } },
    })
    expect(cuerpo.filters).toEqual({})
  })

  it('se planta cuando la red no existe, en vez de mandar un pedido inválido', () => {
    expect(() => cuerpoDeBusqueda({ ...base, platform: 'LINKEDIN' })).toThrow(/LINKEDIN/)
  })
})

describe('leer un creador', () => {
  const creador = {
    user_id: '123',
    profile: {
      full_name: 'La Chef',
      username: 'lachef.ok',
      picture: 'https://cdn.influencers.club/a.jpg',
      followers: 48_210,
      engagement_percent: 4.31,
    },
  }

  it('lee los campos anidados como los manda', () => {
    expect(leerCreador('INSTAGRAM', creador)).toMatchObject({
      handle: 'lachef.ok',
      displayName: 'La Chef',
      followers: 48_210,
      engagementRate: 4.31,
      url: 'https://www.instagram.com/lachef.ok',
    })
  })

  it('descarta al que no trae usuario: sin él no hay perfil al que volver', () => {
    expect(leerCreador('INSTAGRAM', { profile: { full_name: 'Sin usuario' } })).toBeNull()
    expect(leerCreador('INSTAGRAM', { profile: { username: '   ' } })).toBeNull()
    expect(leerCreador('INSTAGRAM', null)).toBeNull()
  })

  it('deja en null lo que falta, sin convertirlo en cero', () => {
    const leido = leerCreador('INSTAGRAM', { profile: { username: 'alguien' } })
    expect(leido?.followers).toBeNull()
    expect(leido?.engagementRate).toBeNull()
    expect(leido?.displayName).toBeNull()
  })

  it('arma la URL según la red', () => {
    expect(urlDePerfil('TIKTOK', 'juan')).toBe('https://www.tiktok.com/@juan')
    expect(urlDePerfil('X', 'juan')).toBe('https://x.com/juan')
    expect(urlDePerfil('LINKEDIN', 'juan')).toBeNull()
  })
})

describe('el sobre de la respuesta', () => {
  it('lee los creadores, el total y el saldo', () => {
    const sobre = leerSobre({
      total: 812,
      limit: 20,
      // Su contrato lo declara como texto, no como número.
      credits_left: '9.87',
      accounts: [{ profile: { username: 'a' } }],
    })
    expect(sobre).toMatchObject({ ok: true, total: 812, creditosRestantes: 9.87 })
    expect(sobre.ok && sobre.creadores).toHaveLength(1)
  })

  it('no informa un saldo que no se entiende, en vez de mostrar NaN', () => {
    const sobre = leerSobre({ accounts: [], credits_left: 'sin datos' })
    expect(sobre).toMatchObject({ ok: true, creditosRestantes: null })
  })

  it('reconoce el error que viene adentro del cuerpo', () => {
    const sobre = leerSobre({ error: 'Discovery API credit limit reached.' })
    expect(sobre).toEqual({ ok: false, mensaje: 'Discovery API credit limit reached.' })
  })

  it('avisa cuando la respuesta no se entiende, en vez de devolver vacío', () => {
    expect(leerSobre(null).ok).toBe(false)
    expect(leerSobre({ nada: 1 }).ok).toBe(false)
  })

  /*
   * Cero resultados es una respuesta válida y no cuesta nada: cobra por creador
   * devuelto. No puede confundirse con un fallo.
   */
  it('cero creadores es una búsqueda que salió bien, no un error', () => {
    const sobre = leerSobre({ total: 0, accounts: [], credits_left: '10' })
    expect(sobre.ok).toBe(true)
    expect(sobre.ok && sobre.creadores).toEqual([])
  })
})

describe('los países, que van por nombre y no por código', () => {
  it('traduce los que ofrece la pantalla', () => {
    expect(nombreDePais('AR')).toBe('Argentina')
    expect(nombreDePais('ar')).toBe('Argentina')
    expect(nombreDePais('US')).toBe('United States')
    expect(nombreDePais('ES')).toBe('Spain')
  })

  /*
   * Un país que no sabemos cómo llama se omite en vez de viajar: mandarlo hace
   * fallar el pedido entero, y perder toda la búsqueda por un filtro es peor
   * que hacerla sin ese filtro.
   */
  it('omite el país desconocido en vez de romper la búsqueda entera', () => {
    expect(nombreDePais('ZZ')).toBeNull()
    const cuerpo = cuerpoDeBusqueda({ ...base, filtros: { pais: 'ZZ', seguidoresDesde: 5_000 } })
    expect(cuerpo.filters).toEqual({ number_of_followers: { min: 5_000 } })
  })
})

describe('los errores que devuelve de verdad', () => {
  /*
   * Su error viene de dos formas. La primera versión sólo entendía el texto
   * suelto, así que un pedido rechazado por un filtro caía en "no devolvió
   * resultados" y escondía el motivo: el fallo mudo que estos mapeos tienen que
   * evitar lo estaba cometiendo el mapeo. Esta respuesta es literal, copiada de
   * la API el 27/08/2026.
   */
  it('lee el arreglo de errores por campo y dice cuál filtro falló', () => {
    const sobre = leerSobre({
      error: [
        {
          field: 'location',
          error: "Invalid location: 'AR' is not a valid location, please check available locations",
        },
      ],
      error_code: 'invalid_filters',
    })
    expect(sobre.ok).toBe(false)
    expect(sobre.ok === false && sobre.mensaje).toContain('location')
    expect(sobre.ok === false && sobre.mensaje).toContain("Invalid location: 'AR'")
  })

  it('junta varios errores de campo en un mensaje solo', () => {
    const sobre = leerSobre({ error: [{ field: 'a', error: 'malo' }, { field: 'b', error: 'peor' }] })
    expect(sobre.ok === false && sobre.mensaje).toBe('a: malo · b: peor')
  })

  it('un arreglo vacío no se confunde con un error', () => {
    expect(leerSobre({ accounts: [], error: [] }).ok).toBe(true)
  })
})
