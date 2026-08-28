/**
 * El idioma de HypeAuditor.
 *
 * Este archivo no habla por red. Traduce en los dos sentidos:
 *
 *   nuestros filtros  →  el cuerpo del pedido
 *   su respuesta      →  nuestros registros
 *
 * Está separado del adaptador a propósito. Traducir es donde se cometen los
 * errores caros --un nombre de campo mal escrito devuelve una lista vacía sin
 * avisar-- y separado se puede probar entero contra el contrato documentado,
 * sin credenciales y sin gastar una sola consulta.
 *
 * Contrato: https://hypeauditor.readme.io/reference/example_instagram.md
 */

import type { Platform } from '@/generated/prisma/enums'
import type { FiltrosDeAudiencia, FiltrosDeScouting } from '@/lib/domain/filtros-scouting'

/** Las redes que HypeAuditor sabe buscar, con el nombre que usa él. */
const REDES: Partial<Record<Platform, string>> = {
  INSTAGRAM: 'instagram',
  TIKTOK: 'tiktok',
  YOUTUBE: 'youtube',
  TWITCH: 'twitch',
  X: 'twitter',
}

export function redDe(platform: Platform): string | null {
  return REDES[platform] ?? null
}

/** Cuántos resultados entrega una página. Es fijo y define lo que se cobra. */
export const POR_PAGINA = 20

/**
 * Cuántas páginas hacen falta para `pedidos` registros.
 *
 * Importa más de lo que parece: HypeAuditor cobra por PÁGINA, no por registro.
 * Pedir 21 cuesta lo mismo que pedir 40. Quien muestre el costo tiene que
 * contar páginas, no perfiles, o va a prometer un número que no es.
 */
export function paginasPara(pedidos: number): number {
  return Math.max(1, Math.ceil(pedidos / POR_PAGINA))
}

export type ConsultaDeDescubrimiento = {
  platform: Platform
  palabras: string[]
  filtros: FiltrosDeScouting
  audiencia: FiltrosDeAudiencia
  pagina: number
}

/**
 * Arma el cuerpo del pedido.
 *
 * Sólo se manda lo que la persona pidió. Un filtro vacío no viaja: mandar
 * `{"from": 0}` no es lo mismo que no filtrar, y en una API que cobra por
 * página la diferencia se paga.
 */
export type { FiltrosDeAudiencia }

export function cuerpoDeBusqueda(consulta: ConsultaDeDescubrimiento): Record<string, unknown> {
  const red = redDe(consulta.platform)
  if (!red) throw new Error(`HypeAuditor no busca en ${consulta.platform}.`)

  const cuerpo: Record<string, unknown> = { social_network: red, page: consulta.pagina }

  const palabras = consulta.palabras.map((p) => p.trim()).filter((p) => p.length > 0)
  if (palabras.length > 0) cuerpo.search = palabras

  const { filtros, audiencia } = consulta

  // ── Quién publica ──────────────────────────────────────────────────────────
  const seguidores: Record<string, number> = {}
  if (filtros.seguidoresDesde != null) seguidores.from = filtros.seguidoresDesde
  if (filtros.seguidoresHasta != null) seguidores.to = filtros.seguidoresHasta
  if (Object.keys(seguidores).length > 0) cuerpo.subscribers_count = seguidores

  if (filtros.engagementMinimo != null) cuerpo.er = { from: filtros.engagementMinimo }
  if (filtros.pais) cuerpo.account_geo = { country: [filtros.pais.toUpperCase()] }

  // ── Quién lo mira ──────────────────────────────────────────────────────────
  if (audiencia.paisDelPublico) {
    cuerpo.audience_geo = {
      countries: [
        {
          id: audiencia.paisDelPublico.pais.toUpperCase(),
          prc: audiencia.paisDelPublico.porcentajeMinimo,
        },
      ],
    }
  }
  if (audiencia.generoDelPublico) {
    cuerpo.audience_gender = {
      gender: audiencia.generoDelPublico.genero,
      prc: audiencia.generoDelPublico.porcentajeMinimo,
    }
  }
  if (audiencia.edadDelPublico && audiencia.edadDelPublico.tramos.length > 0) {
    cuerpo.audience_age = {
      groups: audiencia.edadDelPublico.tramos,
      prc: audiencia.edadDelPublico.porcentajeMinimo,
    }
  }
  if (audiencia.calidadMinima != null) cuerpo.aqs = { from: audiencia.calidadMinima }

  return cuerpo
}

