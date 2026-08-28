import 'server-only'
import type { Platform } from '@/generated/prisma/enums'
import { env } from '@/lib/env'
import { parseFollowers, parseProfileUrl } from '@/lib/domain/normalize'
import { ApifyScoutingProvider } from './scouting-apify'
import { HypeAuditorScoutingProvider } from './scouting-hypeauditor'
import { InfluencersClubScoutingProvider } from './scouting-influencers-club'
import type { ClaveDeFiltro, FiltrosDeAudiencia, FiltrosDeScouting } from '@/lib/domain/filtros-scouting'

/**
 * Proveedor de scouting.
 *
 * La aplicación depende de esta interfaz, no de Bright Data. Cambiar de
 * proveedor es escribir otro adaptador.
 *
 * Dos reglas que no se negocian:
 *  1. Cuesta plata de verdad, así que todo pedido declara su costo estimado
 *     ANTES de ejecutarse y se contrasta contra un tope duro.
 *  2. Si no hay proveedor configurado, el sistema lo dice. Nunca devuelve datos
 *     inventados que parezcan reales.
 */

export type ScoutingRecord = {
  platform: Platform
  url: string
  urlNormalized: string
  handle: string | null
  displayName: string | null
  followers: number | null
  engagementRate: number | null
  country: string | null
  bio: string | null
  profileImageUrl: string | null
  raw: unknown
}

export type DiscoverParams = {
  platform: Platform
  /** Hashtags o palabras clave por las que buscar. */
  keywords: string[]
  country?: string | null
  minFollowers?: number | null
  maxFollowers?: number | null
  limit: number
  /**
   * Los filtros pedidos, para el proveedor que sepa aplicarlos.
   *
   * Los scrapers no filtran: devuelven lo que encuentran y recién después se
   * marca cada resultado (`filtros-scouting.ts`). Un proveedor de datos, en
   * cambio, filtra en el origen, y eso cambia lo que se paga: no se traen 200
   * perfiles para quedarse con 12. Quien no sepa usarlos los ignora, y el
   * marcado posterior sigue funcionando igual.
   */
  filtros?: FiltrosDeScouting | null
  /**
   * Filtros sobre el PÚBLICO del creador, no sobre el creador.
   *
   * Ningún scraper puede contestarlos. Van aparte para que quede a la vista
   * que sólo un proveedor de datos los aplica.
   */
  audiencia?: FiltrosDeAudiencia | null
}

export type EnrichParams = {
  platform: Platform
  /** URLs de perfil a refrescar. */
  urls: string[]
}

export type JobHandle = { jobId: string; provider: string }

export type JobProgress =
  | { status: 'RUNNING'; collected: number }
  | { status: 'READY'; records: ScoutingRecord[] }
  | { status: 'FAILED'; message: string }

export class ScoutingUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScoutingUnavailableError'
  }
}

export interface ScoutingProvider {
  readonly name: string
  /** Si es false, el producto tiene que decirlo en pantalla en vez de simular. */
  readonly configured: boolean
  /**
   * Si filtra por la AUDIENCIA del creador --país, edad, género del público--.
   *
   * La pantalla lo pregunta antes de ofrecer esos campos. Un scraper no puede
   * contestarlos, y ofrecer un filtro que no filtra es peor que no tenerlo:
   * el resultado parece verificado cuando no lo está.
   */
  readonly filtraPorAudiencia: boolean
  /** Costo por registro entregado, en dólares. */
  unitCostUsd(platform: Platform): number
  supports(platform: Platform, mode: 'DISCOVER' | 'ENRICH'): boolean
  /**
   * Qué filtros aplica ÉL antes de devolver.
   *
   * Los scrapers devuelven `[]`: no filtran, sólo traen. Un proveedor de datos
   * devuelve las claves que garantiza, y esos resultados no se vuelven a
   * marcar como "no se pudo comprobar".
   */
  filtrosEnOrigen(params: DiscoverParams): ClaveDeFiltro[]
  startDiscover(params: DiscoverParams): Promise<JobHandle>
  startEnrich(params: EnrichParams): Promise<JobHandle>
  poll(job: JobHandle): Promise<JobProgress>
  cancel(job: JobHandle): Promise<void>
  /** Foto de perfil, para deducir la identidad visual de un cliente. */
  fetchProfileImage(handle: string): Promise<{ imageUrl: string | null; displayName: string | null }>
}

