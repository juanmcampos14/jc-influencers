import { describe, expect, it } from 'vitest'
import { idiomaDeCabecera, idiomaDePais, resolverIdioma } from '@/i18n/idiomas'

/**
 * Cómo se decide en qué idioma se abre la plataforma.
 *
 * El orden importa más que cualquier caso suelto: si la ubicación pudiera dar
 * vuelta una elección explícita, alguien que eligió inglés desde Buenos Aires
 * vería la plataforma volver al español en cada recarga, sin entender por qué.
 */

describe('lo que pide el navegador', () => {
  it('lee el idioma de la cabecera', () => {
    expect(idiomaDeCabecera('en-US,en;q=0.9')).toBe('en')
    expect(idiomaDeCabecera('es-AR,es;q=0.9')).toBe('es')
  })

  /*
   * El navegador manda una lista con pesos, no un idioma. Quedarse con el
   * primero que aparece ignora lo que la persona realmente prefiere.
   */
  it('respeta el peso, no el orden de escritura', () => {
    expect(idiomaDeCabecera('en;q=0.5, es;q=1.0')).toBe('es')
    expect(idiomaDeCabecera('es;q=0.2, en;q=0.9')).toBe('en')
  })

  it('saltea los idiomas que no hablamos', () => {
    expect(idiomaDeCabecera('fr-FR,fr;q=0.9,pt;q=0.8,en;q=0.7')).toBe('en')
    expect(idiomaDeCabecera('fr-FR,de;q=0.9')).toBeNull()
  })

  it('no se cae con una cabecera vacía o rota', () => {
    expect(idiomaDeCabecera(null)).toBeNull()
    expect(idiomaDeCabecera('')).toBeNull()
    expect(idiomaDeCabecera(',,;q=')).toBeNull()
  })
})

describe('lo que sugiere el país', () => {
  it('español donde se habla español', () => {
    for (const pais of ['AR', 'MX', 'ES', 'CL', 'UY']) expect(idiomaDePais(pais)).toBe('es')
  })

  it('inglés en el resto', () => {
    for (const pais of ['US', 'GB', 'DE', 'BR']) expect(idiomaDePais(pais)).toBe('en')
  })

  it('sin país no sugiere nada', () => {
    expect(idiomaDePais(null)).toBeNull()
    expect(idiomaDePais('')).toBeNull()
  })
})

describe('la decisión completa', () => {
  /*
   * El caso que motiva todo el orden: una elección explícita no la revierte
   * nada. Ni el navegador, ni el país, ni una recarga.
   */
  it('lo que la persona eligió le gana al navegador', () => {
    expect(resolverIdioma({ cookie: 'es', acceptLanguage: 'en-US,en;q=0.9' })).toBe('es')
    expect(resolverIdioma({ cookie: 'en', acceptLanguage: 'es-AR,es;q=0.9' })).toBe('en')
  })

  it('y también al país', () => {
    expect(resolverIdioma({ cookie: 'en', acceptLanguage: null, pais: 'AR' })).toBe('en')
    expect(resolverIdioma({ cookie: 'es', acceptLanguage: null, pais: 'US' })).toBe('es')
  })

  /*
   * Un argentino de viaje por Estados Unidos sigue queriendo español, y su
   * navegador lo dice. Por eso la ubicación va DESPUÉS del navegador.
   */
  it('el navegador le gana al país', () => {
    expect(resolverIdioma({ acceptLanguage: 'es-AR,es;q=0.9', pais: 'US' })).toBe('es')
    expect(resolverIdioma({ acceptLanguage: 'en-US,en;q=0.9', pais: 'AR' })).toBe('en')
  })

  it('el país decide sólo cuando el navegador no dijo nada', () => {
    expect(resolverIdioma({ acceptLanguage: null, pais: 'US' })).toBe('en')
    expect(resolverIdioma({ acceptLanguage: null, pais: 'AR' })).toBe('es')
  })

  it('sin nada, español', () => {
    expect(resolverIdioma({})).toBe('es')
    expect(resolverIdioma({ cookie: '', acceptLanguage: '', pais: '' })).toBe('es')
  })

  /*
   * La cookie la escribe el navegador y puede traer cualquier cosa. Un valor
   * inventado no puede dejar la plataforma sin idioma.
   */
  it('una cookie con basura se ignora y se sigue decidiendo', () => {
    expect(resolverIdioma({ cookie: 'pt', acceptLanguage: 'en-US' })).toBe('en')
    expect(resolverIdioma({ cookie: '../../etc/passwd', pais: 'AR' })).toBe('es')
  })
})

