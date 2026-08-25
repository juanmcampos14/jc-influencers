import 'server-only'
import type { Platform } from '@/generated/prisma/enums'
import { parseProfileUrl } from '@/lib/domain/normalize'
import {
  ScoutingUnavailableError,
  type DiscoverParams,
  type EnrichParams,
  type JobHandle,
  type JobProgress,
  type ScoutingProvider,
  type ScoutingRecord,
} from './scouting'

/**
 * Proveedor alternativo: Apify.
 *
 * Existe porque Bright Data es bueno trayendo un perfil que ya conocés y flojo
 * buscando: descubrir en TikTok tardó seis minutos contra cincuenta segundos de
 * YouTube, y en Instagram directamente no busca perfiles por palabra clave.
 *
 * Dos cosas que Apify hace mejor para nuestro caso:
 *  - `maxTotalChargeUsd` es un techo de gasto que aplica el proveedor. Con
 *    Bright Data el tope lo calculamos nosotros; acá lo garantiza el otro lado.
 *  - Los actores de búsqueda devuelven perfiles, no posts de los que haya que
 *    deducir el autor.
 *
 * Los identificadores de actor son configurables a propósito: en Apify los
 * publica la comunidad y cambian. Si uno deja de servir, se cambia una variable
 * de entorno y no una línea de código.
 */

const BASE = 'https://api.apify.com/v2'

export type ApifyActors = {
  instagramProfiles?: string
  instagramDiscover?: string
  tiktokProfiles?: string
  tiktokDiscover?: string
  youtubeProfiles?: string
  youtubeDiscover?: string
}

/** Lee un número sin importar si vino como número o como texto. */
function numeroDe(row: Record<string, unknown>, claves: string[]): number | null {
  for (const clave of claves) {
    const valor = row[clave]
    if (typeof valor === 'number' && Number.isFinite(valor)) return Math.round(valor)
    if (typeof valor === 'string') {
      const limpio = Number(valor.replace(/[^\d.]/g, ''))
      if (Number.isFinite(limpio) && limpio > 0) return Math.round(limpio)
    }
  }
  return null
}

function textoDe(row: Record<string, unknown>, claves: string[]): string | null {
  for (const clave of claves) {
    const valor = row[clave]
    if (typeof valor === 'string' && valor.trim()) return valor.trim()
  }
  return null
}

/**
 * Busca una clave anidada, porque cada actor arma el perfil a su manera: unos
 * lo ponen plano y otros bajo `authorMeta` o `channel`.
 */
function anidado(row: Record<string, unknown>, contenedores: string[]): Record<string, unknown> {
  for (const clave of contenedores) {
    const valor = row[clave]
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) return valor as Record<string, unknown>
  }
  return {}
}

/**
 * Lleva un registro de Apify a nuestro modelo.
 *
 * Devuelve null cuando no se puede identificar el perfil. Preferimos perder un
 * registro antes que inventar uno.
 */