// ── Adaptador sin configurar ─────────────────────────────────────────────────

const NOT_CONFIGURED =
  'El proveedor de scouting no está configurado. Cargá BRIGHTDATA_API_TOKEN y los identificadores de dataset para habilitarlo.'

class UnconfiguredScoutingProvider implements ScoutingProvider {
  readonly name = 'sin configurar'
  readonly configured = false
  readonly filtraPorAudiencia = false
  unitCostUsd(): number {
    return 0
  }
  supports(): boolean {
    return false
  }
  filtrosEnOrigen(): ClaveDeFiltro[] {
    return []
  }
  async startDiscover(): Promise<JobHandle> {
    throw new ScoutingUnavailableError(NOT_CONFIGURED)
  }
  async startEnrich(): Promise<JobHandle> {
    throw new ScoutingUnavailableError(NOT_CONFIGURED)
  }
  async poll(): Promise<JobProgress> {
    throw new ScoutingUnavailableError(NOT_CONFIGURED)
  }
  async cancel(): Promise<void> {
    /* nada que cancelar */
  }
  async fetchProfileImage(): Promise<{ imageUrl: string | null; displayName: string | null }> {
    // Devuelve vacío en vez de fallar: quien llama ya avisa que hace falta el proveedor.
    return { imageUrl: null, displayName: null }
  }
}

// ── Adaptador Bright Data (Web Scraper API) ──────────────────────────────────

const BRIGHTDATA_BASE = 'https://api.brightdata.com/datasets/v3'

type BrightDataDatasets = {
  instagramProfiles?: string
  instagramDiscover?: string
  tiktokProfiles?: string
  tiktokDiscover?: string
  youtubeProfiles?: string
  youtubeDiscover?: string
}

/**
 * Cómo descubre cada red, que no es lo mismo en las tres.
 *
 * - YouTube devuelve CANALES: perfiles con suscriptores, un solo paso.
 * - TikTok devuelve POSTS, pero cada uno trae el perfil de quien lo publicó,
 *   con seguidores incluidos. Alcanza para armar el perfil sin pagar de nuevo.
 * - Instagram no tiene búsqueda de perfiles por palabra clave. Antes que
 *   inventar un rodeo caro, la aplicación lo dice.
 */
type FormaDeDescubrimiento = 'PERFILES' | 'POSTS_CON_AUTOR'

/** Lee un número de un registro sin importar cómo lo llame el proveedor. */
function pickNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
    if (typeof value === 'string') {
      const parsed = parseFollowers(value)
      if (parsed.kind === 'value') return parsed.value
    }
  }
  return null
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function pickRate(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      // Algunos datasets devuelven 0.031 y otros 3.1.
      return value <= 1 ? Number((value * 100).toFixed(3)) : Number(value.toFixed(3))
    }
    if (typeof value === 'string') {
      const numeric = Number(value.replace('%', '').replace(',', '.'))
      if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) return Number(numeric.toFixed(3))
    }
  }
  return null
}

/**
 * Traduce el rechazo del proveedor a algo accionable.
 *
 * El texto crudo ("Customer is not active") es correcto pero no dice qué hacer,
 * y quien lo lee en la aplicación no tiene el panel del proveedor abierto. Se
 * conserva el detalle original al final: sin él no se puede diagnosticar nada
 * que no esté previsto acá.
 */
function explicarRechazo(status: number, detalle: string): string {
  const texto = detalle.slice(0, 300)
  const normalizado = texto.toLowerCase()

  if (normalizado.includes('customer is not active')) {
    return 'La cuenta del proveedor de scouting no está activa. Suele resolverse completando la facturación en su panel; los créditos gratuitos no se pueden usar hasta entonces.'
  }
  if (status === 401 || status === 403) {
    return 'El proveedor no aceptó las credenciales de scouting. Hay que revisar el token de API.'
  }
  if (status === 402 || normalizado.includes('insufficient') || normalizado.includes('balance')) {
    return 'La cuenta del proveedor de scouting se quedó sin saldo.'
  }
  if (status === 429) {
    return 'El proveedor está limitando los pedidos. Conviene reintentar en unos minutos.'
  }
  if (normalizado.includes('dataset')) {
    return `El proveedor no reconoció el dataset configurado. ${texto}`
  }
  return `El proveedor rechazó el pedido (${status}). ${texto}`
}


