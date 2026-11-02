import { describe, expect, it } from 'vitest'
import { codigoDePais, paraWhatsapp } from '@/lib/domain/whatsapp'

/**
 * Un enlace de WhatsApp mal armado no falla: abre un chat con otra persona, o
 * con nadie. Nadie se entera hasta que alguien manda un mensaje al vacío. Por
 * eso el enlace se arma sólo cuando el código de país se SABE.
 */
describe('paraWhatsapp', () => {
  it('sin número no hay botón', () => {
    expect(paraWhatsapp(null).estado).toBe('SIN_NUMERO')
    expect(paraWhatsapp('   ').estado).toBe('SIN_NUMERO')
  })

  it('un número internacional se usa tal cual, sin signos', () => {
    const r = paraWhatsapp('+34 612 345 678')
    expect(r).toEqual({
      estado: 'LISTO',
      url: 'https://wa.me/34612345678',
      e164: '+34612345678',
      paraMostrar: '+34 612 345 678',
    })
  })

  it('el 00 de salida internacional vale lo mismo que el +', () => {
    const r = paraWhatsapp('0054 9 11 1234-5678')
    expect(r.estado).toBe('LISTO')
    if (r.estado === 'LISTO') expect(r.url).toBe('https://wa.me/5491112345678')
  })

  it('un número local se completa con el país de la ficha', () => {
    const r = paraWhatsapp('612 345 678', 'ESPAÑA')
    expect(r.estado).toBe('LISTO')
    if (r.estado === 'LISTO') expect(r.url).toBe('https://wa.me/34612345678')
  })

  /*
   * El caso que hace falta mirar: sin país no se inventa un prefijo. Es la
   * diferencia entre "no te puedo abrir el chat" y abrirle el chat a un
   * desconocido en otro continente.
   */
  it('un número local sin país no genera enlace', () => {
    expect(paraWhatsapp('612 345 678').estado).toBe('SIN_CODIGO_DE_PAIS')
    expect(paraWhatsapp('612 345 678', 'LATAM').estado).toBe('SIN_CODIGO_DE_PAIS')
    expect(paraWhatsapp('612 345 678', 'GLOBAL').estado).toBe('SIN_CODIGO_DE_PAIS')
  })

  it('no duplica el código cuando el número ya lo trae sin el +', () => {
    const r = paraWhatsapp('5491112345678', 'ARG')
    expect(r.estado).toBe('LISTO')
    if (r.estado === 'LISTO') expect(r.url).toBe('https://wa.me/5491112345678')
  })

  it('un cero de salida local no viaja al número internacional', () => {
    const r = paraWhatsapp('011 1234 5678', 'ARG')
    expect(r.estado).toBe('LISTO')
    if (r.estado === 'LISTO') expect(r.url).toBe('https://wa.me/541112345678')
  })

  it('algo que no es un teléfono no genera enlace', () => {
    expect(paraWhatsapp('consultar').estado).toBe('SIN_CODIGO_DE_PAIS')
    expect(paraWhatsapp('123', 'ARG').estado).toBe('SIN_CODIGO_DE_PAIS')
  })

  it('conserva el número tal cual se cargó, para mostrarlo', () => {
    const r = paraWhatsapp('+34 612 345 678')
    if (r.estado === 'LISTO') expect(r.paraMostrar).toBe('+34 612 345 678')
  })
})

describe('codigoDePais', () => {
  it('entiende el nombre y la sigla de los mercados de la agencia', () => {
    expect(codigoDePais('ESPAÑA')).toBe('34')
    expect(codigoDePais('es')).toBe('34')
    expect(codigoDePais('ARG')).toBe('54')
    expect(codigoDePais('MEX')).toBe('52')
  })

  it('una región no es un país', () => {
    expect(codigoDePais('LATAM')).toBeNull()
    expect(codigoDePais('EUROPA')).toBeNull()
    expect(codigoDePais('GLOBAL')).toBeNull()
  })
})
