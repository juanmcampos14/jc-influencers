/**
 * El idioma de influencers.club.
 *
 * No habla por red: traduce en los dos sentidos --nuestros filtros al cuerpo
 * del pedido, su respuesta a nuestros registros-- para poder probar la
 * traducción entera sin credenciales y sin gastar un crédito.
 *
 * Contrato: https://docs.influencers.club/openapi/discovery-api/public_v1_discovery_create.md
 */

import type { Platform } from '@/generated/prisma/enums'
import type { FiltrosDeAudiencia, FiltrosDeScouting } from '@/lib/domain/filtros-scouting'

/** Las redes que sabe buscar, con el nombre que usa él. */
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

/**
 * Cuántos creadores pide una página.
 *
 * Importa porque el cobro es **por creador devuelto**, no por consulta: pedir
 * de más se paga aunque no se mire. Es lo contrario de HypeAuditor, que cobra
 * la página entera aunque devuelva uno.
 */
export const MAXIMO_POR_PAGINA = 100

/**
 * Los tramos de edad que acepta. Un tramo que no esté en esta lista se
 * descarta en vez de viajar: un valor inventado hace fallar el pedido entero,
 * y perder los filtros buenos por uno malo es peor que ignorar el malo.
 */
const TRAMOS_DE_EDAD = new Set(['13-17', '18-24', '25-34', '35-44', '45-64', '65-', '65+'])

/**
 * Su escala de credibilidad de audiencia. Nosotros pedimos un número de 0 a
 * 100 --que es como lo entiende cualquiera-- y acá se traduce al escalón que
 * le corresponde, siempre para abajo: pedir "70" tiene que traer también al
 * que está en "good", no dejarlo afuera por no llegar a "high".
 */
function escalonDeCredibilidad(minimo: number): string {
  if (minimo >= 90) return 'best'
  if (minimo >= 75) return 'high'
  if (minimo >= 60) return 'good'
  if (minimo >= 40) return 'normal'
  if (minimo >= 20) return 'low'
  return 'bad'
}

export type ConsultaDeDescubrimiento = {
  platform: Platform
  palabras: string[]
  filtros: FiltrosDeScouting
  audiencia: FiltrosDeAudiencia
  /** Página, contada desde 1 como en el resto del producto. */
  pagina: number
  limite: number
}

/**
 * Arma el cuerpo del pedido.
 *
 * Sólo viaja lo que la persona pidió: un filtro vacío no es lo mismo que no
 * filtrar, y en una API que cobra por resultado la diferencia se paga.
 */