/**
 * Un creador, una fila.
 *
 * Descubrir en TikTok devuelve posts, y varios pueden ser del mismo creador: si
 * no se unifican, la misma persona aparece cinco veces en los resultados. Se
 * conserva la versión más completa de cada perfil, no la primera que llegó.
 */
function unificarPorPerfil(registros: ScoutingRecord[]): ScoutingRecord[] {
  const completitud = (r: ScoutingRecord): number =>
    [r.followers, r.engagementRate, r.bio, r.profileImageUrl, r.displayName, r.country].filter(
      (valor) => valor !== null && valor !== undefined,
    ).length

  const porPerfil = new Map<string, ScoutingRecord>()
  for (const registro of registros) {
    const existente = porPerfil.get(registro.urlNormalized)
    if (!existente || completitud(registro) > completitud(existente)) porPerfil.set(registro.urlNormalized, registro)
  }
  return [...porPerfil.values()]
}

class BrightDataProvider implements ScoutingProvider {
  readonly name = 'brightdata'
  readonly configured = true
  readonly filtraPorAudiencia = false
  /** Un scraper no filtra: trae lo que encuentra y se comprueba después. */
  filtrosEnOrigen(): ClaveDeFiltro[] {
    return []
  }

  constructor(
    private readonly token: string,
    private readonly datasets: BrightDataDatasets,
    private readonly costPerRecord: number,
  ) {}

  unitCostUsd(): number {
    return this.costPerRecord
  }

  supports(platform: Platform, mode: 'DISCOVER' | 'ENRICH'): boolean {
    return this.datasetFor(platform, mode) !== null
  }

  private datasetFor(platform: Platform, mode: 'DISCOVER' | 'ENRICH'): string | null {
    const porRed: Partial<Record<Platform, { discover?: string; enrich?: string }>> = {
      INSTAGRAM: { discover: this.datasets.instagramDiscover, enrich: this.datasets.instagramProfiles },
      TIKTOK: { discover: this.datasets.tiktokDiscover, enrich: this.datasets.tiktokProfiles },
      YOUTUBE: { discover: this.datasets.youtubeDiscover, enrich: this.datasets.youtubeProfiles },
    }
    const entrada = porRed[platform]
    return (mode === 'DISCOVER' ? entrada?.discover : entrada?.enrich) ?? null
  }

