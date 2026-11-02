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
import type { ClaveDeFiltro, FiltrosDeAudiencia, FiltrosDeScouting } from '@/lib/domain/filtros-scouting'

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
/**
 * Cómo llama a los países.
 *
 * No acepta códigos ISO: su filtro de ubicación toma el nombre tal cual está en
 * su diccionario --"Argentina", no "AR"--, y un valor que no reconoce hace
 * fallar el pedido entero con `invalid_filters`. Probado contra la API el
 * 27/08/2026.
 *
 * Son los mismos ocho que ofrece la pantalla. Sumar un país acá es sumarlo
 * también allá: si falta, el filtro se omite en vez de romper la búsqueda, con
 * lo que la persona recibiría resultados sin el país que pidió --por eso
 * `paisNoReconocido` lo devuelve, para poder avisarlo--.
 */
const PAISES: Record<string, string> = {
  AR: 'Argentina',
  MX: 'Mexico',
  ES: 'Spain',
  CL: 'Chile',
  CO: 'Colombia',
  UY: 'Uruguay',
  PE: 'Peru',
  US: 'United States',
}

/** El nombre que entiende, o null si no sabemos cómo lo llama. */
export function nombreDePais(codigo: string): string | null {
  const limpio = codigo.trim().toUpperCase()
  return PAISES[limpio] ?? null
}

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
  /*
   * Un país que no sabemos cómo llama se omite en vez de viajar: mandarlo hace
   * fallar el pedido entero, y perder toda la búsqueda por un filtro es peor
   * que hacerla sin ese filtro. Quien llama puede avisarlo con `nombreDePais`.
   */
  if (f.pais) {
    const nombre = nombreDePais(f.pais)
    if (nombre) filtros.location = [nombre]
  }

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
    const nombre = nombreDePais(a.paisDelPublico.pais)
    if (nombre) {
      audiencia.location = [{ name: nombre, type: 'country', min_pct: a.paisDelPublico.porcentajeMinimo }]
    }
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

/**
 * Qué filtros va a aplicar ÉL, no nosotros después.
 *
 * Se deduce del cuerpo que efectivamente se arma, no de lo que se pidió: un
 * país que no supimos traducir no viajó, así que tampoco está garantizado.
 * Deducirlo del pedido y no del cuerpo haría que un filtro omitido se
 * informara como cumplido.
 */
export function filtrosEnOrigen(consulta: ConsultaDeDescubrimiento): ClaveDeFiltro[] {
  const cuerpo = cuerpoDeBusqueda(consulta)
  const filtros = cuerpo.filters as Record<string, unknown>
  const claves: ClaveDeFiltro[] = []

  if (filtros.location) claves.push('pais')
  if (filtros.number_of_followers) claves.push('seguidores')
  if (filtros.engagement_percent) claves.push('engagement')
  /*
   * La zona y la mención viajan juntas en `keywords_in_bio`, así que se
   * garantizan juntas: él busca las dos dentro de la bio.
   */
  if (filtros.keywords_in_bio) {
    if (consulta.filtros.zona) claves.push('zona')
    if (consulta.filtros.bioMenciona) claves.push('bioMenciona')
  }
  return claves
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
function leerError(error: unknown): string | null {
  if (typeof error === 'string' && error.trim().length > 0) return error.trim()
  if (!Array.isArray(error) || error.length === 0) return null

  const partes = error
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (typeof item !== 'object' || item === null) return null
      const fila = item as { field?: unknown; error?: unknown }
      const campo = typeof fila.field === 'string' ? fila.field : null
      const detalle = typeof fila.error === 'string' ? fila.error : null
      if (!detalle) return campo
      return campo ? `${campo}: ${detalle}` : detalle
    })
    .filter((parte): parte is string => Boolean(parte && parte.length > 0))

  return partes.length > 0 ? partes.join(' · ') : 'influencers.club rechazó los filtros y no dijo cuál.'
}