export function cuerpoDeBusqueda(consulta: ConsultaDeDescubrimiento): Record<string, unknown> {
  const red = redDe(consulta.platform)
  if (!red) throw new Error(`influencers.club no busca en ${consulta.platform}.`)

  const filtros: Record<string, unknown> = {}
  const { filtros: f, audiencia: a } = consulta

  // ── Quién publica ──────────────────────────────────────────────────────────
  const seguidores: Record<string, number> = {}
  if (f.seguidoresDesde != null) seguidores.min = f.seguidoresDesde
  if (f.seguidoresHasta != null) seguidores.max = f.seguidoresHasta
  if (Object.keys(seguidores).length > 0) filtros.number_of_followers = seguidores

  if (f.engagementMinimo != null) filtros.engagement_percent = { min: f.engagementMinimo }
  if (f.pais) filtros.location = [f.pais]

  /*
   * La zona y la mención se buscan en la bio, igual que cuando las evalúa
   * `filtros-scouting.ts` sobre lo que devuelve un scraper. Acá el proveedor lo
   * hace en el origen, así que además de marcarse se filtra.
   */
  const enLaBio = [f.zona, f.bioMenciona].filter((v): v is string => Boolean(v && v.trim()))
  if (enLaBio.length > 0) filtros.keywords_in_bio = enLaBio

  const palabras = consulta.palabras.map((p) => p.trim().replace(/^#/, '')).filter((p) => p.length > 0)
  if (palabras.length > 0) filtros.hashtags = palabras

  // ── Quién lo mira ──────────────────────────────────────────────────────────
  const audiencia: Record<string, unknown> = {}

  if (a.paisDelPublico) {
    audiencia.location = [
      {
        name: a.paisDelPublico.pais.toUpperCase(),
        type: 'country',
        min_pct: a.paisDelPublico.porcentajeMinimo,
      },
    ]
  }
  if (a.generoDelPublico) {
    audiencia.gender = { type: a.generoDelPublico.genero, min_pct: a.generoDelPublico.porcentajeMinimo }
  }
  if (a.edadDelPublico) {
    const tramos = a.edadDelPublico.tramos.filter((t) => TRAMOS_DE_EDAD.has(t))
    if (tramos.length > 0) {
      audiencia.age = tramos.map((range) => ({ range, min_pct: a.edadDelPublico!.porcentajeMinimo }))
    }
  }
  if (a.interesesDelPublico && a.interesesDelPublico.intereses.length > 0) {
    audiencia.interests = a.interesesDelPublico.intereses.map((name) => ({
      name,
      min_pct: a.interesesDelPublico!.porcentajeMinimo,
    }))
  }
  if (a.calidadMinima != null) audiencia.credibility = escalonDeCredibilidad(a.calidadMinima)

  if (Object.keys(audiencia).length > 0) filtros.audience = audiencia

  return {
    platform: red,
    filters: filtros,
    paging: {
      limit: Math.max(1, Math.min(MAXIMO_POR_PAGINA, consulta.limite)),
      /*
       * Su paginado arranca en 0, el nuestro en 1. Es el tipo de diferencia que
       * no rompe nada y hace que la primera página se pague dos veces.
       */
      page: Math.max(0, consulta.pagina - 1),
    },
  }
}

// ── Leer la respuesta ────────────────────────────────────────────────────────

type CreadorCrudo = {
  user_id?: unknown
  profile?: {
    full_name?: unknown
    username?: unknown
    picture?: unknown
    followers?: unknown
    engagement_percent?: unknown
  }
}

const texto = (valor: unknown): string | null => {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  return limpio.length > 0 ? limpio : null
}

const numero = (valor: unknown): number | null =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : null

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
 * encontrarlo ni de saber si ya lo teníamos.
 */
export function leerCreador(platform: Platform, crudo: unknown): PerfilLeido | null {
  if (typeof crudo !== 'object' || crudo === null) return null
  const fila = crudo as CreadorCrudo

  const handle = texto(fila.profile?.username)
  if (!handle) return null

  const url = urlDePerfil(platform, handle)
  if (!url) return null

  return {
    handle,
    url,
    displayName: texto(fila.profile?.full_name),
    followers: numero(fila.profile?.followers),
    engagementRate: numero(fila.profile?.engagement_percent),
    /*
     * Esta URL caduca a las 24 horas: es del proveedor, no nuestra. Sirve para
     * la lista de resultados de ahora; guardada queda una foto rota en unos
     * días. La ficha muestra iniciales cuando no carga, así que se degrada sin
     * mentir, pero conviene saberlo antes de apoyarse en ella.
     */
    profileImageUrl: texto(fila.profile?.picture),
    raw: crudo,
  }
}

export type SobreLeido =
  | { ok: true; creadores: unknown[]; total: number | null; creditosRestantes: number | null }
  | { ok: false; mensaje: string }

/**
 * Lee el sobre de la respuesta.
 *
 * `credits_left` viene como texto en su contrato, así que se convierte con
 * cuidado: mostrar "NaN créditos" es peor que no mostrar nada.
 */
export function leerSobre(cuerpo: unknown): SobreLeido {
  if (typeof cuerpo !== 'object' || cuerpo === null) {
    return { ok: false, mensaje: 'influencers.club devolvió una respuesta que no se entiende.' }
  }
  const sobre = cuerpo as { accounts?: unknown; total?: unknown; credits_left?: unknown; error?: unknown }

  if (typeof sobre.error === 'string' && sobre.error.trim().length > 0) {
    return { ok: false, mensaje: sobre.error.trim() }
  }
  if (!Array.isArray(sobre.accounts)) {
    return { ok: false, mensaje: 'influencers.club no devolvió resultados.' }
  }

  const creditos = Number(sobre.credits_left)

  return {
    ok: true,
    creadores: sobre.accounts,
    total: numero(sobre.total),
    creditosRestantes: Number.isFinite(creditos) ? creditos : null,
  }
}
