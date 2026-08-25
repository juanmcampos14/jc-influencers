import type { Platform } from '@/generated/prisma/enums'

/**
 * Normalización de los datos sucios del Excel.
 * Funciones puras: sin base de datos, sin efectos. Se testean solas.
 */

export type ParseOutcome<T> =
  /** Se pudo normalizar. */
  | { kind: 'value'; value: T; raw: string }
  /** El origen no traía dato ("A verificar", "—", vacío). No es un error. */
  | { kind: 'absent'; raw: string; reason: string }
  /** Había algo escrito pero no se pudo interpretar. Requiere revisión humana. */
  | { kind: 'unparseable'; raw: string; reason: string }

const PLACEHOLDERS = new Set([
  '',
  '-',
  '--',
  'n/a',
  'na',
  's/d',
  'sd',
  'a verificar',
  'a solicitar',
  'por verificar',
  'lo tiene oculto',
  'likes ocultos',
  'oculto',
  'ocultos',
  'pendiente',
  'sin datos',
  'tbd',
])

const DASHES = new RegExp('[\\u2010-\\u2015\\u2212]', 'g')

export function cleanText(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  return String(raw)
    .replace(new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g'), '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isPlaceholder(raw: string): boolean {
  const normalized = raw.replace(DASHES, '-').trim().toLowerCase()
  return PLACEHOLDERS.has(normalized)
}

// ── Seguidores ───────────────────────────────────────────────────────────────

const SUFFIX_MULTIPLIER: Record<string, number> = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }

/**
 * Convierte "78,9k", "7,2M", "176.000", "42,327", "10 k" a un entero.
 *
 * Reglas de desambiguación del separador:
 *  - Con sufijo k/M/B, el último separador es DECIMAL: "78,9k" = 78900.
 *  - Sin sufijo, un separador seguido de exactamente 3 dígitos es de MILES:
 *    "176.000" = 176000, "42,327" = 42327.
 *  - Sin sufijo y con un grupo final que no tiene 3 dígitos ("83.4") es ambiguo:
 *    se devuelve `unparseable` en vez de inventar un número.
 */
export function parseFollowers(rawInput: unknown): ParseOutcome<number> {
  const raw = cleanText(rawInput)
  if (isPlaceholder(raw)) return { kind: 'absent', raw, reason: 'sin dato en el origen' }

  // Descarta una etiqueta previa: "Instagram: 152.000" -> "152.000"
  const withoutLabel = raw.includes(':') ? (raw.split(':').pop() ?? raw) : raw
  const candidate = withoutLabel.trim()

  const match = candidate.match(/^([\d.,\s]+)\s*([kKmMbB])?\s*$/)
  if (!match) return { kind: 'unparseable', raw, reason: 'no parece un número de seguidores' }

  const digitsPart = (match[1] ?? '').replace(/\s/g, '')
  const suffix = match[2]?.toLowerCase()
  if (!digitsPart) return { kind: 'unparseable', raw, reason: 'sin dígitos' }

  const separators = digitsPart.match(/[.,]/g) ?? []
  const lastSeparatorIndex = Math.max(digitsPart.lastIndexOf('.'), digitsPart.lastIndexOf(','))
  const tail = lastSeparatorIndex >= 0 ? digitsPart.slice(lastSeparatorIndex + 1) : ''

  let numeric: number
  if (separators.length === 0) {
    numeric = Number(digitsPart)
  } else if (suffix) {
    // Con sufijo el último separador es decimal.
    numeric = Number(`${digitsPart.slice(0, lastSeparatorIndex).replace(/[.,]/g, '')}.${tail}`)
  } else if (tail.length === 3) {
    numeric = Number(digitsPart.replace(/[.,]/g, ''))
  } else {
    return {
      kind: 'unparseable',
      raw,
      reason: `separador ambiguo en "${digitsPart}" (sin sufijo k/M y el grupo final no tiene 3 dígitos)`,
    }
  }

  if (!Number.isFinite(numeric)) return { kind: 'unparseable', raw, reason: 'no es un número' }
  const value = Math.round(numeric * (suffix ? (SUFFIX_MULTIPLIER[suffix] ?? 1) : 1))
  if (value < 0) return { kind: 'unparseable', raw, reason: 'negativo' }
  if (value > 5_000_000_000) return { kind: 'unparseable', raw, reason: 'fuera de rango razonable' }
  return { kind: 'value', value, raw }
}

// ── Engagement rate ──────────────────────────────────────────────────────────

export type EngagementParse = { rate: number; platformHint: Platform | null }

/** Convierte "1.5%", "3.1% TT", "0,9%" a número. Rechaza valores que no son un ER. */
export function parseEngagementRate(rawInput: unknown): ParseOutcome<EngagementParse> {
  const raw = cleanText(rawInput)
  if (isPlaceholder(raw)) return { kind: 'absent', raw, reason: 'sin dato en el origen' }

  const platformHint = detectPlatformHint(raw)
  const withoutLabel = raw.includes(':') ? (raw.split(':').pop() ?? raw) : raw
  const match = withoutLabel.match(/(-?[\d]+(?:[.,][\d]+)?)\s*%/)

  if (!match) {
    // Sin "%" no es un engagement rate. En el Excel esto suele ser un número de
    // seguidores mal pegado en la columna de ER (p. ej. "Instagram: 3.500").
    return { kind: 'unparseable', raw, reason: 'no tiene símbolo de porcentaje' }
  }

  const rate = Number((match[1] ?? '').replace(',', '.'))
  if (!Number.isFinite(rate)) return { kind: 'unparseable', raw, reason: 'no es un número' }
  if (rate < 0 || rate > 100) return { kind: 'unparseable', raw, reason: `fuera de rango 0–100 (${rate})` }
  return { kind: 'value', value: { rate, platformHint }, raw }
}

function detectPlatformHint(raw: string): Platform | null {
  const lower = raw.toLowerCase()
  if (/\btt\b|tiktok/.test(lower)) return 'TIKTOK'
  if (/\big\b|instagram/.test(lower)) return 'INSTAGRAM'
  if (/\byt\b|youtube/.test(lower)) return 'YOUTUBE'
  return null
}

/**
 * Una celda puede traer varias métricas: "Instagram: 165.000 \n TikTok: 50.000".
 * Devuelve un valor por línea con la plataforma detectada en la etiqueta.
 */
export function splitMetricLines(rawInput: unknown): Array<{ platform: Platform | null; text: string }> {
  const raw = String(rawInput ?? '')
  return raw
    .split(/[\n\r]+/)
    .map((line) => cleanText(line))
    .filter((line) => line.length > 0)
    .map((line) => ({ platform: detectPlatformHint(line), text: line }))
}

// ── URLs, plataformas y handles ──────────────────────────────────────────────

// Parámetros de tracking que no identifican el perfil. Si no se sacan, la misma
// cuenta compartida desde dos lugares parece dos perfiles distintos.
const TRACKING_PARAMS =
  /^(ig[a-z]*|hl|lang|locale|utm_[a-z_]+|fbclid|gclid|si|nd|dlsi|ltsid|feature|_r|_t|is_from_webapp|sender_device|share_[a-z_]*|ref|ref_src|source|epik)$/i

export type ProfileParse = { platform: Platform; url: string; urlNormalized: string; handle: string | null }

/** Detecta plataforma, limpia parámetros de tracking y extrae el handle. */
export function parseProfileUrl(rawInput: unknown): ParseOutcome<ProfileParse> {
  const raw = cleanText(rawInput)
  if (isPlaceholder(raw)) return { kind: 'absent', raw, reason: 'sin URL' }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    return { kind: 'unparseable', raw, reason: 'no es una URL válida' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { kind: 'unparseable', raw, reason: 'protocolo no permitido' }
  }

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key)
  }
  url.hash = ''

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const segments = url.pathname.split('/').filter(Boolean)

  const platform = platformForHost(host)
  const handle = extractHandle(platform, segments)

  const cleanPath = segments
    .filter((segment) => !['reels', 'reel', 'p', 'videos', 'featured'].includes(segment.toLowerCase()))
    .join('/')
  const search = url.searchParams.toString()
  const urlNormalized = `${host}/${cleanPath}`.replace(/\/+$/, '').toLowerCase() + (search ? `?${search}` : '')

  return { kind: 'value', value: { platform, url: url.toString(), urlNormalized, handle }, raw }
}

