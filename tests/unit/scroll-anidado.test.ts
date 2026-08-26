import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Una tabla no puede tener su propia barra de scroll vertical.
 *
 * `TableWrap` desplaza en horizontal, y `overflow-x: auto` obliga al eje
 * vertical a valer `auto` también. Ponerle una altura máxima crea un segundo
 * scroll adentro del de la página: la tabla se recorta pero el documento sigue
 * midiendo la tabla entera.
 *
 * Se vio en producción: cuerpo de 1392px, documento de 3590. Casi 2200px en
 * blanco después del final del contenido, con la barra lateral despegada.
 */
const SRC = join(process.cwd(), 'src')

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) return archivos(ruta)
    return /\.tsx$/.test(nombre) ? [ruta] : []
  })
}

describe('ninguna tabla abre un scroll vertical propio', () => {
  it('no hay TableWrap con altura máxima', () => {
    const culpables = archivos(SRC).filter((ruta) => {
      const codigo = readFileSync(ruta, 'utf8')
      return /<TableWrap[^>]*\b(max-h-|h-\[|h-screen)/.test(codigo)
    })
    expect(culpables.map((ruta) => relative(process.cwd(), ruta))).toEqual([])
  })

  it('TableWrap no declara una altura por su cuenta', () => {
    const codigo = readFileSync(join(SRC, 'components/ui/table.tsx'), 'utf8')
    const linea = codigo.split('\n').find((l) => l.includes('overflow-x-auto')) ?? ''
    expect(linea).not.toMatch(/max-h-|h-\[|h-screen/)
  })
})