// ── Leer la respuesta ────────────────────────────────────────────────────────

/**
 * Un creador, tal como viene.
 *
 * Todo es opcional porque todo puede faltar. Los tipos dicen la verdad sobre lo
 * que el proveedor garantiza, que es bastante menos de lo que promete.
 */
type CreadorCrudo = {
  basic?: {
    username?: unknown
    title?: unknown
    avatar_url?: unknown
  }
  metrics?: {
    er?: { value?: unknown }
    subscribers_count?: { value?: unknown }
  }
}

const texto = (valor: unknown): string | null => {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  return limpio.length > 0 ? limpio : null
}

const numero = (valor: unknown): number | null =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : null

/** La URL del perfil, que HypeAuditor no manda: se arma con el usuario. */
export function urlDePerfil(platform: Platform, username: string): string | null {
  switch (platform) {
    case 'INSTAGRAM':
      return `https://www.instagram.com/${username}`
    case 'TIKTOK':
      return `https://www.tiktok.com/@${username}`
    case 'YOUTUBE':
      return `https://www.youtube.com/@${username}`
    case 'TWITCH':
      return `https://www.twitch.tv/${username}`
    case 'X':
      return `https://x.com/${username}`
    default:
      return null
  }
}

export type PerfilLeido = {
  handle: string
  url: string
  displayName: string | null
  followers: number | null
  engagementRate: number | null
  profileImageUrl: string | null
  raw: unknown
}

/**
 * Lee un creador. Devuelve null si no se puede identificar.
 *
 * Sin nombre de usuario no hay perfil: no hay URL, no hay forma de volver a
 * encontrarlo ni de saber si ya lo teníamos. Guardar esa fila sería sumar un
 * resultado que no lleva a ninguna parte --el mismo error que nos hizo
 * descartar un actor de Apify que devolvía posteos sin autor--.
 */
export function leerCreador(platform: Platform, crudo: unknown): PerfilLeido | null {
  if (typeof crudo !== 'object' || crudo === null) return null
  const fila = crudo as CreadorCrudo

  const handle = texto(fila.basic?.username)
  if (!handle) return null

  const url = urlDePerfil(platform, handle)
  if (!url) return null

  return {
    handle,
    url,
    displayName: texto(fila.basic?.title),
    followers: numero(fila.metrics?.subscribers_count?.value),
    engagementRate: numero(fila.metrics?.er?.value),
    profileImageUrl: texto(fila.basic?.avatar_url),
    raw: crudo,
  }
}

/**
 * El sobre de la respuesta: `{result: …}` cuando salió, `{error: …}` cuando no.
 *
 * Se separa porque HypeAuditor puede devolver HTTP 200 con un error adentro, y
 * leer sólo el código de estado haría pasar un fallo por una lista vacía.
 */
export type SobreLeido =
  | { ok: true; creadores: unknown[]; consultasRestantes: number | null }
  | { ok: false; mensaje: string }

export function leerSobre(cuerpo: unknown): SobreLeido {
  if (typeof cuerpo !== 'object' || cuerpo === null) {
    return { ok: false, mensaje: 'HypeAuditor devolvió una respuesta que no se entiende.' }
  }
  const sobre = cuerpo as { result?: unknown; error?: { description?: unknown; code?: unknown } }

  if (sobre.error) {
    const descripcion = texto(sobre.error.description)
    return { ok: false, mensaje: descripcion ?? 'HypeAuditor rechazó la consulta y no dijo por qué.' }
  }
  if (typeof sobre.result !== 'object' || sobre.result === null) {
    return { ok: false, mensaje: 'HypeAuditor no devolvió resultados.' }
  }

  const resultado = sobre.result as Record<string, unknown>
  /*
   * La lista viene bajo distintos nombres según el endpoint. Se prueban los
   * documentados y, si ninguno está, se toma el primer arreglo del objeto: es
   * preferible leer de más a fallar porque cambiaron una clave.
   */
  const candidatas = ['creators', 'accounts', 'items', 'data']
  let creadores: unknown[] | null = null
  for (const clave of candidatas) {
    if (Array.isArray(resultado[clave])) {
      creadores = resultado[clave] as unknown[]
      break
    }
  }
  if (!creadores) {
    const primerArreglo = Object.values(resultado).find((v): v is unknown[] => Array.isArray(v))
    creadores = primerArreglo ?? []
  }

  return { ok: true, creadores, consultasRestantes: numero(resultado.restTokens) }
}