function platformForHost(host: string): Platform {
  if (host.endsWith('instagram.com')) return 'INSTAGRAM'
  if (host.endsWith('tiktok.com')) return 'TIKTOK'
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'YOUTUBE'
  if (host.endsWith('linktr.ee') || host.endsWith('beacons.ai')) return 'LINKTREE'
  if (host.endsWith('twitter.com') || host === 'x.com') return 'X'
  if (host.endsWith('twitch.tv')) return 'TWITCH'
  if (host.endsWith('spotify.com')) return 'SPOTIFY'
  if (host.endsWith('facebook.com')) return 'FACEBOOK'
  if (host.endsWith('linkedin.com')) return 'LINKEDIN'
  return 'WEBSITE'
}

function extractHandle(platform: Platform, segments: string[]): string | null {
  const first = segments[0]
  if (!first) return null
  switch (platform) {
    case 'INSTAGRAM':
    case 'LINKTREE':
    case 'FACEBOOK':
    case 'TWITCH':
    case 'X':
      return normalizeHandle(first)
    case 'TIKTOK':
      return first.startsWith('@') ? normalizeHandle(first) : null
    case 'YOUTUBE':
      return first.startsWith('@') ? normalizeHandle(first) : null
    default:
      return null
  }
}

/** Un handle se guarda siempre en minúsculas y sin arroba. */
export function normalizeHandle(rawInput: unknown): string | null {
  const raw = cleanText(rawInput).replace(/^@+/, '').trim().toLowerCase()
  if (!raw || isPlaceholder(raw)) return null
  if (!/^[a-z0-9._-]{1,60}$/.test(raw)) return null
  return raw
}

