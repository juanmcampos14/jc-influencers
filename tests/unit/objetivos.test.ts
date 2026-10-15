import { describe, expect, it } from 'vitest'
import type { Frase } from '@/lib/domain/frase'
import { enCastellano } from '@/lib/i18n/castellano'
import {
  esVisibleParaCliente,
  evaluarObjetivo,
  evaluarObjetivos,
  type Mediciones,
  type Objetivo,
} from '@/lib/domain/objetivos'

const VACIO: Mediciones = {
  ALCANCE_ESTIMADO: null,
  ALCANCE_REAL: null,
  VISUALIZACIONES: null,
  INTERACCIONES: null,
  CLICS: null,
  PUBLICACIONES: null,
  PERFILES_APROBADOS: null,
  INVERSION_EN_TALENTO: null,
}

const objetivo = (extra: Partial<Objetivo> = {}): Objetivo => ({
  id: 'o1',
  metric: 'CLICS',
  direction: 'AL_MENOS',
  target: 1000,
  rationale: null,
  clientVisible: true,
  ...extra,
})

/*
 * El dominio devuelve la clave y sus valores, no la frase. Estos tests siguen
 * comprobando lo que se LEE --que diga cuánto falta, que no diga cero-- pero
 * pasando por las traducciones en castellano: así se verifica además que la
 * clave y sus valores encajen de verdad.
 */
const texto = enCastellano('objetivos')
const leer = (frase: Frase | null): string => (frase ? texto(frase.clave, frase.valores) : '')

describe('evaluarObjetivo', () => {
  it('sin dato NO es cero por ciento', () => {
    // Una barra en cero se lee como fracaso. Esto significa que nadie cargó
    // las métricas todavía, que es una cosa completamente distinta.
    const r = evaluarObjetivo(objetivo(), VACIO)
    expect(r.estado).toBe('SIN_DATO')
    expect(r.progreso).toBeNull()
    expect(leer(r.explicacion)).toContain('no se puede evaluar')
  })

  it('cero medido sí es cero por ciento', () => {
    const r = evaluarObjetivo(objetivo(), { ...VACIO, CLICS: 0 })
    expect(r.estado).toBe('EN_CAMINO')
    expect(r.progreso).toBe(0)
  })

  it('marca cumplido al llegar', () => {
    expect(evaluarObjetivo(objetivo(), { ...VACIO, CLICS: 1000 }).estado).toBe('CUMPLIDO')
    expect(leer(evaluarObjetivo(objetivo(), { ...VACIO, CLICS: 1500 }).explicacion)).toContain('por encima')
  })

  it('en camino informa cuánto falta', () => {
    const r = evaluarObjetivo(objetivo(), { ...VACIO, CLICS: 400 })
    expect(r.estado).toBe('EN_CAMINO')
    expect(leer(r.explicacion)).toContain('Faltan 600')
  })

  describe('un tope se cumple no pasándose', () => {
    const tope = objetivo({ metric: 'INVERSION_EN_TALENTO', direction: 'COMO_MUCHO', target: 5000 })

    it('dentro del tope está cumplido aunque el progreso sea bajo', () => {
      const r = evaluarObjetivo(tope, { ...VACIO, INVERSION_EN_TALENTO: 3000 })
      expect(r.estado).toBe('CUMPLIDO')
      expect(leer(r.explicacion)).toContain('60%')
    })

    it('pasarse es no alcanzado, y dice por cuánto', () => {
      const r = evaluarObjetivo(tope, { ...VACIO, INVERSION_EN_TALENTO: 6200 })
      expect(r.estado).toBe('NO_ALCANZADO')
      expect(leer(r.explicacion)).toContain('1200')
    })
  })

  it('un objetivo en cero no se evalúa contra nada', () => {
    const r = evaluarObjetivo(objetivo({ target: 0 }), { ...VACIO, CLICS: 50 })
    expect(r.estado).toBe('SIN_DATO')
  })
})

describe('evaluarObjetivos', () => {
  it('sin objetivos no opina', () => {
    // El producto no dice cómo viene una campaña que nadie se propuso medir.
    expect(evaluarObjetivos([], VACIO).veredicto).toBeNull()
  })

  it('con la mayoría sin datos se abstiene en vez de opinar sobre el resto', () => {
    const objetivos = [
      objetivo({ id: '1', metric: 'CLICS' }),
      objetivo({ id: '2', metric: 'VISUALIZACIONES' }),
      objetivo({ id: '3', metric: 'INTERACCIONES' }),
    ]
    const r = evaluarObjetivos(objetivos, { ...VACIO, CLICS: 2000 })
    expect(r.cumplidos).toBe(1)
    expect(r.sinDato).toBe(2)
    // Decir "1 de 3 cumplidos" acá sugeriría que 2 fallaron.
    expect(leer(r.veredicto)).toContain('no tienen datos cargados')
  })

  it('todo cumplido lo dice sin vueltas', () => {
    const r = evaluarObjetivos([objetivo()], { ...VACIO, CLICS: 1200 })
    expect(leer(r.veredicto)).toBe('Todos los objetivos cumplidos.')
  })

  it('mientras la campaña corre, ir por debajo es ir en camino', () => {
    // Decirle "no alcanzado" a una campaña que arrancó ayer es maltratar al
    // equipo con un dato que todavía no significa nada.
    const r = evaluarObjetivos(
      [objetivo({ id: '1' }), objetivo({ id: '2', metric: 'PUBLICACIONES', target: 10 })],
      { ...VACIO, CLICS: 1200, PUBLICACIONES: 3 },
    )
    expect(r.enCamino).toBe(1)
    expect(r.noAlcanzados).toBe(0)
    expect(leer(r.veredicto)).toContain('en camino')
  })

  it('con la campaña cerrada, ese mismo número es un objetivo que no se alcanzó', () => {
    const r = evaluarObjetivos(
      [objetivo({ id: '1' }), objetivo({ id: '2', metric: 'PUBLICACIONES', target: 10 })],
      { ...VACIO, CLICS: 1200, PUBLICACIONES: 3 },
      { cerrada: true },
    )
    expect(r.noAlcanzados).toBe(1)
    expect(leer(r.veredicto)).toContain('no se alcanzó')
    expect(leer(r.objetivos[1]?.explicacion ?? null)).toContain('faltaron')
  })
})

describe('esVisibleParaCliente', () => {
  it('la inversión en talento nunca llega al cliente, aunque esté marcada visible', () => {
    // De ahí se deduce el margen de la agencia.
    expect(esVisibleParaCliente(objetivo({ metric: 'INVERSION_EN_TALENTO', clientVisible: true }))).toBe(false)
  })

  it('respeta la marca en las demás', () => {
    expect(esVisibleParaCliente(objetivo({ clientVisible: true }))).toBe(true)
    expect(esVisibleParaCliente(objetivo({ clientVisible: false }))).toBe(false)
  })
})