  /** Qué devuelve el descubrimiento de esta red. */
  private formaDe(platform: Platform): FormaDeDescubrimiento {
    return platform === 'YOUTUBE' ? 'PERFILES' : 'POSTS_CON_AUTOR'
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      return await fetch(`${BRIGHTDATA_BASE}${path}`, {
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

  private async trigger(
    datasetId: string,
    payload: unknown[],
    extraQuery = '',
    limitPerInput?: number,
  ): Promise<JobHandle> {
    const tope = limitPerInput ? `&limit_per_input=${limitPerInput}` : ''
    const response = await this.request(
      `/trigger?dataset_id=${encodeURIComponent(datasetId)}&include_errors=true${tope}${extraQuery}`,
      { method: 'POST', body: JSON.stringify(payload) },
    )
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new ScoutingUnavailableError(explicarRechazo(response.status, detail))
    }
    const body = (await response.json()) as { snapshot_id?: string }
    if (!body.snapshot_id) throw new ScoutingUnavailableError('El proveedor no devolvió un identificador de trabajo.')
    return { jobId: body.snapshot_id, provider: this.name }
  }

  async startDiscover(params: DiscoverParams): Promise<JobHandle> {
    const datasetId = this.datasetFor(params.platform, 'DISCOVER')
    if (!datasetId) {
      throw new ScoutingUnavailableError(
        params.platform === 'INSTAGRAM'
          ? 'Instagram no permite buscar perfiles por palabra clave. Se puede actualizar métricas de perfiles que ya tengas, o descubrir en TikTok y YouTube.'
          : `No hay dataset configurado para descubrir perfiles en ${params.platform}.`,
      )
    }

    /*
     * `limit_per_input` NO es opcional.
     *
     * Sin él, una sola palabra clave devolvió 387 registros en una prueba: casi
     * sesenta centavos por una búsqueda que se pidió "chica". Se cobra por
     * registro entregado, así que sin tope el número que le mostramos a quien
     * ejecuta antes de gastar deja de ser una promesa.
     */
    const tope = Math.max(1, Math.min(500, params.limit))
    const porPalabra = Math.max(1, Math.ceil(tope / Math.max(1, params.keywords.length)))

    if (this.formaDe(params.platform) === 'PERFILES') {
      // YouTube: la palabra clave devuelve canales directamente. No acepta
      // país -- lo rechaza con un error de validación -- así que el filtro
      // geográfico se aplica después, sobre lo que devuelve.
      return this.trigger(
        datasetId,
        params.keywords.map((keyword) => ({ keyword })),
        '&type=discover_new&discover_by=keyword',
        porPalabra,
      )
    }

    // TikTok: devuelve posts, y cada uno trae el perfil de su autor.
    return this.trigger(
      datasetId,
      params.keywords.map((keyword) => ({
        search_keyword: keyword,
        num_of_posts: porPalabra,
        country: params.country ?? '',
      })),
      '&type=discover_new&discover_by=keyword',
      porPalabra,
    )
  }

  async startEnrich(params: EnrichParams): Promise<JobHandle> {
    const datasetId = this.datasetFor(params.platform, 'ENRICH')
    if (!datasetId) {
      throw new ScoutingUnavailableError(`No hay dataset configurado para traer métricas de ${params.platform}.`)
    }
    return this.trigger(
      datasetId,
      params.urls.map((url) => ({ url })),
    )
  }

  async poll(job: JobHandle): Promise<JobProgress> {
    const progress = await this.request(`/progress/${encodeURIComponent(job.jobId)}`)
    if (!progress.ok) {
      return { status: 'FAILED', message: `No se pudo consultar el estado del trabajo (${progress.status}).` }
    }
    const state = (await progress.json()) as { status?: string; records?: number; errors?: number }

    if (state.status === 'failed') return { status: 'FAILED', message: 'El proveedor marcó el trabajo como fallido.' }
    if (state.status !== 'ready') return { status: 'RUNNING', collected: state.records ?? 0 }

    const snapshot = await this.request(`/snapshot/${encodeURIComponent(job.jobId)}?format=json`)
    if (!snapshot.ok) {
      return { status: 'FAILED', message: `No se pudo descargar el resultado (${snapshot.status}).` }
    }
    const rows = (await snapshot.json()) as unknown
    if (!Array.isArray(rows)) return { status: 'FAILED', message: 'El proveedor devolvió un formato inesperado.' }

    const registros = rows.map((row) => this.toRecord(row as Record<string, unknown>)).filter(isRecord)
    return { status: 'READY', records: unificarPorPerfil(registros) }
  }

  async cancel(job: JobHandle): Promise<void> {
    await this.request(`/snapshot/${encodeURIComponent(job.jobId)}/cancel`, { method: 'POST' }).catch(() => undefined)
  }

  /**
   * Lleva un registro del proveedor a nuestro modelo.
   *
   * Vienen en tres formas distintas y hay que reconocerlas por sus campos, no
   * por la red: un perfil de Instagram, un canal de YouTube, y un post de
   * TikTok que trae adentro el perfil de quien lo publicó. Esa última es la que
   * hace que descubrir en TikTok no cueste dos veces.
   *
   * Devuelve null cuando no se puede armar un perfil identificable. Preferimos
   * perder un registro antes que inventar uno.
   */
  private toRecord(row: Record<string, unknown>): ScoutingRecord | null {
    // Un post de TikTok: el perfil está en las columnas `profile_*`.
    const urlDeAutor = pickString(row, ['profile_url'])
    const esPostConAutor = Boolean(urlDeAutor) && Boolean(pickString(row, ['post_id', 'video_url', 'post_type']))

    const rawUrl = esPostConAutor
      ? urlDeAutor
      : (pickString(row, ['url', 'profile_url', 'input_url', 'account_url', 'user_profile_url']) ??
        (pickString(row, ['account', 'username', 'user_name'])
          ? `https://www.instagram.com/${pickString(row, ['account', 'username', 'user_name'])}`
          : null))
    if (!rawUrl) return null

    const parsed = parseProfileUrl(rawUrl)
    if (parsed.kind !== 'value') return null

    return {
      platform: parsed.value.platform,
      url: parsed.value.url,
      urlNormalized: parsed.value.urlNormalized,
      handle:
        parsed.value.handle ?? pickString(row, ['handle', 'account', 'username', 'user_name', 'account_id']),
      displayName: esPostConAutor
        ? pickString(row, ['profile_username', 'account_id'])
        : pickString(row, ['full_name', 'name', 'nickname', 'display_name']),
      followers: pickNumber(row, [
        'followers',
        'followers_count',
        'follower_count',
        'edge_followed_by',
        // TikTok, dentro de un post.
        'profile_followers',
        // YouTube llama distinto a lo mismo.
        'subscribers',
      ]),
      engagementRate: pickRate(row, ['engagement_rate', 'avg_engagement', 'engagement']),
      country: pickString(row, ['country', 'country_code', 'business_address_country', 'region']),
      bio: esPostConAutor
        ? pickString(row, ['profile_biography'])
        : pickString(row, ['biography', 'bio', 'description', 'signature']),
      profileImageUrl: pickString(row, [
        'profile_image_link',
        'profile_pic_url',
        'avatar',
        'profile_image_url',
        'profile_avatar',
        'profile_image',
      ]),
      raw: row,
    }
  }

  async fetchProfileImage(handle: string): Promise<{ imageUrl: string | null; displayName: string | null }> {
    const datasetId = this.datasetFor('INSTAGRAM', 'ENRICH')
    if (!datasetId) return { imageUrl: null, displayName: null }
    try {
      const job = await this.startEnrich({
        platform: 'INSTAGRAM',
        urls: [`https://www.instagram.com/${handle}`],
      })
      // Un solo perfil resuelve rápido; se espera acotado para no colgar la pantalla.
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2_500))
        const progress = await this.poll(job)
        if (progress.status === 'FAILED') return { imageUrl: null, displayName: null }
        if (progress.status === 'READY') {
          const first = progress.records[0]
          return { imageUrl: first?.profileImageUrl ?? null, displayName: first?.displayName ?? null }
        }
      }
      return { imageUrl: null, displayName: null }
    } catch {
      return { imageUrl: null, displayName: null }
    }
  }
}

