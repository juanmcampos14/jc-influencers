import { describe, expect, it } from 'vitest'
import { apifyInput, apifyToRecord, explicarRechazoApify } from '@/lib/ports/scouting-apify'

/**
 * Lo que se puede probar sin gastar: que la entrada que armamos tenga la forma
 * que espera cada actor, y que un registro de salida entre bien en nuestro
 * modelo -- incluyendo el caso feo, que es cuando el perfil viene anidado.
 *
 * Lo que NO prueba esto: que el actor exista y responda. Eso necesita un token
 * y se comprueba con `npm run scouting:check`.
 */

describe('Apify · entrada de cada actor', () => {
  it('separa hashtags de búsquedas libres en TikTok', () => {
    const entrada = apifyInput('TIKTOK', 'DISCOVER', { keywords: ['#fitness', 'entrenamiento'], limit: 10 })
    expect(entrada.hashtags).toEqual(['fitness'])
    expect(entrada.searchQueries).toEqual(['entrenamiento'])
  })

  it('reparte el tope entre las palabras clave', () => {
    const entrada = apifyInput('TIKTOK', 'DISCOVER', { keywords: ['#a', '#b'], limit: 10 })
    expect(entrada.resultsPerPage).toBe(5)
  })

  it('nunca pide sin tope', () => {
    for (const plataforma of ['TIKTOK', 'YOUTUBE', 'INSTAGRAM'] as const) {
      const entrada = apifyInput(plataforma, 'DISCOVER', { keywords: ['x'], limit: 25 })
      const tope = entrada.resultsPerPage ?? entrada.maxResults ?? entrada.resultsLimit
      expect(tope, `${plataforma} sin tope`).toBeTypeOf('number')
    }
  })

  it('acota un pedido desmedido', () => {
    // Un tope de diez mil sería una factura, no una búsqueda.
    const entrada = apifyInput('YOUTUBE', 'DISCOVER', { keywords: ['x'], limit: 10_000 })
    expect(entrada.maxResults).toBe(500)
  })

  it('no descarga videos: se pagan y no los usamos', () => {
    const entrada = apifyInput('TIKTOK', 'DISCOVER', { keywords: ['#x'], limit: 5 })
    expect(entrada.shouldDownloadVideos).toBe(false)
  })
})

describe('Apify · registros de vuelta', () => {
  it('lee un perfil plano de Instagram', () => {
    const registro = apifyToRecord(
      {
        username: 'lamarca',
        fullName: 'La Marca',
        followersCount: 31600,
        biography: 'Hola',
        profilePicUrl: 'https://cdn/x.jpg',
      },
      'INSTAGRAM',
    )
    expect(registro?.handle).toBe('lamarca')
    expect(registro?.followers).toBe(31600)
    expect(registro?.urlNormalized).toBe('instagram.com/lamarca')
  })

  it('encuentra el perfil cuando viene anidado en el post', () => {
    // El actor de TikTok devuelve videos con el autor adentro de `authorMeta`.
    const registro = apifyToRecord(
      {
        id: '123',
        webVideoUrl: 'https://www.tiktok.com/@creador/video/123',
        authorMeta: { name: 'creador', nickName: 'Un Creador', fans: 49400, signature: 'bio' },
      },
      'TIKTOK',
    )
    expect(registro?.handle).toBe('creador')
    expect(registro?.followers).toBe(49400)
    expect(registro?.displayName).toBe('Un Creador')
    // Y NO se queda con la URL del video: lo que guardamos es el perfil.
    expect(registro?.url).toBe('https://www.tiktok.com/@creador')
  })

  it('lee suscriptores de YouTube aunque se llamen distinto', () => {
    const registro = apifyToRecord(
      { channelName: 'micanal', title: 'Mi Canal', numberOfSubscribers: 165000 },
      'YOUTUBE',
    )
    expect(registro?.followers).toBe(165000)
  })

  it('acepta un número escrito como texto', () => {
    const registro = apifyToRecord({ username: 'x', followersCount: '1,234' }, 'INSTAGRAM')
    expect(registro?.followers).toBe(1234)
  })

  it('descarta lo que no permite identificar un perfil', () => {
    expect(apifyToRecord({ id: '1', likes: 10 }, 'INSTAGRAM')).toBeNull()
  })

  it('no inventa engagement', () => {
    // Los actores no lo devuelven. Dejarlo en null es la respuesta honesta.
    const registro = apifyToRecord({ username: 'x', followersCount: 100 }, 'INSTAGRAM')
    expect(registro?.engagementRate).toBeNull()
  })
})

describe('Apify · rechazos', () => {
  it('separa credenciales de actor inexistente', () => {
    expect(explicarRechazoApify(401, '')).toContain('APIFY_TOKEN')
    expect(explicarRechazoApify(404, 'not found')).toContain('actor')
    expect(explicarRechazoApify(402, 'insufficient credit')).toContain('crédito')
  })

  it('conserva el detalle original de lo no previsto', () => {
    expect(explicarRechazoApify(500, 'algo raro del proveedor')).toContain('algo raro del proveedor')
  })
})
