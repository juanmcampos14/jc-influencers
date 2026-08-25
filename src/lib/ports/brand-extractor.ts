import 'server-only'
import sharp from 'sharp'
import {
  buildThemeFromBrandColors,
  dominantColors,
  normalizeHex,
  relativeLuminance,
  type ThemeColors,
} from '@/lib/domain/color'
import { safeFetch, parsePublicUrl, UnsafeUrlError } from './safe-fetch'

/**
 * Deduce la identidad visual de una marca a partir de su web, su Instagram o un
 * archivo que suba la agencia.
 *
 * Lo que devuelve es una PROPUESTA, no una verdad: siempre pasa por una pantalla
 * donde una persona la ve, la ajusta y la aprueba. Cada color viene con el lugar
 * de donde salió, para que se pueda discutir.
 */

export type BrandColorFinding = { hex: string; origin: string; weight: number }

export type BrandExtraction = {
  source: 'WEBSITE' | 'INSTAGRAM' | 'UPLOAD'
  sourceUrl: string | null
  siteTitle: string | null
  colors: BrandColorFinding[]
  logo: { url: string | null; data: Buffer | null; contentType: string | null; isDark: boolean } | null
  fontHints: string[]
  theme: ThemeColors
  warnings: string[]
}

const MAX_LOGO_BYTES = 3 * 1024 * 1024

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return match?.[1] ? decodeEntities(match[1].trim()) : null
}

function metaContent(html: string, matcher: RegExp): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = attribute(tag, 'name') ?? attribute(tag, 'property')
    if (key && matcher.test(key)) {
      const content = attribute(tag, 'content')
      if (content) return content
    }
  }
  return null
}

/** Candidatos a logo, del más probable al menos. */
function findLogoCandidates(html: string, baseUrl: URL): string[] {
  const candidates: string[] = []
  const push = (value: string | null): void => {
    if (!value) return
    try {
      candidates.push(new URL(value, baseUrl).toString())
    } catch {
      /* referencia rota en el HTML del sitio: se ignora */
    }
  }

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attribute(tag, 'rel') ?? '').toLowerCase()
    if (/apple-touch-icon|icon|mask-icon/.test(rel)) push(attribute(tag, 'href'))
  }
  push(metaContent(html, /^og:image$/i))
  push(metaContent(html, /^twitter:image$/i))

  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const haystack = `${attribute(tag, 'class') ?? ''} ${attribute(tag, 'id') ?? ''} ${attribute(tag, 'alt') ?? ''} ${attribute(tag, 'src') ?? ''}`
    if (/logo|brand|isotipo|marca/i.test(haystack)) push(attribute(tag, 'src'))
  }

  push('/favicon.ico')
  // Prioriza los formatos que sharp lee bien y descarta duplicados.
  const unique = [...new Set(candidates)]
  return unique.sort((a, b) => score(b) - score(a)).slice(0, 6)
}

function score(url: string): number {
  const value = url.toLowerCase()
  let points = 0
  if (/logo|brand|isotipo/.test(value)) points += 5
  if (/apple-touch-icon/.test(value)) points += 4
  if (/\.png($|\?)/.test(value)) points += 3
  if (/\.jpe?g($|\?)/.test(value)) points += 2
  if (/\.webp($|\?)/.test(value)) points += 2
  if (/og[-_]?image|opengraph/.test(value)) points += 1
  if (/\.svg($|\?)/.test(value)) points -= 1 // sharp necesita rasterizarlo
  if (/favicon\.ico/.test(value)) points -= 2
  return points
}

