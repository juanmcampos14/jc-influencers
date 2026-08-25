/**
 * Color y contraste.
 *
 * La personalización por marca no puede dejar un panel ilegible. Todo color que
 * entra al tema pasa por acá: se calcula el contraste real según WCAG 2.1 y, si
 * no llega al mínimo, se corrige o se avisa. Funciones puras, sin dependencias.
 */

export type Rgb = { r: number; g: number; b: number }

const HEX_SHORT = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i
const HEX_LONG = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i

export function parseHex(value: string): Rgb | null {
  const raw = value.trim()
  const short = raw.match(HEX_SHORT)
  if (short) {
    return {
      r: parseInt(`${short[1]}${short[1]}`, 16),
      g: parseInt(`${short[2]}${short[2]}`, 16),
      b: parseInt(`${short[3]}${short[3]}`, 16),
    }
  }
  const long = raw.match(HEX_LONG)
  if (long) {
    return { r: parseInt(long[1] as string, 16), g: parseInt(long[2] as string, 16), b: parseInt(long[3] as string, 16) }
  }
  return null
}

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)))

export function toHex({ r, g, b }: Rgb): string {
  const part = (value: number) => clampByte(value).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

/** Devuelve el color normalizado a `#rrggbb`, o null si no es un color válido. */
export function normalizeHex(value: string): string | null {
  const rgb = parseHex(value)
  return rgb ? toHex(rgb) : null
}

/** Luminancia relativa según WCAG 2.1. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Relación de contraste entre dos colores. Va de 1 (idénticos) a 21 (negro sobre blanco). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

export function contrastBetween(aHex: string, bHex: string): number {
  const a = parseHex(aHex)
  const b = parseHex(bHex)
  if (!a || !b) return 1
  return contrastRatio(a, b)
}

/** Mínimos de WCAG 2.1 nivel AA. */
export const CONTRAST_MIN_TEXT = 4.5
export const CONTRAST_MIN_LARGE_TEXT = 3
export const CONTRAST_MIN_UI = 3

export const isDark = (hex: string): boolean => {
  const rgb = parseHex(hex)
  return rgb ? relativeLuminance(rgb) < 0.4 : false
}

/**
 * Blanco o negro sobre el color dado.
 *
 * Prefiere blanco cuando alcanza el mínimo: es lo convencional sobre un color de
 * marca saturado. Sólo cae a oscuro si el blanco no se lee, y si ninguno de los
 * dos llega, devuelve el que más contraste dé.
 */
export function readableTextOn(hex: string): string {
  const rgb = parseHex(hex)
  if (!rgb) return '#ffffff'
  const onWhite = contrastRatio(rgb, { r: 255, g: 255, b: 255 })
  const onBlack = contrastRatio(rgb, { r: 17, g: 17, b: 17 })
  if (onWhite >= CONTRAST_MIN_TEXT) return '#ffffff'
  if (onBlack >= CONTRAST_MIN_TEXT) return '#111111'
  return onWhite >= onBlack ? '#ffffff' : '#111111'
}

export function mix(aHex: string, bHex: string, weight: number): string {
  const a = parseHex(aHex)
  const b = parseHex(bHex)
  if (!a || !b) return aHex
  const w = Math.max(0, Math.min(1, weight))
  return toHex({ r: a.r + (b.r - a.r) * w, g: a.g + (b.g - a.g) * w, b: a.b + (b.b - a.b) * w })
}

export const lighten = (hex: string, amount: number): string => mix(hex, '#ffffff', amount)
export const darken = (hex: string, amount: number): string => mix(hex, '#000000', amount)

/**
 * Ajusta `color` hasta alcanzar el contraste mínimo contra `background`.
 *
 * Devuelve además CUÁNTO hubo que moverlo (0 a 1). Ese número importa: si para
 * que se lea hay que llevarlo casi hasta el negro o el blanco, el color ya no es
 * el de la marca, y eso hay que decirlo en vez de disimularlo.
 */
export function adjustForContrast(
  color: string,
  background: string,
  minimum = CONTRAST_MIN_TEXT,
): { color: string; amount: number } {
  if (contrastBetween(color, background) >= minimum) return { color, amount: 0 }
  const backgroundIsDark = isDark(background)
  for (let step = 1; step <= 20; step += 1) {
    const amount = step / 20
    const candidate = backgroundIsDark ? lighten(color, amount) : darken(color, amount)
    if (contrastBetween(candidate, background) >= minimum) return { color: candidate, amount }
  }
  return { color: backgroundIsDark ? '#ffffff' : '#000000', amount: 1 }
}

export function ensureContrast(color: string, background: string, minimum = CONTRAST_MIN_TEXT): string {
  return adjustForContrast(color, background, minimum).color
}

/**
 * A partir de acá, el ajuste dejó de respetar la marca: el color resultante ya
 * no se parece al elegido.
 *
 * 0,45 es el punto donde un color de marca sigue siendo reconocible después del
 * ajuste. Un amarillo de marca como texto sobre blanco necesita moverse más que
 * eso, y ahí lo correcto es decir que esa paleta no sirve para texto, no
 * entregar un marrón y llamarlo "el amarillo de la marca".
 */
export const MAX_ACCEPTABLE_ADJUSTMENT = 0.45

// ── Extracción de paleta ─────────────────────────────────────────────────────

export type ColorCount = { hex: string; count: number }

/**
 * Agrupa píxeles en cubos de color y devuelve los dominantes.
 * Descarta lo casi transparente, lo casi blanco y lo casi negro: en un logo eso
 * suele ser el fondo, no la marca.
 */
export function dominantColors(
  pixels: Uint8Array | Uint8ClampedArray | number[],
  options: { channels?: number; max?: number; bucketSize?: number } = {},
): ColorCount[] {
  const channels = options.channels ?? 4
  const max = options.max ?? 6
  const bucket = options.bucketSize ?? 24
  const counts = new Map<string, { count: number; r: number; g: number; b: number }>()

  for (let index = 0; index + channels - 1 < pixels.length; index += channels) {
    const r = Number(pixels[index])
    const g = Number(pixels[index + 1])
    const b = Number(pixels[index + 2])
    const alpha = channels >= 4 ? Number(pixels[index + 3]) : 255
    if (alpha < 128) continue

    const luminance = relativeLuminance({ r, g, b })
    if (luminance > 0.93 || luminance < 0.02) continue
    const maxChannel = Math.max(r, g, b)
    const minChannel = Math.min(r, g, b)
    const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel
    // Los grises no dicen nada de la marca.
    if (saturation < 0.12 && luminance > 0.1 && luminance < 0.8) continue

    const key = `${Math.round(r / bucket)}-${Math.round(g / bucket)}-${Math.round(b / bucket)}`
    const entry = counts.get(key)
    if (entry) {
      entry.count += 1
      entry.r += r
      entry.g += g
      entry.b += b
    } else {
      counts.set(key, { count: 1, r, g, b })
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
    .map((entry) => ({
      hex: toHex({ r: entry.r / entry.count, g: entry.g / entry.count, b: entry.b / entry.count }),
      count: entry.count,
    }))
}

// ── Tema ─────────────────────────────────────────────────────────────────────

export type ThemeColors = {
  primary: string
  onPrimary: string
  accent: string
  background: string
  surface: string
  text: string
  muted: string
  border: string
}

export type ContrastIssue = {
  pair: string
  ratio: number
  minimum: number
  /** true si se pudo corregir SIN desvirtuar el color de la marca. */
  fixed: boolean
  /** Cuánto hubo que mover el color, de 0 a 1. */
  adjustment: number
}
export type ContrastReport = { issues: ContrastIssue[]; safeModeRecommended: boolean }

export const NEUTRAL_LIGHT: ThemeColors = {
  primary: '#3b5bdb',
  onPrimary: '#ffffff',
  accent: '#5c7cfa',
  background: '#f8f9fb',
  surface: '#ffffff',
  text: '#171a21',
  muted: '#5b6270',
  border: '#e2e6ee',
}

export const NEUTRAL_DARK: ThemeColors = {
  primary: '#7c93f5',
  onPrimary: '#0d1017',
  accent: '#93a6f7',
  background: '#12151c',
  surface: '#191d26',
  text: '#eef0f5',
  muted: '#9aa2b1',
  border: '#2a3040',
}

/**
 * Corrige un tema para que todo par que se muestra junto llegue al mínimo de
 * contraste. Devuelve el tema corregido y el detalle de lo que hubo que tocar.
 */
export function enforceThemeContrast(input: ThemeColors): { theme: ThemeColors; report: ContrastReport } {
  const issues: ContrastIssue[] = []
  const theme = { ...input }

  const check = (
    label: string,
    foregroundKey: keyof ThemeColors,
    backgroundValue: string,
    minimum: number,
  ): void => {
    const before = contrastBetween(theme[foregroundKey], backgroundValue)
    if (before >= minimum) return
    const { color: corrected, amount } = adjustForContrast(theme[foregroundKey], backgroundValue, minimum)
    const after = contrastBetween(corrected, backgroundValue)
    theme[foregroundKey] = corrected
    issues.push({
      pair: label,
      ratio: Number(before.toFixed(2)),
      minimum,
      fixed: after >= minimum && amount <= MAX_ACCEPTABLE_ADJUSTMENT,
      adjustment: Number(amount.toFixed(2)),
    })
  }

  check('texto sobre fondo', 'text', theme.background, CONTRAST_MIN_TEXT)
  check('texto sobre superficie', 'text', theme.surface, CONTRAST_MIN_TEXT)
  check('texto secundario sobre superficie', 'muted', theme.surface, CONTRAST_MIN_LARGE_TEXT)
  check('color de marca sobre superficie', 'primary', theme.surface, CONTRAST_MIN_UI)
  // Un borde de tarjeta es decorativo, no un control: no le corresponde el 3:1 de
  // WCAG. El piso acá sólo caza el caso de un borde que se confunde con el fondo.
  check('borde sobre superficie', 'border', theme.surface, 1.12)

  // El texto del botón principal se deriva del color de marca, no se adivina.
  const onPrimaryRatio = contrastBetween(theme.onPrimary, theme.primary)
  if (onPrimaryRatio < CONTRAST_MIN_TEXT) {
    const derived = readableTextOn(theme.primary)
    issues.push({
      pair: 'texto sobre el color de marca',
      ratio: Number(onPrimaryRatio.toFixed(2)),
      minimum: CONTRAST_MIN_TEXT,
      // Este se deriva del color de marca, no se fuerza: siempre queda bien.
      fixed: contrastBetween(derived, theme.primary) >= CONTRAST_MIN_TEXT,
      adjustment: 0,
    })
    theme.onPrimary = derived
  }

  return { theme, report: { issues, safeModeRecommended: issues.some((issue) => !issue.fixed) } }
}

/**
 * Construye un tema completo a partir de los colores dominantes de una marca.
 * `mode` decide si el espacio del cliente se ve claro u oscuro.
 */
export function buildThemeFromBrandColors(colors: string[], mode: 'LIGHT' | 'DARK'): ThemeColors {
  const base = mode === 'DARK' ? NEUTRAL_DARK : NEUTRAL_LIGHT
  const valid = colors.map(normalizeHex).filter((value): value is string => value !== null)
  const primary = valid[0] ?? base.primary
  const accent = valid[1] ?? mix(primary, base.accent, 0.4)

  if (mode === 'DARK') {
    return {
      primary,
      onPrimary: readableTextOn(primary),
      accent,
      background: darken(primary, 0.86),
      surface: darken(primary, 0.78),
      text: '#eef0f5',
      muted: mix('#9aa2b1', primary, 0.15),
      border: darken(primary, 0.62),
    }
  }

  return {
    primary,
    onPrimary: readableTextOn(primary),
    accent,
    // Tintes muy suaves del color de marca: se percibe la marca sin perder legibilidad.
    background: mix('#f8f9fb', primary, 0.04),
    surface: '#ffffff',
    text: mix('#171a21', primary, 0.08),
    muted: mix('#5b6270', primary, 0.1),
    border: mix('#e2e6ee', primary, 0.14),
  }
}
