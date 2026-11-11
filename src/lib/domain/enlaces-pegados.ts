import type { Platform } from '@/generated/prisma/enums'
import { parseProfileUrl } from './normalize'

/**
 * Varios enlaces pegados de una vez.
 *
 * Nadie arma una lista de influencers de a uno: se copian seis links de un
 * chat, de un mail o de una columna de Excel y se pegan juntos. Obligar a
 * pegarlos uno por uno es trabajo manual que la computadora puede hacer.
 *
 * El trabajo fino está en decidir qué es un enlace y qué no. `parseProfileUrl`
 * le pone `https://` a lo que no lo trae, así que una palabra suelta --un
 * nombre, lo que alguien escribe para buscar-- también "parsea": `moyanoflor`
 * se vuelve `https://moyanoflor`. Tratar eso como un enlace convertiría cada
 * búsqueda por nombre en un intento de dar de alta a alguien. Por eso un token
 * tiene que PARECER un enlace antes de intentar leerlo.
 */

/** Empieza con protocolo, o es un host con punto y TLD. */
const PARECE_ENLACE = /^(https?:\/\/\S+|[\w-]+(\.[\w-]+)+\/\S*)$/i

/** Lo que separa un enlace del siguiente cuando se pegan juntos. */
const SEPARADORES = /[\s,;|]+/

export type EnlacePegado = {
  /** El texto tal como se pegó, para poder mostrarlo si algo falla. */
  texto: string
  platform: Platform
  url: string
  urlNormalized: string
  handle: string | null
}

export type PegadoLeido = {
  enlaces: EnlacePegado[]
  /** Tokens que parecían un enlace pero no se pudieron leer. Se muestran. */
  noReconocidos: string[]
}

/**
 * Lee lo que se pegó.
 *
 * Un enlace a un sitio cualquiera (`WEBSITE`) no sirve acá: de una web no sale
 * una persona. Se cuenta como no reconocido, que es la verdad, en vez de
 * aceptarlo y dar de alta a alguien llamado "midominio.com".
 */
export function leerEnlacesPegados(texto: string): PegadoLeido {
  const enlaces: EnlacePegado[] = []
  const noReconocidos: string[] = []
  const vistos = new Set<string>()

  for (const token of texto.split(SEPARADORES)) {
    const limpio = token.trim().replace(/[.,;)]+$/, '')
    if (!limpio || !PARECE_ENLACE.test(limpio)) continue

    const parsed = parseProfileUrl(limpio)
    if (parsed.kind !== 'value' || parsed.value.platform === 'WEBSITE') {
      noReconocidos.push(limpio)
      continue
    }
    // El mismo perfil pegado dos veces es una sola alta, no dos.
    if (vistos.has(parsed.value.urlNormalized)) continue
    vistos.add(parsed.value.urlNormalized)
    enlaces.push({ texto: limpio, ...parsed.value })
  }

  return { enlaces, noReconocidos }
}

/** ¿Lo que se escribió es una lista de enlaces, o algo para buscar? */
export function pareceListaDeEnlaces(texto: string): boolean {
  const leido = leerEnlacesPegados(texto)
  return leido.enlaces.length > 0 || leido.noReconocidos.length > 0
}

/**
 * Un nombre para mostrar, cuando sólo tenemos el enlace.
 *
 * El handle es lo mejor que hay: es lo que la persona eligió llamarse. Sin
 * handle --YouTube `/c/algo`, TikTok sin arroba-- se usa el último tramo de la
 * dirección. Nunca se inventa un nombre propio: quien lo dé de alta lo va a
 * ver y lo puede corregir en la ficha.
 */
export function nombreSugerido(enlace: EnlacePegado): string {
  if (enlace.handle) return enlace.handle
  const tramos = enlace.urlNormalized.split('?')[0]!.split('/').filter(Boolean)
  return tramos[tramos.length - 1] ?? enlace.urlNormalized
}
