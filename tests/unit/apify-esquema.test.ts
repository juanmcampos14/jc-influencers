import { describe, expect, it } from 'vitest'
import {
  aceptaUnSoloTermino,
  construirEntrada,
  EsquemaIncompletoError,
  registrosRealesDe,
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

describe('respeta los límites que declara el actor', () => {
  /*
   * Pasó de verdad: se pidieron 5 perfiles y el actor respondió
   * "maxResults must be >= 30". Una corrida fallida por un número que el
   * esquema ya declaraba.
   */
  const conMinimo = { properties: { query: { type: 'string' }, maxResults: { type: 'integer', minimum: 30 } } }

  it('sube al mínimo que el actor exige', () => {
    expect(construirEntrada(conMinimo, { terminos: ['finanzas'], tope: 5 }).maxResults).toBe(30)
  })

  it('no baja de lo pedido cuando ya supera el mínimo', () => {
    expect(construirEntrada(conMinimo, { terminos: ['finanzas'], tope: 100 }).maxResults).toBe(100)
  })

  it('respeta también el máximo', () => {
    const conMaximo = { properties: { query: { type: 'string' }, maxResults: { type: 'integer', maximum: 50 } } }
    expect(construirEntrada(conMaximo, { terminos: ['x'], tope: 500 }).maxResults).toBe(50)
  })

  it('registrosRealesDe dice cuántos van a venir de verdad', () => {
    // Sin esto el costo estimado sería una mentira: pedir 5 no sale más barato.
    expect(registrosRealesDe(conMinimo, 5)).toBe(30)
    expect(registrosRealesDe(conMinimo, 80)).toBe(80)
    expect(registrosRealesDe(null, 7)).toBe(7)
  })
})

describe('aceptaUnSoloTermino', () => {
  it('distingue el actor de lista del de texto', () => {
    expect(aceptaUnSoloTermino({ properties: { hashtags: { type: 'array' } } })).toBe(false)
    expect(aceptaUnSoloTermino({ properties: { query: { type: 'string' } } })).toBe(true)
  })
})

/**
 * Una corrida ABORTADA que trajo datos no es un fracaso.
 *
 * Apify corta la corrida sola cuando se alcanza el tope que nosotros le
 * pasamos, y la marca ABORTED. Encontrado ejecutando de verdad: 28 perfiles
 * traídos y cobrados (US$ 0,09), y la pantalla decía "falló". Se pagó por datos
 * que se tiraron.
 */
describe('cómo leer el final de una corrida', () => {
  const leer = (situacion: string, traidos: number): 'FAILED' | 'RUNNING' | 'COMPLETED' => {
    const cortadaConDatos = situacion === 'ABORTED' && traidos > 0
    if (!cortadaConDatos && ['FAILED', 'ABORTED', 'TIMED-OUT'].includes(situacion)) return 'FAILED'
    if (situacion !== 'SUCCEEDED' && !cortadaConDatos) return 'RUNNING'
    return 'COMPLETED'
  }

  it('abortada CON datos se toma como terminada', () => {
    expect(leer('ABORTED', 28)).toBe('COMPLETED')
  })

  it('abortada SIN datos sí es un fracaso', () => {
    expect(leer('ABORTED', 0)).toBe('FAILED')
  })

  it('lo que falló de verdad sigue fallando', () => {
    expect(leer('FAILED', 12)).toBe('FAILED')
    expect(leer('TIMED-OUT', 0)).toBe('FAILED')
  })

  it('en curso sigue en curso', () => {
    expect(leer('RUNNING', 3)).toBe('RUNNING')
  })
})
