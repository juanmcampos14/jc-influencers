import { describe, expect, it } from 'vitest'

/**
 * El preflight del scouting tiene que distinguir "hay algo que mirar" de "esto
 * no se puede ejecutar".
 *
 * Pasó de verdad: la pantalla avisaba que el proveedor no tenía dataset para
 * Instagram en modo descubrir, y el botón de ejecutar seguía habilitado. Se
 * gastaba un clic para llegar a un error que el sistema ya conocía, y el
 * segundo intento chocaba contra una corrida ya consumida.
 */
type Preflight = { puedeEjecutar: boolean; bloqueos: string[]; warnings: string[] }

const armar = (bloqueos: string[], warnings: string[] = []): Preflight => ({
  puedeEjecutar: bloqueos.length === 0,
  bloqueos,
  warnings,
})

describe('bloqueos del preflight', () => {
  it('sin bloqueos se puede ejecutar', () => {
    expect(armar([]).puedeEjecutar).toBe(true)
  })

  it('un aviso NO impide ejecutar', () => {
    // Los avisos son para saber, no para frenar. Si frenaran, serían bloqueos.
    expect(armar([], ['Las métricas del proveedor pueden estar desactualizadas.']).puedeEjecutar).toBe(true)
  })

  it('cualquier bloqueo impide ejecutar', () => {
    expect(armar(['Ningún proveedor puede descubrir en INSTAGRAM.']).puedeEjecutar).toBe(false)
  })

  it('se informan todos los bloqueos, no sólo el primero', () => {
    // Arreglar uno y volver a chocar con el otro es la peor forma de enterarse.
    const preflight = armar(['Falta el dataset.', 'No queda presupuesto este mes.'])
    expect(preflight.bloqueos).toHaveLength(2)
    expect(preflight.puedeEjecutar).toBe(false)
  })
})

/**
 * Ningún proveedor cubre todo. Bright Data no tiene descubrir por palabra clave
 * en Instagram --su biblioteca sólo ofrece "collect by URL" y "discover by user
 * name"--; Apify sí. Antes había que elegir UN proveedor para todo y perder lo
 * que el otro hacía mejor.
 */
describe('elegir proveedor según lo que se necesita', () => {
  type Prov = { name: string; supports: (p: string, m: string) => boolean }

  const elegir = (preferido: Prov, alternativo: Prov, plataforma: string, modo: string): Prov => {
    if (preferido.supports(plataforma, modo)) return preferido
    return alternativo.supports(plataforma, modo) ? alternativo : preferido
  }

  const brightdata: Prov = {
    name: 'brightdata',
    supports: (p, m) => !(p === 'INSTAGRAM' && m === 'DISCOVER'),
  }
  const apify: Prov = { name: 'apify', supports: (p, m) => p === 'INSTAGRAM' && m === 'DISCOVER' }

  it('usa el preferido cuando puede hacer el trabajo', () => {
    expect(elegir(brightdata, apify, 'TIKTOK', 'DISCOVER').name).toBe('brightdata')
    expect(elegir(brightdata, apify, 'INSTAGRAM', 'ENRICH').name).toBe('brightdata')
  })

  it('cae al otro cuando el preferido no puede', () => {
    expect(elegir(brightdata, apify, 'INSTAGRAM', 'DISCOVER').name).toBe('apify')
  })

  it('si ninguno puede, devuelve el preferido para que el aviso lo nombre', () => {
    const nadie: Prov = { name: 'ninguno', supports: () => false }
    expect(elegir(nadie, nadie, 'YOUTUBE', 'DISCOVER').name).toBe('ninguno')
  })
})