const isRecord = (value: ScoutingRecord | null): value is ScoutingRecord => value !== null

let cached: ScoutingProvider | null = null
let armados: ScoutingProvider[] | null = null

function armar(): ScoutingProvider[] {
  if (armados) return armados
  const config = env()

  const apifyToken = config.APIFY_TOKEN ?? config.APIFY_API_TOKEN
  const apify: ScoutingProvider = apifyToken
    ? new ApifyScoutingProvider(
        apifyToken,
        {
          instagramProfiles: config.APIFY_ACTOR_INSTAGRAM_PROFILES,
          instagramDiscover: config.APIFY_ACTOR_INSTAGRAM_DISCOVER,
          tiktokProfiles: config.APIFY_ACTOR_TIKTOK_PROFILES,
          tiktokDiscover: config.APIFY_ACTOR_TIKTOK_DISCOVER,
          youtubeProfiles: config.APIFY_ACTOR_YOUTUBE_PROFILES,
          youtubeDiscover: config.APIFY_ACTOR_YOUTUBE_DISCOVER,
        },
        config.APIFY_COST_PER_RECORD_USD,
      )
    : new UnconfiguredScoutingProvider()

  const brightdata: ScoutingProvider = config.BRIGHTDATA_API_TOKEN
    ? new BrightDataProvider(
        config.BRIGHTDATA_API_TOKEN,
        {
          instagramProfiles: config.BRIGHTDATA_DATASET_INSTAGRAM_PROFILES,
          instagramDiscover: config.BRIGHTDATA_DATASET_INSTAGRAM_DISCOVER,
          tiktokProfiles: config.BRIGHTDATA_DATASET_TIKTOK_PROFILES,
          tiktokDiscover: config.BRIGHTDATA_DATASET_TIKTOK_DISCOVER,
          youtubeProfiles: config.BRIGHTDATA_DATASET_YOUTUBE_PROFILES,
          youtubeDiscover: config.BRIGHTDATA_DATASET_YOUTUBE_DISCOVER,
        },
        config.BRIGHTDATA_COST_PER_RECORD_USD,
      )
    : new UnconfiguredScoutingProvider()

  const influencersClub: ScoutingProvider = new InfluencersClubScoutingProvider({
    apiKey: config.INFLUENCERS_CLUB_API_KEY ?? '',
    costoPorCreditoUsd: config.INFLUENCERS_CLUB_COST_PER_CREDIT_USD ?? null,
  })

  const hypeauditor: ScoutingProvider = new HypeAuditorScoutingProvider({
    authId: config.HYPEAUDITOR_AUTH_ID ?? '',
    token: config.HYPEAUDITOR_API_TOKEN ?? '',
    costoPorConsultaUsd: config.HYPEAUDITOR_COST_PER_CALL_USD ?? null,
    sandbox: config.HYPEAUDITOR_SANDBOX === true,
  })

  /*
   * El orden importa: es el que se recorre cuando el preferido no puede hacer
   * el trabajo.
   *
   * Adelante van los proveedores de datos, que son los únicos que filtran por
   * audiencia. influencers.club primero porque es el motor principal --cubre
   * cinco redes, cobra por creador devuelto y su clave se saca sola--, y
   * HypeAuditor detrás como opción premium si algún día hay acuerdo.
   *
   * Los scrapers quedan al final, que es donde estaban: siguen siendo lo único
   * que sabe actualizar las métricas de un perfil que ya tenemos.
   */
  armados = [influencersClub, hypeauditor, apify, brightdata]
  return armados
}