/** Colores declarados en el HTML o en los estilos embebidos. */
function colorsFromMarkup(html: string): BrandColorFinding[] {
  const findings: BrandColorFinding[] = []

  const themeColor = metaContent(html, /^theme-color$/i)
  const normalizedTheme = themeColor ? normalizeHex(themeColor) : null
  if (normalizedTheme) findings.push({ hex: normalizedTheme, origin: 'etiqueta theme-color del sitio', weight: 100 })

  const counts = new Map<string, number>()
  for (const match of html.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? []) {
    const hex = normalizeHex(match)
    if (!hex) continue
    // Blanco, negro y grises puros no identifican a nadie.
    if (/^#(fff|000)/.test(hex) || /^#(\w\w)\1\1$/.test(hex)) continue
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  for (const [hex, count] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    if (findings.some((finding) => finding.hex === hex)) continue
    findings.push({ hex, origin: `color usado ${count} ${count === 1 ? 'vez' : 'veces'} en los estilos del sitio`, weight: count })
  }

  return findings
}

function fontsFromMarkup(html: string): string[] {
  const fonts = new Set<string>()
  for (const match of html.match(/fonts\.googleapis\.com\/css2?\?[^"']+/gi) ?? []) {
    for (const family of match.match(/family=([^&:"']+)/gi) ?? []) {
      const name = decodeURIComponent(family.replace(/^family=/i, '')).replace(/\+/g, ' ').split(':')[0]
      if (name) fonts.add(name.trim())
    }
  }
  for (const match of html.match(/font-family\s*:\s*([^;}"']+)/gi) ?? []) {
    const first = match.replace(/font-family\s*:\s*/i, '').split(',')[0]?.replace(/["']/g, '').trim()
    if (first && first.length < 40 && !/^(inherit|initial|var\(|-apple|system-ui|sans-serif|serif|monospace)/i.test(first)) {
      fonts.add(first)
    }
  }
  return [...fonts].slice(0, 4)
}

/**
 * Colores dominantes de una imagen, y si el logo es oscuro o claro.
 *
 * La claridad se mide SÓLO sobre los píxeles opacos. Un logo blanco sobre fondo
 * transparente tiene un promedio general oscuro (el transparente se guarda como
 * negro) y se clasificaría al revés, que es justo el caso en el que después no
 * se ve sobre un panel claro.
 */
export async function colorsFromImage(data: Buffer): Promise<{ colors: BrandColorFinding[]; isDark: boolean }> {
  const { data: pixels, info } = await sharp(data, { failOn: 'none' })
    .resize(96, 96, { fit: 'inside', withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const channels = info.channels
  let opaqueCount = 0
  let luminanceSum = 0
  for (let index = 0; index + channels - 1 < pixels.length; index += channels) {
    const alpha = channels >= 4 ? Number(pixels[index + 3]) : 255
    if (alpha < 128) continue
    opaqueCount += 1
    luminanceSum += relativeLuminance({
      r: Number(pixels[index]),
      g: Number(pixels[index + 1]),
      b: Number(pixels[index + 2]),
    })
  }

  const dominant = dominantColors(pixels, { channels, max: 5 })
  return {
    colors: dominant.map((entry, index) => ({
      hex: entry.hex,
      origin: index === 0 ? 'color dominante del logo' : `color ${index + 1} del logo`,
      weight: entry.count,
    })),
    // Sin píxeles opacos no se puede afirmar nada: se asume claro, que es lo
    // que la interfaz ya sabe manejar poniéndole un fondo de contraste.
    isDark: opaqueCount > 0 ? luminanceSum / opaqueCount < 0.45 : false,
  }
}

/**
 * Un SVG de un sitio de terceros puede contener scripts, así que nunca se
 * almacena ni se sirve tal cual: se rasteriza a PNG y se guarda eso.
 */
async function toStorableImage(
  data: Buffer,
  contentType: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const metadata = await sharp(data, { failOn: 'none' }).metadata().catch(() => null)
  if (!metadata?.width || !metadata.height) return null

  const isSvg = metadata.format === 'svg' || contentType.includes('svg')
  const isSupported = ['png', 'jpeg', 'jpg', 'webp'].includes(metadata.format ?? '')

  if (isSvg || !isSupported) {
    const png = await sharp(data, { failOn: 'none', density: 384 })
      .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: false, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
      .catch(() => null)
    return png ? { data: png, contentType: 'image/png' } : null
  }

  return { data, contentType: `image/${metadata.format}` }
}

async function downloadLogo(candidates: string[]): Promise<BrandExtraction['logo']> {
  for (const candidate of candidates) {
    try {
      const response = await safeFetch(candidate, { maxBytes: MAX_LOGO_BYTES, accept: 'image/*' })
      if (response.status !== 200 || response.body.byteLength === 0) continue
      const contentType = response.contentType.split(';')[0]?.trim() ?? 'image/png'
      if (!contentType.startsWith('image/')) continue

      const metadata = await sharp(response.body, { failOn: 'none' }).metadata()
      if (!metadata.width || !metadata.height) continue
      // Un ícono diminuto no sirve como logo, salvo que sea vectorial.
      if (metadata.format !== 'svg' && (metadata.width < 32 || metadata.height < 32)) continue

      const storable = await toStorableImage(response.body, contentType)
      if (!storable) continue

      const { isDark } = await colorsFromImage(storable.data)
      return { url: response.finalUrl, data: storable.data, contentType: storable.contentType, isDark }
    } catch {
      // Un candidato que falla no invalida al resto.
      continue
    }
  }
  return null
}

/** Extrae la identidad visual de un sitio web. */
export async function extractFromWebsite(input: string, mode: 'LIGHT' | 'DARK' = 'LIGHT'): Promise<BrandExtraction> {
  const url = parsePublicUrl(input)
  const warnings: string[] = []

  const page = await safeFetch(url.toString(), { maxBytes: 2 * 1024 * 1024, accept: 'text/html,*/*' })
  if (page.status !== 200) warnings.push(`El sitio respondió ${page.status}. Se leyó lo que devolvió.`)
  if (page.truncated) warnings.push('La página es muy grande: se analizó sólo la primera parte.')

  const html = page.body.toString('utf8')
  const baseUrl = new URL(page.finalUrl)
  const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)

  const markupColors = colorsFromMarkup(html)
  const logo = await downloadLogo(findLogoCandidates(html, baseUrl))
  if (!logo) warnings.push('No se encontró un logo utilizable en el sitio. Se puede subir a mano.')

  const logoColors = logo?.data ? (await colorsFromImage(logo.data)).colors : []
  // El logo manda sobre los colores sueltos del CSS: identifica mejor a la marca.
  const colors = [...logoColors, ...markupColors].filter(
    (finding, index, all) => all.findIndex((other) => other.hex === finding.hex) === index,
  )
  if (colors.length === 0) {
    warnings.push('No se pudo deducir ningún color de marca. Se usa la paleta neutra.')
  }

  return {
    source: 'WEBSITE',
    sourceUrl: page.finalUrl,
    siteTitle: titleMatch?.[1] ? decodeEntities(titleMatch[1]).trim() : null,
    colors: colors.slice(0, 8),
    logo,
    fontHints: fontsFromMarkup(html),
    theme: buildThemeFromBrandColors(colors.map((color) => color.hex), mode),
    warnings,
  }
}

/** Extrae la identidad visual de un archivo (logo o captura) que sube la agencia. */
export async function extractFromUpload(
  data: Buffer,
  contentType: string,
  mode: 'LIGHT' | 'DARK' = 'LIGHT',
): Promise<BrandExtraction> {
  const storable = await toStorableImage(data, contentType)
  if (!storable) throw new UnsafeUrlError('No se pudo leer la imagen.')

  const { colors, isDark } = await colorsFromImage(storable.data)
  return {
    source: 'UPLOAD',
    sourceUrl: null,
    siteTitle: null,
    colors,
    logo: { url: null, data: storable.data, contentType: storable.contentType, isDark },
    fontHints: [],
    theme: buildThemeFromBrandColors(colors.map((color) => color.hex), mode),
    warnings: colors.length === 0 ? ['No se pudo deducir ningún color del archivo. Se usa la paleta neutra.'] : [],
  }
}

/**
 * Extrae la identidad visual de un perfil de Instagram.
 * Usa el proveedor de scouting para traer la foto de perfil: Instagram no deja
 * leer eso sin un proveedor, y no vamos a fingir que sí.
 */
export async function extractFromInstagram(
  handle: string,
  fetchProfileImage: (handle: string) => Promise<{ imageUrl: string | null; displayName: string | null }>,
  mode: 'LIGHT' | 'DARK' = 'LIGHT',
): Promise<BrandExtraction> {
  const clean = handle.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '')
  const profile = await fetchProfileImage(clean)
  if (!profile.imageUrl) {
    return {
      source: 'INSTAGRAM',
      sourceUrl: `https://www.instagram.com/${clean}`,
      siteTitle: profile.displayName,
      colors: [],
      logo: null,
      fontHints: [],
      theme: buildThemeFromBrandColors([], mode),
      warnings: [
        'No se pudo obtener la foto de perfil de Instagram. Conectá el proveedor de scouting o subí el logo a mano.',
      ],
      }
  }

  const image = await safeFetch(profile.imageUrl, { maxBytes: MAX_LOGO_BYTES, accept: 'image/*' })
  const storable = await toStorableImage(image.body, image.contentType.split(';')[0]?.trim() ?? 'image/jpeg')
  if (!storable) throw new UnsafeUrlError('No se pudo leer la foto de perfil.')
  const { colors, isDark } = await colorsFromImage(storable.data)
  return {
    source: 'INSTAGRAM',
    sourceUrl: `https://www.instagram.com/${clean}`,
    siteTitle: profile.displayName,
    colors,
    logo: {
      url: profile.imageUrl,
      data: storable.data,
      contentType: storable.contentType,
      isDark,
    },
    fontHints: [],
    theme: buildThemeFromBrandColors(colors.map((color) => color.hex), mode),
    warnings: ['La foto de perfil de Instagram suele estar recortada en círculo: revisá el logo antes de aprobarlo.'],
  }
}
