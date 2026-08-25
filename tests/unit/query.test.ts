import { describe, expect, it } from 'vitest'
import { hrefCon } from '@/lib/util/query'

describe('enlaces que conservan los filtros', () => {
  it('mantiene lo que ya estaba y pisa sólo lo que cambia', () => {
    const actual = { q: 'nike', estado: 'LIVE', pagina: '1' }
    expect(hrefCon('/campanas', actual, { pagina: 2 })).toBe('/campanas?q=nike&estado=LIVE&pagina=2')
  })

  it('borra un parámetro cuando el valor es null', () => {
    expect(hrefCon('/campanas', { q: 'nike', pagina: '3' }, { pagina: null })).toBe('/campanas?q=nike')
  })

  it('sin parámetros devuelve la ruta limpia', () => {
    expect(hrefCon('/campanas', {}, {})).toBe('/campanas')
  })

  it('cambiar de pestaña no pierde el filtro', () => {
    const actual = new URLSearchParams({ tab: 'perfiles', estado: 'PENDING', q: 'ana' })
    expect(hrefCon('/campanas/1', actual, { tab: 'funnel' })).toBe('/campanas/1?tab=funnel&estado=PENDING&q=ana')
  })

  it('acepta valores repetidos sin perderlos', () => {
    const actual = { nicho: ['finanzas', 'deportes'] }
    expect(hrefCon('/influencers', actual, { pagina: 2 })).toBe('/influencers?nicho=finanzas&nicho=deportes&pagina=2')
  })
})
