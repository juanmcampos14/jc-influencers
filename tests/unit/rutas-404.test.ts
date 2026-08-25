import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Un `loading.tsx` cubre su segmento y TODO lo que cuelga debajo. Si abajo hay
 * una ruta que puede llamar a `notFound()`, la respuesta ya salió con estado
 * 200 antes de saberlo, y el 404 llega como contenido.
 *
 * Eso rompe el aislamiento entre clientes: pedir un recurso de otro espacio
 * tiene que responder 404, no 200 con un cartel adentro. Un atacante lee el
 * código de estado, no el cartel.
 *
 * La forma de tener las dos cosas -- esqueleto de carga en la lista y 404 real
 * en el detalle -- es poner la lista en un grupo de ruta `(lista)`, que no
 * cambia la URL y sí acota el alcance del `loading.tsx`.
 */

const APP = join(process.cwd(), 'src/app')

function carpetas(dir: string): string[] {
  return readdirSync(dir)
    .map((nombre) => join(dir, nombre))
    .filter((ruta) => statSync(ruta).isDirectory())
}

/** Todos los directorios de `src/app`, en profundidad. */
function todosLosSegmentos(dir: string): string[] {
  return carpetas(dir).flatMap((sub) => [sub, ...todosLosSegmentos(sub)])
}

const esDinamico = (ruta: string): boolean => /\[[^\]]+\]$/.test(ruta)

describe('esqueletos de carga y códigos de estado', () => {
  it('ningún loading.tsx cubre una ruta dinámica', () => {
    const segmentos = todosLosSegmentos(APP)
    const conLoading = segmentos.filter((ruta) => readdirSync(ruta).includes('loading.tsx'))

    const problemas = conLoading.flatMap((base) =>
      todosLosSegmentos(base)
        .filter(esDinamico)
        .map((dinamico) => `${relative(APP, base)}/loading.tsx cubre ${relative(APP, dinamico)}`),
    )

    expect(problemas, problemas.join('\n')).toEqual([])
  })
})
