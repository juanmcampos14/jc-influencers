/**
 * Por qué dos fichas parecen la misma persona.
 *
 * Existe este archivo por un error que casi se va a producción: la fusión en
 * lote se estaba guiando por el PUNTAJE, dando por seguro el 100. Pero el
 * puntaje no ordena la certeza, la mezcla:
 *
 *   95  misma URL normalizada   → es la misma cuenta. Certeza.
 *   90  mismo handle en la red  → es la misma cuenta. Certeza.
 *   86-100  nombre parecido     → puede ser un homónimo. Sospecha.
 *
 * Un "nombre muy parecido (100%)" es un empate exacto de nombre, que es la
 * evidencia MÁS DÉBIL de todas --dos personas distintas pueden llamarse
 * igual-- y sin embargo era la que más puntuaba.
 *
 * Así que lo que decide no es cuánto puntúa sino **de dónde salió la
 * coincidencia**: de una identidad o de un parecido. Sólo la identidad se
 * puede resolver sin mirar.
 */

export type ClaseDeParecido = 'IDENTIDAD' | 'SOSPECHA'

/**
 * Los motivos los escribe el detector y los lee la fusión en lote. Se arman
 * acá, en un solo lugar, para que no se puedan desincronizar: si alguien
 * cambia el texto, cambia para los dos.
 */
export const motivoPorUrl = (urlNormalized: string): string => `Misma URL normalizada (${urlNormalized})`
export const motivoPorHandle = (handle: string, platform: string): string =>
  `Mismo handle @${handle} en ${platform}`
export const motivoPorNombre = (nombre: string, porcentaje: number): string =>
  `Nombre muy parecido a "${nombre}" (${porcentaje}%)`

const PREFIJOS_DE_IDENTIDAD = ['Misma URL normalizada', 'Mismo handle @']

/**
 * ¿Ese par es la misma cuenta, o sólo dos fichas que se parecen?
 *
 * Ante la duda devuelve SOSPECHA. Un motivo que no reconocemos --porque alguien
 * agregó una regla nueva de detección-- tiene que caer del lado que obliga a
 * mirar, no del que fusiona solo.
 */
export function claseDeParecido(motivo: string): ClaseDeParecido {
  return PREFIJOS_DE_IDENTIDAD.some((prefijo) => motivo.startsWith(prefijo)) ? 'IDENTIDAD' : 'SOSPECHA'
}
