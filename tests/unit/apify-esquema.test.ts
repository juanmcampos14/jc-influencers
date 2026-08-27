import { describe, expect, it } from 'vitest'
import {
  aceptaUnSoloTermino,
  construirEntrada,
  EsquemaIncompletoError,
} from '@/lib/ports/apify-esquema'

const intencion = { terminos: ['finanzas', 'emprendimiento'], tope: 30 }

/**
 * Pasó de verdad: el adaptador estaba escrito para `apify/instagram-hashtag-
 * scraper`, que pide `hashtags` como lista, y el actor que se cargó pedía
 * `query` como texto. La corrida habría fallado DESPUÉS de cobrarse.
 */
describe('construirEntrada', () => {
  it('usa el nombre de campo que declara el actor', () => {
    const conLista = { properties: { hashtags: { type: 'array' }, resultsLimit: { type: 'integer' } } }
    expect(construirEntrada(conLista, intencion)).toEqual({
      hashtags: ['finanzas', 'emprendimiento'],
      resultsLimit: 30,
    })

    const conTexto = { properties: { query: { type: 'string' }, maxResults: { type: 'integer' } } }
    expect(construirEntrada(conTexto, intencion)).toEqual({ query: 'finanzas', maxResults: 30 })
  })

  it('a un actor de texto le manda UN término, no los tres pegados', () => {
    // "finanzas emprendimiento" no es ninguna de las dos búsquedas.
    const esquema = { properties: { query: { type: 'string' } } }
    expect(construirEntrada(esquema, intencion).query).toBe('finanzas')
  })

  it('avisa cuál campo obligatorio no supimos completar', () => {
    const esquema = {
      properties: { query: { type: 'string' }, cookies: { type: 'array' } },
      required: ['query', 'cookies'],
    }
    expect(() => construirEntrada(esquema, intencion)).toThrow(EsquemaIncompletoError)
    try {
      construirEntrada(esquema, intencion)
    } catch (error) {
      expect((error as EsquemaIncompletoError).faltantes).toEqual(['cookies'])
    }
  })

  it('sin esquema no inventa campos', () => {
    expect(construirEntrada(null, intencion)).toEqual({})
  })
})

describe('aceptaUnSoloTermino', () => {
  it('distingue el actor de lista del de texto', () => {
    expect(aceptaUnSoloTermino({ properties: { hashtags: { type: 'array' } } })).toBe(false)
    expect(aceptaUnSoloTermino({ properties: { query: { type: 'string' } } })).toBe(true)
  })
})