export function apifyToRecord(fila: Record<string, unknown>, plataforma: Platform): ScoutingRecord | null {
  const autor = anidado(fila, ['authorMeta', 'author', 'channel', 'owner', 'user'])
  const fuente = { ...autor, ...fila }

  /*
   * `name` cuenta como usuario SÓLO dentro del objeto del autor: ahí el actor
   * de TikTok pone el usuario y en `nickName` el nombre visible. En el nivel de
   * arriba, `name` suele ser un título y tomarlo como usuario armaría URLs de
   * perfil inexistentes.
   */
  const handle =
    textoDe(autor, ['uniqueId', 'userName', 'username', 'name', 'handle']) ??
    textoDe(fila, ['userName', 'username', 'uniqueId', 'handle', 'ownerUsername', 'channelName'])

  /*
   * Con el usuario alcanza para armar la URL del perfil, y es lo que hay que
   * hacer: los actores de búsqueda devuelven videos, cuya URL incluye el
   * usuario pero apunta al post. Guardar eso rompía la deduplicación -- el
   * mismo creador con tres videos eran tres perfiles distintos.
   *
   * La URL cruda queda de respaldo para los casos sin usuario, como un canal de
   * YouTube identificado sólo por su código.
   */
  const urlCruda = handle
    ? urlDeHandle(plataforma, handle)
    : textoDe(fuente, ['profileUrl', 'channelUrl', 'url', 'inputUrl'])
  if (!urlCruda) return null

  const perfil = parseProfileUrl(urlCruda)
  if (perfil.kind !== 'value') return null

  return {
    platform: perfil.value.platform,
    url: perfil.value.url,
    urlNormalized: perfil.value.urlNormalized,
    handle: perfil.value.handle ?? handle,
    /*
     * `nickName` va ANTES que `name`: en el actor de TikTok `name` es el
     * usuario y `nickName` el nombre visible. Al revés, el nombre para mostrar
     * terminaba siendo el handle repetido.
     */
    displayName: nombreVisible(fuente, handle),
    followers: numeroDe(fuente, [
      'followersCount',
      'followers',
      'fans',
      'subscribers',
      'numberOfSubscribers',
      'subscriberCount',
    ]),
    engagementRate: null,
    country: textoDe(fuente, ['country', 'countryCode', 'region', 'location']),
    bio: textoDe(fuente, ['biography', 'bio', 'signature', 'description', 'channelDescription']),
    profileImageUrl: textoDe(fuente, ['profilePicUrl', 'avatar', 'avatarUrl', 'profilePicUrlHD', 'channelAvatarUrl']),
    raw: fila,
  }
}


/**
 * Nombre para mostrar, sin repetir el usuario.
 *
 * Cuando lo único que hay es el mismo texto del handle, es preferible no poner
 * nada: la pantalla ya muestra el @usuario al lado.
 */
function nombreVisible(fuente: Record<string, unknown>, handle: string | null): string | null {
  const candidato = textoDe(fuente, ['nickName', 'nickname', 'fullName', 'displayName', 'title', 'name'])
  if (!candidato) return null
  if (handle && candidato.toLowerCase() === handle.replace(/^@/, '').toLowerCase()) return null
  return candidato
}

function urlDeHandle(plataforma: Platform, handle: string): string {
  const limpio = handle.replace(/^@/, '')
  if (plataforma === 'TIKTOK') return `https://www.tiktok.com/@${limpio}`
  if (plataforma === 'YOUTUBE') return `https://www.youtube.com/@${limpio}`
  return `https://www.instagram.com/${limpio}`
}

/**
 * Entrada de cada actor.
 *
 * Los nombres de campo los define quien publica el actor, no Apify, así que
 * están acá juntos y comentados en vez de repartidos por el código.
 */
export function apifyInput(
  plataforma: Platform,
  modo: 'DISCOVER' | 'ENRICH',
  params: { keywords?: string[]; urls?: string[]; limit: number },
): Record<string, unknown> {
  const tope = Math.max(1, Math.min(500, params.limit))

  if (modo === 'ENRICH') {
    const urls = params.urls ?? []
    if (plataforma === 'TIKTOK') {
      return { profiles: urls.map((u) => u.replace(/^.*@/, '')), resultsPerPage: 1, shouldDownloadVideos: false }
    }
    if (plataforma === 'YOUTUBE') return { startUrls: urls.map((url) => ({ url })), maxResults: tope }
    return { directUrls: urls, resultsType: 'details', resultsLimit: 1 }
  }

  const keywords = params.keywords ?? []
  if (plataforma === 'TIKTOK') {
    // Los hashtags van sin almohadilla en `hashtags`; lo demás como búsqueda.
    const hashtags = keywords.filter((k) => k.startsWith('#')).map((k) => k.slice(1))
    const busquedas = keywords.filter((k) => !k.startsWith('#'))
    return {
      ...(hashtags.length > 0 ? { hashtags } : {}),
      ...(busquedas.length > 0 ? { searchQueries: busquedas } : {}),
      resultsPerPage: Math.max(1, Math.ceil(tope / Math.max(1, keywords.length))),
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    }
  }
  if (plataforma === 'YOUTUBE') {
    return { searchQueries: keywords, maxResults: tope, maxResultsShorts: 0 }
  }
  return { search: keywords.join(' '), searchType: 'hashtag', resultsType: 'details', resultsLimit: tope }
}

