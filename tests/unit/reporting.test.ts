import { describe, expect, it } from 'vitest'
import { contextoDeResultados, type ResumenDeResultados } from '@/lib/repos/reporting'

const base = (): ResumenDeResultados => ({
  campaignId: 'c1',
  publicaciones: { total: 4, publicadas: 4, conLink: 2 },
  views: { total: 10_000, con: 2, sin: 2 },
  likes: { total: 400, con: 2, sin: 2 },
  comments: { total: 50, con: 2, sin: 2 },
  shares: { total: 0, con: 0, sin: 4 },
  saves: { total: 0, con: 0, sin: 4 },
  reach: { total: 0, con: 0, sin: 4 },
  interacciones: { total: 450, con: 2, sin: 2 },
  tasaDeInteraccion: 4.5,
  clics: { total: 120, personas: 90, bots: 30, links: 1 },
  huecos: ['2 de 4 publicaciones no tienen visualizaciones cargadas.'],
  entregas: [],
  links: [],
})

/**
 * El contexto que se le pasa al modelo es donde se gana o se pierde la
 * honestidad del reporte. Si le mandamos sólo los números que existen, asume
 * que ese es el total.
 */
describe('contextoDeResultados', () => {
  it('dice sobre cuántas publicaciones se calculó cada total', () => {
    const texto = contextoDeResultados(base())
    expect(texto).toContain('10000 sumando 2 de 4 publicaciones')
    expect(texto).toContain('faltan 2')
  })

  it('lo que nadie cargó se dice SIN DATO, no cero', () => {
    const texto = contextoDeResultados(base())
    expect(texto).toContain('Compartidos: SIN DATO')
    expect(texto).not.toMatch(/Compartidos: 0\b/)
  })

  it('marca explícitamente que la ausencia no es una caída', () => {
    const texto = contextoDeResultados(base())
    expect(texto).toContain('Lo que NADIE cargó todavía')
    expect(texto).toContain('no es cero')
  })

  it('la tasa aclara sobre qué subconjunto se calculó', () => {
    expect(contextoDeResultados(base())).toContain('sólo sobre las publicaciones que tienen las dos cosas')
  })

  it('sin ninguna publicación con las dos cosas, la tasa no existe', () => {
    const texto = contextoDeResultados({ ...base(), tasaDeInteraccion: null })
    expect(texto).toContain('Tasa de interacción: SIN DATO')
  })

  it('separa los clics medidos por nosotros de lo que reportan las redes', () => {
    const texto = contextoDeResultados(base())
    expect(texto).toContain('esto sí lo medimos nosotros')
    expect(texto).toContain('30 descartados por parecer bots')
  })

  it('una campaña sin links lo declara en vez de mostrar cero clics', () => {
    const texto = contextoDeResultados({ ...base(), clics: { total: 0, personas: 0, bots: 0, links: 0 } })
    expect(texto).toContain('No hay links medidos')
  })
})
