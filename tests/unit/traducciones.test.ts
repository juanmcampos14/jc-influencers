import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Las traducciones, como contrato.
 *
 * El producto habla dos idiomas y la mayor parte de la interfaz no se prueba
 * con un test de pantalla. Lo que sí se puede probar es que los dos archivos
 * digan lo mismo: que no falte una clave y que no falte un valor dentro de una
 * frase. Las dos cosas fallan en silencio --se ve el nombre de la clave, o una
 * frase a la que le falta el número-- y las dos pasaron de verdad mientras se
 * hacía esto.
 */

// `pathname` deja los espacios escapados; el nombre de la carpeta tiene uno.
const raiz = fileURLToPath(new URL('../../', import.meta.url))
const leer = (idioma: string): Record<string, Record<string, string>> =>
  JSON.parse(readFileSync(join(raiz, 'messages', `${idioma}.json`), 'utf8'))

const es = leer('es')
const en = leer('en')

/** Los `{nombre}` de una frase ICU, sin el formato ni las opciones de plural. */
function valoresDe(frase: string): Set<string> {
  const valores = new Set<string>()
  for (const [, nombre] of frase.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*[,}]/g)) valores.add(nombre!)
  return valores
}

describe('los dos idiomas dicen lo mismo', () => {
  it('tienen los mismos grupos', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort())
  })

  for (const grupo of Object.keys(es)) {
    it(`el grupo «${grupo}» tiene las mismas claves en los dos`, () => {
      const claves = (d: Record<string, Record<string, string>>) => Object.keys(d[grupo] ?? {}).sort()
      expect(claves(en), `desalineado en ${grupo}`).toEqual(claves(es))
    })
  }

  it('cada frase usa los mismos valores en los dos idiomas', () => {
    const problemas: string[] = []
    for (const [grupo, claves] of Object.entries(es)) {
      for (const [clave, castellano] of Object.entries(claves)) {
        const ingles = en[grupo]?.[clave]
        if (typeof castellano !== 'string' || typeof ingles !== 'string') continue
        const aqui = valoresDe(castellano)
        const alla = valoresDe(ingles)
        const faltan = [...aqui].filter((v) => !alla.has(v))
        const sobran = [...alla].filter((v) => !aqui.has(v))
        if (faltan.length > 0 || sobran.length > 0) {
          problemas.push(`${grupo}.${clave}: falta ${faltan.join(',') || '—'} / sobra ${sobran.join(',') || '—'}`)
        }
      }
    }
    expect(problemas, problemas.join('\n')).toEqual([])
  })
})

/** Todos los `.ts`/`.tsx` de `src`, sin el cliente generado de Prisma. */
function fuentes(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'generated' || nombre === 'node_modules') continue
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) fuentes(ruta, salida)
    else if (/\.tsx?$/.test(nombre)) salida.push(ruta)
  }
  return salida
}

describe('las claves de error que se lanzan existen', () => {
  /*
   * Un `throw new ValidationError({ clave: 'x' })` con una clave que no está en
   * las traducciones no rompe nada: muestra «x» en la pantalla. Esto lo caza.
   */
  it('cada clave lanzada tiene texto en los dos idiomas', () => {
    const patron =
      /new (?:ValidationError|ForbiddenError|NotFoundError|ConflictError|RateLimitError|UnauthenticatedError)\(\s*(?:\d+,\s*)?\{\s*clave:\s*'([a-zA-Z0-9_]+)'/g
    const faltantes: string[] = []
    for (const ruta of fuentes(join(raiz, 'src'))) {
      const codigo = readFileSync(ruta, 'utf8')
      for (const [, clave] of codigo.matchAll(patron)) {
        for (const [idioma, mensajes] of [
          ['es', es],
          ['en', en],
        ] as const) {
          if (!(clave! in (mensajes.errores ?? {}))) faltantes.push(`${clave} (${idioma})`)
        }
      }
    }
    expect([...new Set(faltantes)], `sin texto: ${faltantes.join(', ')}`).toEqual([])
  })
})