export function leerSobre(cuerpo: unknown): SobreLeido {
  if (typeof cuerpo !== 'object' || cuerpo === null) {
    return { ok: false, mensaje: 'influencers.club devolvió una respuesta que no se entiende.' }
  }
  const sobre = cuerpo as {
    accounts?: unknown
    total?: unknown
    credits_left?: unknown
    error?: unknown
    /* Los rechazos de autenticación y de plan vienen por acá, no por `error`. */
    detail?: unknown
    message?: unknown
  }

  /*
   * Su error viene de dos formas y hay que leer las dos. El tope de
   * descubrimiento manda un texto suelto; un filtro inválido manda un ARREGLO
   * de errores por campo:
   *
   *   {"error":[{"field":"location","error":"Invalid location: 'AR'..."}]}
   *
   * La primera versión de esta función sólo entendía el texto, así que un
   * pedido rechazado por un filtro caía en "no devolvió resultados" y escondía
   * el motivo. El fallo mudo que estos mapeos tienen que evitar lo estaba
   * cometiendo el mapeo.
   */
  const mensajeDeError = leerError(sobre.error) ?? texto(sobre.detail) ?? texto(sobre.message)
  if (mensajeDeError) return { ok: false, mensaje: mensajeDeError }
  /*
   * Acá NO se puede decir "no encontró a nadie". Una búsqueda sin resultados
   * viene con `accounts: []`, que es un arreglo y pasa de largo. Si no hay
   * arreglo, lo que falló es la lectura, no la búsqueda: decir que no hay
   * resultados manda a cambiar los filtros cuando el problema está en otra
   * parte. Es el error que tapó un plan sin acceso a la API durante días.
   */
  if (!Array.isArray(sobre.accounts)) {
    return {
      ok: false,
      mensaje: 'influencers.club contestó sin la lista de perfiles. No es que no haya resultados: no se pudo leer su respuesta.',
    }
  }

  const creditos = Number(sobre.credits_left)

  return {
    ok: true,
    creadores: sobre.accounts,
    total: numero(sobre.total),
    creditosRestantes: Number.isFinite(creditos) ? creditos : null,
  }
}

/**
 * Qué significa un código de estado que no es 200.
 *
 * Existe porque faltaba. El adaptador leía el cuerpo de la respuesta sin mirar
 * nunca el estado, así que un rechazo --clave vencida, plan sin API, servidor
 * caído-- llegaba a `leerSobre` como un JSON sin `accounts` y salía convertido
 * en "no devolvió resultados". Eso le dice a una persona que su búsqueda no
 * encontró a nadie cuando en realidad nunca se hizo: se va a cambiar los
 * filtros, los cambia diez veces, y el motivo real sigue tapado.
 *
 * Devuelve null cuando la respuesta se puede leer, y el motivo en castellano
 * cuando no. Está acá, y no en el adaptador, para poder probarla sin
 * credenciales y sin gastar un crédito.
 */
export function motivoDelRechazo(status: number, cuerpo: unknown): string | null {
  if (status >= 200 && status < 300) return null

  const detalle = detalleDelRechazo(cuerpo)

  if (status === 401) {
    return 'La clave de influencers.club no es válida o fue revocada. Hay que generar una nueva en su panel y volver a cargarla.'
  }

  /*
   * El caso que importa: la clave ES correcta --una clave inventada contesta
   * 401-- pero el plan contratado no incluye la API. Ningún filtro lo arregla,
   * así que la pantalla tiene que decir exactamente eso.
   */
  if (status === 403) {
    if (/plan|upgrade|subscription/i.test(detalle ?? '')) {
      return 'El plan contratado en influencers.club no incluye acceso por API: hace falta Pro o Enterprise. La clave está bien; lo que falta es el plan.'
    }
    return detalle
      ? `influencers.club no autorizó el pedido: ${detalle}`
      : 'influencers.club no autorizó el pedido y no dijo por qué.'
  }

  if (status === 402) {
    return 'La suscripción a influencers.club está impaga o vencida. Se repone al regularizarla en su panel.'
  }

  /*
   * Dos cosas distintas contestan 429 y hay que saber cuál es: el límite de
   * 300 pedidos por minuto --se reintenta más tarde-- y el tope de
   * descubrimiento del plan --no se reintenta, hay que esperar la renovación--.
   * Decir "probá de nuevo" en el segundo caso manda a alguien a golpear una
   * puerta cerrada.
   */
  if (status === 429) {
    return /credit limit/i.test(detalle ?? '')
      ? 'Se agotó el cupo de descubrimiento del plan de influencers.club. Se repone cuando renueva la suscripción.'
      : 'influencers.club está recibiendo demasiados pedidos por minuto. Probá de nuevo en un rato.'
  }

  if (status >= 500) {
    return 'influencers.club no está respondiendo. No es la búsqueda: hay que probar de nuevo más tarde.'
  }

  /*
   * Un 400 con detalle casi siempre es un filtro que no le gustó, y el detalle
   * nombra el campo. Vale más que cualquier texto nuestro.
   */
  return detalle
    ? `influencers.club rechazó el pedido: ${detalle}`
    : `influencers.club rechazó el pedido (código ${status}) y no dijo por qué.`
}

/** El motivo que viene en el cuerpo, con los tres nombres que le pone. */
function detalleDelRechazo(cuerpo: unknown): string | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null
  const fila = cuerpo as { detail?: unknown; error?: unknown; message?: unknown }
  return texto(fila.detail) ?? leerError(fila.error) ?? texto(fila.message)
}
