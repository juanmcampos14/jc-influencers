/**
 * Links medidos: la única fuente de clics que es realmente nuestra.
 *
 * Un influencer publica un link. Si ese link va directo al sitio del cliente,
 * lo único que sabemos de la campaña es lo que nos cuenten. Si pasa primero por
 * nosotros, el clic es un hecho medido y no una estimación -- y eso es lo que
 * separa un reporte de una presentación.
 *
 * Lo que NO hace: no identifica personas. Se guarda un hash del visitante con
 * una sal que cambia todos los días, y con eso alcanza para no contar diez
 * veces al mismo en una tarde. Al día siguiente el mismo visitante es otro
 * hash, así que no se puede seguir a nadie en el tiempo. La IP nunca se
 * escribe.
 */

const ALFABETO = 'abcdefghijkmnpqrstuvwxyz23456789'

/**
 * Slug corto para la URL pública.
 *
 * Sin `l`, `o`, `0` ni `1`: estos links se dictan por teléfono y se copian de
 * una captura de pantalla.
 */
export function generarSlug(bytes: Uint8Array): string {
  let salida = ''
  for (const byte of bytes) salida += ALFABETO[byte % ALFABETO.length]
  return salida
}

export class DestinoInvalidoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DestinoInvalidoError'
  }
}

/** Sólo `http` y `https`. Nada de `javascript:` ni de `data:`. */
const ESQUEMAS = new Set(['http:', 'https:'])

export type Utms = {
  source: string
  medium: string
  campaign: string
  content?: string | null
  term?: string | null
}

/**
 * Arma la URL final con los UTMs pegados.
 *
 * Los parámetros que el cliente ya tenía en su link se respetan; los `utm_*`
 * los pisamos nosotros, porque si no una plantilla vieja pegada a mano manda
 * los clics de esta campaña a la medición de otra.
 */
export function construirDestino(destinoCrudo: string, utms: Utms): string {
  let url: URL
  try {
    url = new URL(destinoCrudo.trim())
  } catch {
    throw new DestinoInvalidoError('Escribí la dirección completa, empezando por https://')
  }

  if (!ESQUEMAS.has(url.protocol)) {
    throw new DestinoInvalidoError('El destino tiene que ser una dirección http o https.')
  }
  // Un destino con credenciales adentro se usa para disfrazar a dónde va.
  if (url.username || url.password) {
    throw new DestinoInvalidoError('El destino no puede llevar usuario ni contraseña.')
  }

  url.searchParams.set('utm_source', utms.source)
  url.searchParams.set('utm_medium', utms.medium)
  url.searchParams.set('utm_campaign', utms.campaign)
  if (utms.content) url.searchParams.set('utm_content', utms.content)
  else url.searchParams.delete('utm_content')
  if (utms.term) url.searchParams.set('utm_term', utms.term)
  else url.searchParams.delete('utm_term')

  return url.toString()
}

/**
 * Normaliza un valor de UTM.
 *
 * Minúsculas y sin espacios: `Instagram`, `instagram` e `Instagram ` son la
 * misma fuente, y en el panel de analítica del cliente aparecerían como tres.
 */
export function normalizarUtm(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * ¿Parece un bot?
 *
 * No es una detección seria y no pretende serlo: es para no contar como
 * "personas que entraron" a los rastreadores que abren cada link de cada
 * posteo. Los clics marcados como bot se guardan igual, aparte, para que el
 * número que se muestra pueda explicarse.
 */
const BOTS = /(bot|crawler|spider|crawling|preview|facebookexternalhit|whatsapp|telegram|slackbot|discordbot|curl|wget|python-requests|headless)/i

export function pareceBot(userAgent: string | null): boolean {
  if (!userAgent) return true
  return BOTS.test(userAgent)
}

/** Sólo el host del referente. La URL completa puede llevar datos de la persona. */
export function hostDe(referer: string | null): string | null {
  if (!referer) return null
  try {
    return new URL(referer).hostname.slice(0, 120)
  } catch {
    return null
  }
}