describe('los archivos de textos', () => {
  /*
   * Una clave que existe en español y no en inglés no rompe nada: se muestra
   * la clave cruda --"navegacion.panel"-- en medio de la pantalla. Es el tipo
   * de error que no se ve hasta que lo ve un cliente, así que se verifica acá.
   */
  it('español e inglés tienen exactamente las mismas claves', async () => {
    const es = (await import('../../messages/es.json')).default as Record<string, Record<string, string>>
    const en = (await import('../../messages/en.json')).default as Record<string, Record<string, string>>

    const aplanar = (d: Record<string, Record<string, string>>): string[] =>
      Object.entries(d).flatMap(([grupo, claves]) => Object.keys(claves).map((k) => `${grupo}.${k}`)).sort()

    const soloEs = aplanar(es).filter((k) => !aplanar(en).includes(k))
    const soloEn = aplanar(en).filter((k) => !aplanar(es).includes(k))
    expect(soloEs, `faltan en inglés: ${soloEs.join(', ')}`).toEqual([])
    expect(soloEn, `faltan en español: ${soloEn.join(', ')}`).toEqual([])
  })

  it('ningún texto quedó vacío', async () => {
    for (const idioma of ['es', 'en'] as const) {
      const d = (await import(`../../messages/${idioma}.json`)).default as Record<string, Record<string, string>>
      for (const [grupo, claves] of Object.entries(d)) {
        for (const [clave, valor] of Object.entries(claves)) {
          expect(String(valor).trim(), `${idioma}: ${grupo}.${clave} está vacío`).not.toBe('')
        }
      }
    }
  })
})

describe('fechas, números y plata siguen al idioma', () => {
  /*
   * No es cosmético. Un angloparlante lee "1.234" como uno coma dos tres
   * cuatro, y en una pantalla con plata eso se paga.
   */
  it('cada idioma escribe lo suyo', async () => {
    const { formatDate, formatMoney, formatNumber, formatPercent } = await import('@/lib/util/format')
    const d = new Date('2026-08-31T15:00:00Z')
    const tz = 'America/Argentina/Buenos_Aires'

    expect(formatDate(d, tz, 'es')).toBe('31 ago 2026')
    expect(formatDate(d, tz, 'en')).toBe('Aug 31, 2026')

    expect(formatNumber(110177, 'es')).toBe('110.177')
    expect(formatNumber(110177, 'en')).toBe('110,177')

    expect(formatMoney(1234.5, 'USD', 'es')).toContain('1.235')
    expect(formatMoney(1234.5, 'USD', 'en')).toContain('1,235')

    expect(formatPercent(4.31, 'es')).toBe('4,31%')
    expect(formatPercent(4.31, 'en')).toBe('4.31%')
  })

  /* El espacio antes de la unidad es del español; en inglés va pegado. */
  it('los seguidores abreviados respetan la convención de cada idioma', async () => {
    const { formatFollowers } = await import('@/lib/util/format')
    expect(formatFollowers(48210, 'es')).toBe('48,2 k')
    expect(formatFollowers(48210, 'en')).toBe('48.2k')
    expect(formatFollowers(1_250_000, 'es')).toBe('1,3 M')
    expect(formatFollowers(1_250_000, 'en')).toBe('1.3M')
  })

  it('sin idioma sigue siendo español, como antes', async () => {
    const { formatNumber, formatFollowers } = await import('@/lib/util/format')
    expect(formatNumber(110177)).toBe('110.177')
    expect(formatFollowers(48210)).toBe('48,2 k')
  })
})
