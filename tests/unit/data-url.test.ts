import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy } from '@/lib/security/csp'
import { dataUrlToFile } from '@/lib/util/data-url'

/**
 * El estudio de marca convertía el logo propuesto a archivo con
 * `await (await fetch(dataUrl)).blob()`. En desarrollo andaba; en producción
 * el navegador rechazaba el pedido porque `connect-src` sólo permite `'self'`,
 * y el `TypeError` resultante --lanzado dentro de una transición de React--
 * tiraba la pantalla a "Algo salió mal".
 *
 * El síntoma era desconcertante: aplicar la paleta por defecto funcionaba y
 * aplicar la analizada no. La diferencia era justamente el logo.
 */

describe('dataUrlToFile', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='

  it('decodifica base64 conservando tipo y bytes', async () => {
    const file = dataUrlToFile(PNG, 'logo.png')
    expect(file.type).toBe('image/png')
    expect(file.name).toBe('logo.png')
    const bytes = new Uint8Array(await file.arrayBuffer())
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]) // firma PNG
  })

  it('cae a image/png cuando el data URI no declara tipo', () => {
    expect(dataUrlToFile('data:;base64,iVBORw0KGgo=', 'x.png').type).toBe('image/png')
  })

  it('soporta el cuerpo sin base64', async () => {
    const file = dataUrlToFile('data:image/svg+xml,%3Csvg%2F%3E', 'logo.svg')
    expect(file.type).toBe('image/svg+xml')
    expect(await file.text()).toBe('<svg/>')
  })

  it('rechaza lo que no es un data URI', () => {
    expect(() => dataUrlToFile('https://ejemplo.com/logo.png', 'logo.png')).toThrow()
  })
})

describe('la política de contenido no habilita data: en connect-src', () => {
  it('connect-src sigue siendo solo self', () => {
    // Si alguien "arregla" un fetch bloqueado abriendo connect-src, este test
    // avisa: la salida correcta es no usar la red para algo que ya está en
    // memoria.
    const directiva = contentSecurityPolicy('abc')
      .split('; ')
      .find((parte) => parte.startsWith('connect-src'))
    expect(directiva).toBe("connect-src 'self'")
  })
})

describe('ningún componente de cliente hace fetch de un data: o blob:', () => {
  const SRC = join(process.cwd(), 'src')

  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((nombre) => {
      const ruta = join(dir, nombre)
      if (statSync(ruta).isDirectory()) return archivos(ruta)
      return /\.tsx?$/.test(nombre) ? [ruta] : []
    })
  }

  it('no queda ninguno', () => {
    const culpables = archivos(SRC).filter((ruta) => {
      const codigo = readFileSync(ruta, 'utf8')
      if (!codigo.startsWith('"use client"') && !codigo.startsWith("'use client'")) return false
      return /fetch\(\s*[^)]*(dataUrl|DataUrl|dataURL|objectUrl|ObjectUrl|blobUrl|BlobUrl|['"`](data|blob):)/.test(
        codigo,
      )
    })

    expect(culpables.map((ruta) => relative(process.cwd(), ruta))).toEqual([])
  })
})