export class ApifyScoutingProvider implements ScoutingProvider {
  readonly name = 'apify'
  readonly configured = true

  constructor(
    private readonly token: string,
    private readonly actors: ApifyActors,
    private readonly costPerRecord: number,
  ) {}

  unitCostUsd(): number {
    return this.costPerRecord
  }

  supports(platform: Platform, mode: 'DISCOVER' | 'ENRICH'): boolean {
    return this.actorFor(platform, mode) !== null
  }

  private actorFor(platform: Platform, mode: 'DISCOVER' | 'ENRICH'): string | null {
    const porRed: Partial<Record<Platform, { discover?: string; enrich?: string }>> = {
      INSTAGRAM: { discover: this.actors.instagramDiscover, enrich: this.actors.instagramProfiles },
      TIKTOK: { discover: this.actors.tiktokDiscover, enrich: this.actors.tiktokProfiles },
      YOUTUBE: { discover: this.actors.youtubeDiscover, enrich: this.actors.youtubeProfiles },
    }
    const entrada = porRed[platform]
    return (mode === 'DISCOVER' ? entrada?.discover : entrada?.enrich) ?? null
  }

  private async pedir(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      return await fetch(`${BASE}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      })
    } finally {
      clearTimeout(timer)
    }
  }

  private async lanzar(
    plataforma: Platform,
    modo: 'DISCOVER' | 'ENRICH',
    params: { keywords?: string[]; urls?: string[]; limit: number },
  ): Promise<JobHandle> {
    const actor = this.actorFor(plataforma, modo)
    if (!actor) {
      throw new ScoutingUnavailableError(
        `No hay actor de Apify configurado para ${modo === 'DISCOVER' ? 'descubrir' : 'actualizar'} en ${plataforma}.`,
      )
    }

    const tope = Math.max(1, Math.min(500, params.limit))
    // Techo de gasto del lado del proveedor: aunque el actor devuelva de más,
    // Apify corta. Un margen del 10% evita que corte por redondeo.
    const techoUsd = (this.costPerRecord * tope * 1.1).toFixed(4)

    const response = await this.pedir(
      `/actors/${encodeURIComponent(actor)}/runs?maxItems=${tope}&maxTotalChargeUsd=${techoUsd}`,
      { method: 'POST', body: JSON.stringify(apifyInput(plataforma, modo, params)) },
    )
    if (!response.ok) {
      const detalle = (await response.text().catch(() => '')).slice(0, 300)
      throw new ScoutingUnavailableError(explicarRechazoApify(response.status, detalle))
    }

    const cuerpo = (await response.json()) as { data?: { id?: string; defaultDatasetId?: string } }
    const runId = cuerpo.data?.id
    const datasetId = cuerpo.data?.defaultDatasetId
    if (!runId || !datasetId) {
      throw new ScoutingUnavailableError('Apify no devolvió el identificador de la corrida.')
    }
    // Se guardan los dos: uno para consultar el estado y otro para leer el
    // resultado. La interfaz sólo transporta un identificador.
    return { jobId: `${runId}|${datasetId}|${plataforma}`, provider: this.name }
  }

  async startDiscover(params: DiscoverParams): Promise<JobHandle> {
    return this.lanzar(params.platform, 'DISCOVER', { keywords: params.keywords, limit: params.limit })
  }

  async startEnrich(params: EnrichParams): Promise<JobHandle> {
    return this.lanzar(params.platform, 'ENRICH', { urls: params.urls, limit: params.urls.length })
  }

  async poll(job: JobHandle): Promise<JobProgress> {
    const [runId, datasetId, plataforma] = job.jobId.split('|')
    if (!runId || !datasetId) return { status: 'FAILED', message: 'Identificador de corrida inválido.' }

    const estado = await this.pedir(`/actor-runs/${encodeURIComponent(runId)}`)
    if (!estado.ok) {
      return { status: 'FAILED', message: `No se pudo consultar el estado de la corrida (${estado.status}).` }
    }
    const cuerpo = (await estado.json()) as { data?: { status?: string; stats?: { itemCount?: number } } }
    const situacion = cuerpo.data?.status

    if (situacion === 'FAILED' || situacion === 'ABORTED' || situacion === 'TIMED-OUT') {
      return { status: 'FAILED', message: `Apify terminó la corrida como ${situacion}.` }
    }
    if (situacion !== 'SUCCEEDED') {
      return { status: 'RUNNING', collected: cuerpo.data?.stats?.itemCount ?? 0 }
    }

    const items = await this.pedir(`/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`)
    if (!items.ok) return { status: 'FAILED', message: `No se pudo descargar el resultado (${items.status}).` }
    const filas = (await items.json()) as unknown
    if (!Array.isArray(filas)) return { status: 'FAILED', message: 'Apify devolvió un formato inesperado.' }

    const registros = filas
      .map((fila) => apifyToRecord(fila as Record<string, unknown>, (plataforma ?? 'INSTAGRAM') as Platform))
      .filter((registro): registro is ScoutingRecord => registro !== null)

    return { status: 'READY', records: unificarPorPerfil(registros) }
  }

  async cancel(job: JobHandle): Promise<void> {
    const [runId] = job.jobId.split('|')
    if (!runId) return
    await this.pedir(`/actor-runs/${encodeURIComponent(runId)}/abort`, { method: 'POST' }).catch(() => undefined)
  }

  async fetchProfileImage(handle: string): Promise<{ imageUrl: string | null; displayName: string | null }> {
    if (!this.actorFor('INSTAGRAM', 'ENRICH')) return { imageUrl: null, displayName: null }
    try {
      const job = await this.startEnrich({ platform: 'INSTAGRAM', urls: [urlDeHandle('INSTAGRAM', handle)] })
      const limite = Date.now() + 90_000
      while (Date.now() < limite) {
        const progreso = await this.poll(job)
        if (progreso.status === 'READY') {
          const primero = progreso.records[0]
          return { imageUrl: primero?.profileImageUrl ?? null, displayName: primero?.displayName ?? null }
        }
        if (progreso.status === 'FAILED') break
        await new Promise((resolve) => setTimeout(resolve, 5_000))
      }
    } catch {
      /* la marca se puede definir a mano; no vale la pena romper por esto */
    }
    return { imageUrl: null, displayName: null }
  }
}

/** Un creador, una fila. Ver la nota en el adaptador de Bright Data. */
function unificarPorPerfil(registros: ScoutingRecord[]): ScoutingRecord[] {
  const completitud = (r: ScoutingRecord): number =>
    [r.followers, r.bio, r.profileImageUrl, r.displayName, r.country].filter((v) => v !== null && v !== undefined).length
  const porPerfil = new Map<string, ScoutingRecord>()
  for (const registro of registros) {
    const existente = porPerfil.get(registro.urlNormalized)
    if (!existente || completitud(registro) > completitud(existente)) porPerfil.set(registro.urlNormalized, registro)
  }
  return [...porPerfil.values()]
}

/** Traduce el rechazo a algo accionable, igual que con el otro proveedor. */
export function explicarRechazoApify(status: number, detalle: string): string {
  const texto = detalle.slice(0, 300)
  const normalizado = texto.toLowerCase()

  if (status === 401 || status === 403) {
    return 'Apify no aceptó las credenciales de scouting. Hay que revisar APIFY_TOKEN.'
  }
  if (status === 404) {
    return `Apify no encontró el actor configurado. Puede haber cambiado de nombre o dejado de publicarse. ${texto}`
  }
  if (normalizado.includes('insufficient') || normalizado.includes('credit') || status === 402) {
    return 'La cuenta de Apify se quedó sin crédito.'
  }
  if (status === 429) {
    return 'Apify está limitando los pedidos. Conviene reintentar en unos minutos.'
  }
  return `Apify rechazó el pedido (${status}). ${texto}`
}