// ── Otros valores del Excel ──────────────────────────────────────────────────

/** "⭐⭐⭐⭐⭐" -> 5. Devuelve null si no hay estrellas. */
export function parseStars(rawInput: unknown): number | null {
  const raw = String(rawInput ?? '')
  const count = (raw.match(/⭐/g) ?? []).length
  if (count === 0) return null
  return Math.min(5, count)
}

export type ClientApprovalValue = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW' | 'REPLACEMENT_REQUESTED'

/** Traduce los valores de la lista desplegable del Excel. */
export function parseClientApproval(rawInput: unknown): ClientApprovalValue {
  const raw = cleanText(rawInput).toUpperCase()
  if (!raw) return 'PENDING'
  if (raw.includes('APROBAD')) return 'APPROVED'
  if (raw.includes('DESCARTAD') || raw.includes('RECHAZAD')) return 'REJECTED'
  if (raw.includes('REEMPLAZ')) return 'REPLACEMENT_REQUESTED'
  if (raw.includes('REVISAR') || raw.includes('REVISION') || raw.includes('REVISIÓN')) return 'NEEDS_REVIEW'
  return 'PENDING'
}

/** Detecta filas que son títulos de bloque y no personas ("FEBRERO", "SCREENING"). */
export function looksLikeSectionHeading(text: string): boolean {
  const value = cleanText(text)
  if (!value) return false
  if (value.length > 80) return false
  const letters = value.replace(/[^\p{L}]/gu, '')
  if (letters.length < 3) return false
  const isUpper = letters === letters.toUpperCase()
  const months = /(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)/i
  const sections = /(SCREENING|FINALIZADOS|RECHAZADOS|NO DISPONIBLES|SHORTLIST|APROBADOS EN RONDAS|FOCO|CLUSTER|TRAVEL|BUSINESS|REMOTE|TECH|CRYPTO|FINTECH|FREELANCE|LIFESTYLE)/i
  return isUpper && (months.test(value) || sections.test(value) || /^[\p{Lu}\s/·—-]+$/u.test(value))
}

/** Detecta filas que describen a más de una persona ("Pamela Falbo + Sofia Priore"). */
export function looksLikeMultiplePeople(name: string): boolean {
  const value = cleanText(name)
  if (!value) return false
  return /\s(\+|&|y)\s/i.test(value) && /[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ]/.test(value)
}

/** Similitud de nombres (Dice sobre bigramas) para detectar duplicados. */
export function nameSimilarity(a: string, b: string): number {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const x = normalize(a)
  const y = normalize(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const bigrams = (value: string): Map<string, number> => {
    const map = new Map<string, number>()
    for (let i = 0; i < value.length - 1; i += 1) {
      const gram = value.slice(i, i + 2)
      map.set(gram, (map.get(gram) ?? 0) + 1)
    }
    return map
  }
  const gx = bigrams(x)
  const gy = bigrams(y)
  let shared = 0
  for (const [gram, count] of gx) shared += Math.min(count, gy.get(gram) ?? 0)
  const total = x.length - 1 + (y.length - 1)
  return total > 0 ? (2 * shared) / total : 0
}

/** Tier de audiencia según la lista desplegable del Excel. */
export type FollowerTier = 'NANO' | 'MICRO' | 'MACRO' | 'FAMA' | 'MEGA'

export const FOLLOWER_TIER_LABELS: Record<FollowerTier, string> = {
  NANO: 'Nano (< 10k)',
  MICRO: 'Micro (10k - 100k)',
  MACRO: 'Macro (100k - 500k)',
  FAMA: 'Fama (500k - 1M)',
  MEGA: 'Mega (> 1M)',
}

export function tierForFollowers(followers: number | null | undefined): FollowerTier | null {
  if (followers === null || followers === undefined) return null
  if (followers < 10_000) return 'NANO'
  if (followers < 100_000) return 'MICRO'
  if (followers < 500_000) return 'MACRO'
  if (followers < 1_000_000) return 'FAMA'
  return 'MEGA'
}

export function parseTierLabel(rawInput: unknown): FollowerTier | null {
  const raw = cleanText(rawInput).toUpperCase()
  if (!raw) return null
  if (raw.startsWith('NANO')) return 'NANO'
  if (raw.startsWith('MICRO')) return 'MICRO'
  if (raw.startsWith('MACRO')) return 'MACRO'
  if (raw.startsWith('FAMA')) return 'FAMA'
  if (raw.startsWith('MEGA')) return 'MEGA'
  return null
}

/** Convierte un texto en un slug estable. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
