import { describe, expect, it } from 'vitest'
import { __testing } from '@/lib/ports/brand-extractor'

const base = new URL('https://lamarca.com/')

/**
 * Elegir bien el candidato es la mitad del trabajo: si el fondo termina siendo
 * el logo o un ícono, el espacio se ve peor que sin fondo.
 */
describe('candidatos a fondo', () => {
  const buscar = (html: string) => __testing.findBackdropCandidates(html, base)

  it('prioriza la imagen que la marca eligió para compartir', () => {
    const html = `
      <meta property="og:image" content="/hero-tarjetas.jpg">
      <img src="/otra.jpg">
    `
    expect(buscar(html)[0]).toBe('https://lamarca.com/hero-tarjetas.jpg')
  })

  it('descarta logos, íconos y favicons', () => {
    const html = `
      <img src="/assets/logo-kast.png">
      <img src="/favicon-32.png">
      <img src="/user-avatar.jpg">
      <img src="/hero-producto.jpg">
    `
    const encontrados = buscar(html)
    expect(encontrados).toEqual(['https://lamarca.com/hero-producto.jpg'])
  })

  it('descarta SVG, que en un sitio son logos', () => {
    expect(buscar('<img src="/ilustracion.svg">')).toEqual([])
  })

  it('de un srcset se queda con la más grande', () => {
    const html = '<img srcset="/chica.jpg 400w, /grande.jpg 1600w, /media.jpg 800w" src="/chica.jpg">'
    expect(buscar(html)[0]).toBe('https://lamarca.com/grande.jpg')
  })

  it('lee los fondos declarados en CSS', () => {
    const html = `<div style="background-image: url('/escena.jpg')"></div>`
    expect(buscar(html)).toContain('https://lamarca.com/escena.jpg')
  })

  it('ignora una URL rota sin romperse', () => {
    expect(() => buscar('<img src="http://[roto">')).not.toThrow()
  })

  it('no repite la misma imagen', () => {
    const html = '<meta property="og:image" content="/hero.jpg"><img src="/hero.jpg">'
    expect(buscar(html).filter((url) => url.endsWith('/hero.jpg'))).toHaveLength(1)
  })
})
