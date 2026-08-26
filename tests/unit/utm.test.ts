import { describe, expect, it } from 'vitest'
import {
  construirDestino,
  DestinoInvalidoError,
  generarSlug,
  hostDe,
  normalizarUtm,
  pareceBot,
} from '@/lib/domain/utm'

describe('construirDestino', () => {
  const utms = { source: 'instagram', medium: 'influencer', campaign: 'ronda-uno' }

  it('pega los UTMs sin tocar lo que ya estaba', () => {
    const url = new URL(construirDestino('https://marca.com/producto?color=azul', utms))
    expect(url.searchParams.get('color')).toBe('azul')
    expect(url.searchParams.get('utm_source')).toBe('instagram')
    expect(url.searchParams.get('utm_campaign')).toBe('ronda-uno')
  })

  it('pisa los utm_ que ya venían pegados a mano', () => {
    // Una plantilla vieja copiada mandaría los clics de esta campaña a la
    // medición de otra.
    const url = new URL(construirDestino('https://marca.com/?utm_campaign=vieja', utms))
    expect(url.searchParams.get('utm_campaign')).toBe('ronda-uno')
  })

  it('borra los opcionales cuando no se mandan', () => {
    const url = new URL(construirDestino('https://marca.com/?utm_content=algo', utms))
    expect(url.searchParams.has('utm_content')).toBe(false)
  })

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['file:///etc/passwd'],
  ])('rechaza %s', (destino) => {
    expect(() => construirDestino(destino, utms)).toThrow(DestinoInvalidoError)
  })

  it('rechaza un destino con credenciales, que sirve para disfrazar a dónde va', () => {
    expect(() => construirDestino('https://marca.com@malo.example/', utms)).toThrow(DestinoInvalidoError)
  })

  it('rechaza lo que no es una dirección', () => {
    expect(() => construirDestino('marca.com', utms)).toThrow(DestinoInvalidoError)
  })
})

describe('normalizarUtm', () => {
  it('unifica mayúsculas, espacios y acentos', () => {
    // Sin esto, "Instagram", "instagram" e "Instagram " aparecen como tres
    // fuentes distintas en el panel del cliente.
    expect(normalizarUtm('  Instagram ')).toBe('instagram')
    expect(normalizarUtm('Ronda Junio')).toBe('ronda-junio')
    expect(normalizarUtm('Campaña Ñandú')).toBe('campana-nandu')
  })

  it('no deja el valor terminando en guiones', () => {
    expect(normalizarUtm('!!hola!!')).toBe('hola')
  })
})

describe('generarSlug', () => {
  it('no usa caracteres que se confunden al dictarlo', () => {
    const slug = generarSlug(new Uint8Array(Array.from({ length: 64 }, (_, i) => i * 4)))
    expect(slug).not.toMatch(/[lo01]/)
  })
})

describe('pareceBot', () => {
  it('marca los rastreadores que abren cada link de cada posteo', () => {
    expect(pareceBot('facebookexternalhit/1.1')).toBe(true)
    expect(pareceBot('WhatsApp/2.0')).toBe(true)
    expect(pareceBot('curl/8.0')).toBe(true)
  })

  it('sin user agent se asume bot: una persona siempre manda uno', () => {
    expect(pareceBot(null)).toBe(true)
  })

  it('un navegador de verdad no es bot', () => {
    expect(pareceBot('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Safari/604.1')).toBe(false)
  })
})

describe('hostDe', () => {
  it('guarda sólo el host, nunca la URL entera', () => {
    // La URL completa del referente puede llevar datos de la persona.
    expect(hostDe('https://www.instagram.com/p/abc?igsh=secreto')).toBe('www.instagram.com')
  })

  it('tolera un referente roto', () => {
    expect(hostDe('no-es-una-url')).toBeNull()
    expect(hostDe(null)).toBeNull()
  })
})