function porNombre(nombre: string): ScoutingProvider | null {
  return armar().find((p) => p.name === nombre) ?? null
}

/** El proveedor por defecto: el que dice `SCOUTING_PROVIDER`. */
export function scoutingProvider(): ScoutingProvider {
  if (cached) return cached
  const elegido = porNombre(env().SCOUTING_PROVIDER)
  cached = elegido ?? armar()[armar().length - 1]!
  return cached
}

/**
 * El proveedor que puede hacer ESTE trabajo.
 *
 * Ningún proveedor cubre todo. Bright Data, por ejemplo, no tiene descubrir por
 * palabra clave en Instagram --su biblioteca sólo ofrece "collect by URL" y
 * "discover by user name"--, y Apify sí. HypeAuditor descubre en cinco redes
 * pero no actualiza métricas. Antes eso obligaba a elegir un proveedor para
 * TODO y perder lo que el otro hacía mejor.
 *
 * Se prefiere el configurado por defecto; si no puede hacer esta combinación de
 * plataforma y modo, se recorre el resto en orden. Y si ninguno puede, se
 * devuelve el de siempre para que el preflight lo diga con su nombre.
 */
export function scoutingProviderFor(platform: Platform, mode: 'DISCOVER' | 'ENRICH'): ScoutingProvider {
  const preferido = scoutingProvider()
  if (preferido.configured && preferido.supports(platform, mode)) return preferido

  const alternativo = armar().find((p) => p !== preferido && p.configured && p.supports(platform, mode))
  return alternativo ?? preferido
}

/** El proveedor con el que se disparó una corrida, para poder seguirla. */
/**
 * Si hay algún proveedor conectado que sepa filtrar por audiencia.
 *
 * La pantalla ofrece esos campos sólo si alguien los puede aplicar. Con los
 * scrapers solos, el bloque sigue diciendo honestamente que no se puede.
 */
export function hayProveedorConAudiencia(): boolean {
  return armar().some((p) => p.configured && p.filtraPorAudiencia)
}

export function scoutingProviderNamed(name: string): ScoutingProvider {
  return porNombre(name) ?? scoutingProvider()
}

/** Sólo para tests: permite inyectar un proveedor y devolver el real después. */
export function __setScoutingProviderForTests(provider: ScoutingProvider | null): void {
  cached = provider
  // La lista también se reinicia: si no, el ruteo por plataforma seguiría
  // devolviendo el proveedor real de la corrida anterior.
  armados = provider ? [provider] : null
}
