import 'server-only'
import type { Platform } from '@/generated/prisma/enums'
import { construirEntrada, type EsquemaDeActor } from './apify-esquema'
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

/** Apify rechaza un techo de gasto por debajo de esto. */
const MINIMO_TECHO_USD = 0.5

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
    const usuarios = urls.map((u) => u.replace(/\/+$/, '').split('/').pop()?.replace(/^@/, '') ?? u)
    // clockworks~tiktok-scraper
    if (plataforma === 'TIKTOK') {
      return {
        profiles: usuarios,
        resultsPerPage: 1,
        profileScrapeSections: ['videos'],
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadAvatars: false,
      }
    }
    // streamers~youtube-channel-scraper
    if (plataforma === 'YOUTUBE') return { startUrls: urls.map((url) => ({ url })), maxResults: 1 }
    // apify~instagram-profile-scraper
    return { usernames: usuarios }
  }

  const keywords = params.keywords ?? []
  const porPalabra = Math.max(1, Math.ceil(tope / Math.max(1, keywords.length)))

  if (plataforma === 'TIKTOK') {
    /*
     * `searchSection: 'Profile'` es la diferencia con Bright Data: TikTok
     * devuelve PERFILES en vez de posts de los que haya que deducir el autor.
     * `maxProfilesPerQuery` es el tope que aplica el actor.
     */
    return {
      searchQueries: keywords.map((k) => k.replace(/^#/, '')),
      searchSection: '/user',
      maxProfilesPerQuery: porPalabra,
      resultsPerPage: 1,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadAvatars: false,
    }
  }

  // streamers~youtube-scraper: busca videos, y de cada uno sale su canal.
  if (plataforma === 'YOUTUBE') {
    return { searchQueries: keywords, maxResults: porPalabra, maxResultsShorts: 0, maxResultStreams: 0 }
  }

  /*
   * apify~instagram-hashtag-scraper. `hashtags` es obligatorio y va sin
   * almohadilla. `keywordSearch` permite buscar texto libre en vez de hashtag,
   * que es lo que hace falta cuando la palabra no es un hashtag.
   */
  const soloHashtags = keywords.every((k) => k.startsWith('#'))
  return {
    hashtags: keywords.map((k) => k.replace(/^#/, '')),
    keywordSearch: !soloHashtags,
    resultsType: 'posts',
    resultsLimit: porPalabra,
  }
}

export class ApifyScoutingProvider implements ScoutingProvider {
  readonly name = 'apify'
  readonly filtraPorAudiencia = false
  readonly configured = true
  /** Esquemas ya leídos, por actor. No cambian entre corridas. */
  private readonly esquemas = new Map<string, EsquemaDeActor | null>()

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

    /*
     * Dos frenos, y hacen falta los dos.
     *
     * `maxItems` acota la cantidad de resultados, que es lo que se cobra.
     * `maxTotalChargeUsd` es el techo en dólares, pero Apify NO acepta un techo
     * menor a US$ 0,50: mandarlo en una búsqueda chica hace fallar el pedido
     * entero. Así que sólo se manda cuando el techo llega a ese mínimo, y en el
     * resto de los casos el que manda es `maxItems`.
     */
    const techoUsd = this.costPerRecord * tope * 1.1
    const parametros = new URLSearchParams({ maxItems: String(tope) })
    if (techoUsd >= MINIMO_TECHO_USD) parametros.set('maxTotalChargeUsd', techoUsd.toFixed(4))

    /*
     * La entrada sale del esquema que declara el actor, no de su nombre.
     *
     * Los actores de la tienda no comparten nombres de campo: uno pide
     * `hashtags` como lista y otro `query` como texto. Codificar un actor acá
     * funciona hasta que alguien cambia de actor, y entonces la corrida falla
     * DESPUÉS de cobrarse. Si el esquema no se puede leer, se cae a la entrada
     * escrita a mano, que sirve para los actores conocidos.
     */
    const entrada = await this.entradaSegunEsquema(actor, plataforma, modo, params)

    const response = await this.pedir(
      `/actors/${encodeURIComponent(actor)}/runs?${parametros.toString()}`,
      { method: 'POST', body: JSON.stringify(entrada) },
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

  /**
   * Lee el esquema del actor (una vez) y arma la entrada con sus nombres de
   * campo. Ante cualquier duda vuelve a la entrada escrita a mano.
   */
  private async entradaSegunEsquema(
    actor: string,
    plataforma: Platform,
    modo: 'DISCOVER' | 'ENRICH',
    params: { keywords?: string[]; urls?: string[]; limit: number },
  ): Promise<Record<string, unknown>> {
    const aMano = apifyInput(plataforma, modo, params)
    // Actualizar métricas va por URL o usuario, que ya es específico del actor.
    if (modo !== 'DISCOVER') return aMano

    if (!this.esquemas.has(actor)) {
      const esquema = await this.pedir(`/acts/${encodeURIComponent(actor)}/builds/default`)
        .then(async (r) => {
          if (!r.ok) return null
          const cuerpo = (await r.json()) as { data?: { inputSchema?: unknown } }
          const crudo = cuerpo.data?.inputSchema
          const parseado = typeof crudo === 'string' ? (JSON.parse(crudo) as unknown) : crudo
          return (parseado ?? null) as EsquemaDeActor | null
        })
        .catch(() => null)
      this.esquemas.set(actor, esquema)
    }

    const esquema = this.esquemas.get(actor) ?? null
    if (!esquema?.properties) return aMano

    const terminos = (params.keywords ?? []).map((k) => k.replace(/^#/, '')).filter(Boolean)
    const tope = Math.max(1, Math.min(500, params.limit))
    // Si el esquema pide algo que no sabemos completar, el error dice cuál: es
    // mejor no ejecutar que ejecutar y que falle cobrado.
    return construirEntrada(esquema, { terminos, tope })
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

    /*
     * Una corrida ABORTADA que trajo datos NO es un fracaso.
     *
     * Apify corta la corrida sola cuando se alcanza el tope que nosotros
     * mismos le pasamos (`maxItems`), y la marca ABORTED. Encontrado
     * ejecutando: 28 perfiles traídos y cobrados, y la pantalla decía "falló"
     * -- se pagó por datos que se tiraron.
     *
     * Lo que decide es si hay resultados, no la etiqueta.
     */
    const traidos = cuerpo.data?.stats?.itemCount ?? 0
    const cortadaConDatos = situacion === 'ABORTED' && traidos > 0

    if (!cortadaConDatos && (situacion === 'FAILED' || situacion === 'ABORTED' || situacion === 'TIMED-OUT')) {
      return { status: 'FAILED', message: `Apify terminó la corrida como ${situacion}.` }
    }
    if (situacion !== 'SUCCEEDED' && !cortadaConDatos) {
      return { status: 'RUNNING', collected: traidos }
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
