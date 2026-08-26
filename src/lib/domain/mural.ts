/**
 * Saneado del mural de marca.
 *
 * El mural lo dibuja un modelo y termina en la pantalla de un cliente. Un SVG
 * es un documento, no una imagen: admite `<script>`, `<foreignObject>` con HTML
 * adentro, `href` a `javascript:` y atributos `on*`. Aceptarlo tal cual sería
 * dejar que la salida de un modelo ejecute código en la sesión de otra persona.
 *
 * Hay dos barreras, y ninguna alcanza sola:
 *
 *  1. Este saneador, con lista blanca: sólo pasan las etiquetas y los atributos
 *     que hacen falta para dibujar. Lo que no está declarado, no entra.
 *  2. En la pantalla el SVG se muestra dentro de un `<img>`, y un SVG ahí es
 *     inerte por definición del navegador: no ejecuta scripts ni carga nada
 *     externo, aunque algo se nos haya escapado en (1).
 */

const ETIQUETAS = new Set([
  'svg', 'g', 'defs', 'title', 'desc',
  'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'linearGradient', 'radialGradient', 'stop',
  'clipPath', 'mask', 'use', 'symbol',
])

const ATRIBUTOS = new Set([
  'viewBox', 'width', 'height', 'xmlns', 'fill', 'fill-opacity', 'fill-rule', 'clip-rule',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit',
  'opacity', 'transform', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'points', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform',
  'id', 'clip-path', 'mask', 'preserveAspectRatio',
])

/** `id` y las referencias que lo usan: sólo letras, números, guiones. */
const ID_VALIDO = /^[A-Za-z][\w-]{0,60}$/
/** `url(#algo)`, y nada más. Cierra la puerta a `url(http://…)`. */
const REFERENCIA_INTERNA = /^url\(#[A-Za-z][\w-]{0,60}\)$/

const MAX_BYTES = 120_000

export class MuralInvalidoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MuralInvalidoError'
  }
}

function atributoValido(nombre: string, valor: string): boolean {
  if (!ATRIBUTOS.has(nombre)) return false
  if (/^on/i.test(nombre)) return false
  // Ninguna referencia a algo de afuera: ni URLs, ni entidades, ni data:.
  if (/(javascript:|data:|&#|<|>)/i.test(valor)) return false
  if (nombre === 'id') return ID_VALIDO.test(valor)
  if (nombre === 'clip-path' || nombre === 'mask') return REFERENCIA_INTERNA.test(valor)
  if (valor.includes('url(')) return REFERENCIA_INTERNA.test(valor.trim())
  return true
}

/**
 * Devuelve el SVG saneado, o lanza si no queda nada dibujable.
 *
 * No "corrige" un SVG hostil para aprovecharlo: si trae algo que no pasa la
 * lista, ese pedazo se cae. Preferimos un mural más pobre que uno inspeccionado
 * a medias.
 */
export function sanitizeMuralSvg(entrada: string): string {
  const texto = entrada.trim()
  if (texto.length > MAX_BYTES) throw new MuralInvalidoError('El mural es demasiado pesado.')

  const inicio = texto.indexOf('<svg')
  const fin = texto.lastIndexOf('</svg>')
  if (inicio === -1 || fin === -1) throw new MuralInvalidoError('La respuesta no contiene un SVG.')
  const svg = texto.slice(inicio, fin + '</svg>'.length)

  if (/<!\[CDATA\[|<!--|<!DOCTYPE|<\?/i.test(svg)) {
    throw new MuralInvalidoError('El SVG trae secciones que no se pueden verificar.')
  }

  let salida = ''
  let cursor = 0
  let vistoSvgRaiz = false
  const etiquetaRe = /<\s*(\/?)([A-Za-z][\w:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>/g

  let match: RegExpExecArray | null
  while ((match = etiquetaRe.exec(svg)) !== null) {
    // El texto suelto entre etiquetas se descarta: un mural dibuja, no escribe.
    if (match.index > cursor) salida += ''
    cursor = etiquetaRe.lastIndex

    const cierra = match[1] === '/'
    const nombre = match[2] ?? ''
    const crudo = match[3] ?? ''
    const autocierra = crudo.trimEnd().endsWith('/')

    if (!ETIQUETAS.has(nombre)) {
      // Se descarta la etiqueta entera, incluida su apertura o su cierre.
      continue
    }
    if (nombre === 'title' || nombre === 'desc') continue

    if (cierra) {
      salida += `</${nombre}>`
      continue
    }

    const atributos: string[] = []
    const atributoRe = /([A-Za-z][\w:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g
    let attr: RegExpExecArray | null
    while ((attr = atributoRe.exec(crudo)) !== null) {
      const clave = attr[1] ?? ''
      const valor = attr[3] ?? attr[4] ?? ''
      if (!atributoValido(clave, valor)) continue
      atributos.push(`${clave}="${valor.replace(/"/g, '&quot;')}"`)
    }

    if (nombre === 'svg') {
      if (vistoSvgRaiz) continue
      vistoSvgRaiz = true
      const viewBox = atributos.find((a) => a.startsWith('viewBox='))
      // Sin viewBox no escala; se le pone uno cuadrado antes que descartarlo.
      const base = [viewBox ?? 'viewBox="0 0 512 512"', 'xmlns="http://www.w3.org/2000/svg"']
      salida += `<svg ${base.join(' ')}>`
      continue
    }

    salida += `<${nombre}${atributos.length > 0 ? ` ${atributos.join(' ')}` : ''}${autocierra ? '/' : ''}>`
  }

  if (!vistoSvgRaiz) throw new MuralInvalidoError('La respuesta no contiene un SVG.')
  if (!/<(path|circle|ellipse|rect|line|polyline|polygon|use)\b/.test(salida)) {
    throw new MuralInvalidoError('El mural quedó vacío después de revisarlo.')
  }
  if (!salida.endsWith('</svg>')) salida += '</svg>'
  return salida
}

/** El mural, listo para el `src` de un `<img>`. */
export function muralDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}
