import 'server-only'
import type { Platform } from '@/generated/prisma/enums'
import { env } from '@/lib/env'
import { parseFollowers, parseProfileUrl } from '@/lib/domain/normalize'

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
  /** Costo por registro entregado, en dólares. */
  unitCostUsd(platform: Platform): number
  supports(platform: Platform, mode: 'DISCOVER' | 'ENRICH'): boolean
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
  unitCostUsd(): number {
    return 0
  }
  supports(): boolean {
    return false
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
}

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

class BrightDataProvider implements ScoutingProvider {
  readonly name = 'brightdata'
  readonly configured = true

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
    if (platform === 'INSTAGRAM') {
      return (mode === 'DISCOVER' ? this.datasets.instagramDiscover : this.datasets.instagramProfiles) ?? null
    }
    if (platform === 'TIKTOK') {
      return (mode === 'DISCOVER' ? this.datasets.tiktokDiscover : this.datasets.tiktokProfiles) ?? null
    }
    return null
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

  private async trigger(datasetId: string, payload: unknown[], extraQuery = ''): Promise<JobHandle> {
    const response = await this.request(
      `/trigger?dataset_id=${encodeURIComponent(datasetId)}&include_errors=true${extraQuery}`,
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
      throw new ScoutingUnavailableError(`No hay dataset configurado para descubrir perfiles en ${params.platform}.`)
    }
    const payload = params.keywords.map((keyword) => ({
      search_keyword: keyword,
      keyword,
      country: params.country ?? '',
      num_of_posts: params.limit,
    }))
    return this.trigger(datasetId, payload, '&type=discover_new&discover_by=keyword')
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

    return { status: 'READY', records: rows.map((row) => this.toRecord(row as Record<string, unknown>)).filter(isRecord) }
  }

  async cancel(job: JobHandle): Promise<void> {
    await this.request(`/snapshot/${encodeURIComponent(job.jobId)}/cancel`, { method: 'POST' }).catch(() => undefined)
  }

  private toRecord(row: Record<string, unknown>): ScoutingRecord | null {
    const rawUrl =
      pickString(row, ['url', 'profile_url', 'input_url', 'account_url', 'user_profile_url']) ??
      (pickString(row, ['account', 'username', 'user_name'])
        ? `https://www.instagram.com/${pickString(row, ['account', 'username', 'user_name'])}`
        : null)
    if (!rawUrl) return null

    const parsed = parseProfileUrl(rawUrl)
    if (parsed.kind !== 'value') return null

    return {
      platform: parsed.value.platform,
      url: parsed.value.url,
      urlNormalized: parsed.value.urlNormalized,
      handle: parsed.value.handle ?? pickString(row, ['account', 'username', 'user_name']),
      displayName: pickString(row, ['full_name', 'name', 'nickname', 'display_name']),
      followers: pickNumber(row, ['followers', 'followers_count', 'follower_count', 'edge_followed_by']),
      engagementRate: pickRate(row, ['engagement_rate', 'avg_engagement', 'engagement']),
      country: pickString(row, ['country', 'country_code', 'business_address_country']),
      bio: pickString(row, ['biography', 'bio', 'description', 'signature']),
      profileImageUrl: pickString(row, ['profile_image_link', 'profile_pic_url', 'avatar', 'profile_image_url']),
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

export function scoutingProvider(): ScoutingProvider {
  if (cached) return cached
  const config = env()
  if (!config.BRIGHTDATA_API_TOKEN) {
    cached = new UnconfiguredScoutingProvider()
    return cached
  }
  cached = new BrightDataProvider(
    config.BRIGHTDATA_API_TOKEN,
    {
      instagramProfiles: config.BRIGHTDATA_DATASET_INSTAGRAM_PROFILES,
      instagramDiscover: config.BRIGHTDATA_DATASET_INSTAGRAM_DISCOVER,
      tiktokProfiles: config.BRIGHTDATA_DATASET_TIKTOK_PROFILES,
      tiktokDiscover: config.BRIGHTDATA_DATASET_TIKTOK_DISCOVER,
    },
    config.BRIGHTDATA_COST_PER_RECORD_USD,
  )
  return cached
}

/** Sólo para tests: permite inyectar un proveedor y devolver el real después. */
export function __setScoutingProviderForTests(provider: ScoutingProvider | null): void {
  cached = provider
}
