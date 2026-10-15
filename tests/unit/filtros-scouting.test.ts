import { describe, expect, it } from 'vitest'
import { evaluarCreador, hayFiltros, type CreadorFiltrable } from '@/lib/domain/filtros-scouting'

const completo: CreadorFiltrable = {
  followers: 25_000,
  engagementRate: 4.2,
  country: 'AR',
  bio: 'Contadora en Córdoba. Finanzas personales.',
}

describe('evaluarCreador', () => {
  it('sin filtros, cumple', () => {
    expect(evaluarCreador(completo, {}).veredicto).toBe('CUMPLE')
  })

  it('cumple cuando todos los datos dan', () => {
    const r = evaluarCreador(completo, {
      pais: 'AR',
      zona: 'córdoba',
      bioMenciona: 'contadora',
      seguidoresDesde: 10_000,
      seguidoresHasta: 200_000,
      engagementMinimo: 2.5,
    })
    expect(r.veredicto).toBe('CUMPLE')
    expect(r.motivos).toEqual([])
  })

  it('ignora acentos y mayúsculas', () => {
    expect(evaluarCreador(completo, { zona: 'CORDOBA' }).veredicto).toBe('CUMPLE')
  })

  describe('al que le falta el dato se lo MARCA, no se lo descarta', () => {
    it('sin país no es "no cumple": es "no sabemos"', () => {
      // Descartarlo escondería gente que podía servir y haría creer que la
      // lista está completa.
      const r = evaluarCreador({ ...completo, country: null }, { pais: 'AR' })
      expect(r.veredicto).toBe('SIN_DATO')
      expect(r.motivos[0]?.clave).toBe('motivoSinPais')
    })

    it('sin engagement tampoco', () => {
      expect(evaluarCreador({ ...completo, engagementRate: null }, { engagementMinimo: 3 }).veredicto).toBe(
        'SIN_DATO',
      )
    })

    it('sin bio no se puede comprobar la zona', () => {
      expect(evaluarCreador({ ...completo, bio: null }, { zona: 'rosario' }).veredicto).toBe('SIN_DATO')
    })
  })

  describe('un incumplimiento seguro gana sobre un dato faltante', () => {
    it('pocos seguidores es NO CUMPLE aunque además falte el país', () => {
      const r = evaluarCreador(
        { ...completo, followers: 500, country: null },
        { seguidoresDesde: 10_000, pais: 'AR' },
      )
      expect(r.veredicto).toBe('NO_CUMPLE')
      expect(r.motivos[0]?.clave).toBe('motivoPocosSeguidores')
    })
  })

  it('el rango de seguidores corta por arriba y por abajo', () => {
    expect(evaluarCreador({ ...completo, followers: 5_000 }, { seguidoresDesde: 10_000 }).veredicto).toBe(
      'NO_CUMPLE',
    )
    expect(evaluarCreador({ ...completo, followers: 900_000 }, { seguidoresHasta: 200_000 }).veredicto).toBe(
      'NO_CUMPLE',
    )
  })

  it('un país distinto es un incumplimiento, no un dato faltante', () => {
    const r = evaluarCreador({ ...completo, country: 'MX' }, { pais: 'AR' })
    expect(r.veredicto).toBe('NO_CUMPLE')
    expect(r.motivos[0]).toEqual({ clave: 'motivoOtroPais', valores: { pais: 'MX' } })
  })
})

describe('hayFiltros', () => {
  it('reconoce cuándo no se pidió nada', () => {
    expect(hayFiltros({})).toBe(false)
    expect(hayFiltros({ pais: null, zona: '' })).toBe(false)
    expect(hayFiltros({ pais: 'AR' })).toBe(true)
    expect(hayFiltros({ seguidoresDesde: 10_000 })).toBe(true)
  })
})

/**
 * Lo que el proveedor ya filtró.
 *
 * Esto salió de un caso real: se pidieron creadores argentinos a un proveedor
 * que filtra por país en el origen pero no devuelve el país en la respuesta.
 * La pantalla mostró "0 cumplen · 5 no se pudieron comprobar" sobre cinco
 * resultados que el proveedor había garantizado argentinos. Decir que no se
 * pudo comprobar algo que sí se garantizó es tan poco honesto como afirmar lo
 * que no se sabe.
 */
describe('filtros que aplicó el proveedor', () => {
  const sinDatos: CreadorFiltrable = {
    followers: 48_000,
    engagementRate: null,
    country: null,
    bio: null,
  }

  it('sin garantía, la falta del dato se marca', () => {
    const r = evaluarCreador(sinDatos, { pais: 'AR' })
    expect(r.veredicto).toBe('SIN_DATO')
    expect(r.motivos).toContainEqual({ clave: 'motivoSinPais' })
  })

  it('con la garantía del proveedor, cumple aunque no venga el dato', () => {
    expect(evaluarCreador(sinDatos, { pais: 'AR' }, ['pais']).veredicto).toBe('CUMPLE')
  })

  it('la garantía es por filtro, no en bloque', () => {
    // El país lo filtró él; el engagement no, y ese dato falta.
    const r = evaluarCreador(sinDatos, { pais: 'AR', engagementMinimo: 3 }, ['pais'])
    expect(r.veredicto).toBe('SIN_DATO')
    expect(r.motivos).toEqual([{ clave: 'motivoSinEngagement' }])
  })

  /*
   * Un incumplimiento seguro sigue ganando: si el proveedor dijo que filtró por
   * seguidores y aun así llegó alguien fuera de rango, se informa. La garantía
   * no puede tapar un dato que la contradice.
   */
  it('lo que no se garantizó y no da, sigue quedando fuera', () => {
    const r = evaluarCreador({ ...sinDatos, followers: 500 }, { pais: 'AR', seguidoresDesde: 10_000 }, ['pais'])
    expect(r.veredicto).toBe('NO_CUMPLE')
  })
})
