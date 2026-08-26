import { describe, expect, it } from 'vitest'
import { MuralInvalidoError, muralDataUri, sanitizeMuralSvg } from '@/lib/domain/mural'

const BASE = '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">'

describe('sanitizeMuralSvg', () => {
  it('conserva un dibujo legítimo', () => {
    const svg = sanitizeMuralSvg(
      `${BASE}<defs><linearGradient id="g"><stop offset="0" stop-color="#289fb8"/></linearGradient></defs>` +
        `<path d="M10 10 L50 50" fill="url(#g)" stroke-width="2"/><circle cx="60" cy="60" r="20"/></svg>`,
    )
    expect(svg).toContain('<path')
    expect(svg).toContain('<circle')
    expect(svg).toContain('linearGradient')
    expect(svg).toContain('fill="url(#g)"')
  })

  it('saca el script aunque el resto sirva', () => {
    const svg = sanitizeMuralSvg(`${BASE}<script>alert(1)</script><circle cx="1" cy="1" r="1"/></svg>`)
    expect(svg).not.toContain('script')
    expect(svg).toContain('<circle')
  })

  it('saca foreignObject, que es HTML disfrazado de dibujo', () => {
    const svg = sanitizeMuralSvg(
      `${BASE}<foreignObject><body xmlns="http://www.w3.org/1999/xhtml">hola</body></foreignObject><rect x="0" y="0" width="4" height="4"/></svg>`,
    )
    expect(svg).not.toContain('foreignObject')
    expect(svg).not.toContain('body')
  })

  it.each([
    ['onload', `${BASE}<circle cx="1" cy="1" r="1" onload="alert(1)"/></svg>`],
    ['onclick', `${BASE}<rect x="0" y="0" width="4" height="4" onclick="alert(1)"/></svg>`],
  ])('saca el manejador %s', (_nombre, entrada) => {
    const svg = sanitizeMuralSvg(entrada)
    expect(svg).not.toMatch(/on[a-z]+=/i)
  })

  it('no deja pasar href, ni siquiera a javascript:', () => {
    const svg = sanitizeMuralSvg(
      `${BASE}<a href="javascript:alert(1)"><circle cx="1" cy="1" r="1"/></a></svg>`,
    )
    expect(svg).not.toContain('href')
    expect(svg).not.toContain('javascript')
    expect(svg).toContain('<circle')
  })

  it('no deja referencias a nada de afuera', () => {
    const svg = sanitizeMuralSvg(
      `${BASE}<rect x="0" y="0" width="4" height="4" fill="url(https://malo.example/x)"/><circle cx="1" cy="1" r="1"/></svg>`,
    )
    expect(svg).not.toContain('malo.example')
  })

  it('no deja imágenes embebidas', () => {
    const svg = sanitizeMuralSvg(
      `${BASE}<image href="data:image/png;base64,AAA"/><circle cx="1" cy="1" r="1"/></svg>`,
    )
    expect(svg).not.toContain('image')
    expect(svg).not.toContain('base64')
  })

  it('rechaza comentarios y CDATA, que sirven para esconder cosas', () => {
    expect(() => sanitizeMuralSvg(`${BASE}<!-- <script>alert(1)</script> --><circle cx="1" cy="1" r="1"/></svg>`))
      .toThrow(MuralInvalidoError)
    expect(() => sanitizeMuralSvg(`${BASE}<style><![CDATA[x]]></style><circle cx="1" cy="1" r="1"/></svg>`))
      .toThrow(MuralInvalidoError)
  })

  it('rechaza lo que no es un SVG', () => {
    expect(() => sanitizeMuralSvg('No pude dibujarlo.')).toThrow(MuralInvalidoError)
  })

  it('rechaza un SVG que se quedó sin nada dibujable', () => {
    expect(() => sanitizeMuralSvg(`${BASE}<script>alert(1)</script></svg>`)).toThrow(MuralInvalidoError)
  })

  it('rechaza un mural desmedido antes de mirarlo', () => {
    expect(() => sanitizeMuralSvg(`${BASE}${'<circle cx="1" cy="1" r="1"/>'.repeat(6000)}</svg>`)).toThrow(
      MuralInvalidoError,
    )
  })

  it('le pone viewBox si el modelo se olvidó', () => {
    const svg = sanitizeMuralSvg('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="1"/></svg>')
    expect(svg).toContain('viewBox=')
  })

  it('descarta el texto suelto: un mural dibuja, no escribe', () => {
    const svg = sanitizeMuralSvg(`${BASE}<text x="0" y="0">Hola</text><circle cx="1" cy="1" r="1"/></svg>`)
    expect(svg).not.toContain('Hola')
  })
})

describe('muralDataUri', () => {
  it('produce algo que un <img> puede mostrar', () => {
    const uri = muralDataUri(`${BASE}<circle cx="1" cy="1" r="1"/></svg>`)
    expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true)
    expect(Buffer.from(uri.split(',')[1] ?? '', 'base64').toString('utf8')).toContain('<circle')
  })
})
