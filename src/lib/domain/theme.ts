import {
  CONTRAST_MIN_TEXT,
  darken,
  enforceThemeContrast,
  ensureContrast,
  lighten,
  mix,
  NEUTRAL_DARK,
  NEUTRAL_LIGHT,
  readableTextOn,
  type ContrastReport,
  type ThemeColors,
} from './color'

/**
 * Traduce una paleta de marca a la rampa completa de variables CSS que consume
 * la interfaz. Tailwind toma sus tokens de estas variables, así que sobrescribir
 * `--jc-*` en un contenedor cambia el aspecto de todo lo que hay adentro.
 *
 * La rampa se DERIVA de la paleta en vez de fijarse a mano: así una marca oscura
 * y una clara producen jerarquías coherentes sin listas de excepciones.
 */

export type ThemeInput = {
  colors: ThemeColors
  mode: 'LIGHT' | 'DARK'
  radius?: number
  fontHeading?: string | null
  fontBody?: string | null
  safeMode?: boolean
}

export type ResolvedTheme = {
  variables: Record<string, string>
  colors: ThemeColors
  report: ContrastReport
  mode: 'LIGHT' | 'DARK'
  googleFonts: string[]
}

const SYSTEM_STACK =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/**
 * Sólo se aceptan nombres de tipografía simples: este texto termina dentro de
 * una declaración CSS y de una URL de Google Fonts.
 *
 * Se valida el valor ORIGINAL contra una lista blanca. Limpiar los caracteres
 * peligrosos y validar lo que queda sería un error: "<script>" se convertiría en
 * "script" y pasaría como nombre válido.
 */
export function sanitizeFontName(value: string | null | undefined): string | null {
  if (!value) return null
  const clean = value.trim()
  if (!clean || clean.length > 40) return null
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .+-]*$/u.test(clean)) return null
  return clean
}

export function fontStack(name: string | null | undefined): string {
  const clean = sanitizeFontName(name)
  return clean ? `'${clean}', ${SYSTEM_STACK}` : SYSTEM_STACK
}

export const NEUTRAL_THEME: ThemeInput = { colors: NEUTRAL_LIGHT, mode: 'LIGHT', radius: 12 }

/**
 * Construye la rampa. En claro se va oscureciendo desde el fondo hacia el texto;
 * en oscuro, al revés. Cada paso se mezcla con el color de marca para que el
 * gris del producto tenga el tinte del cliente sin volverse ilegible.
 */
/**
 * La barra lateral vive sobre fondo oscuro, así que necesita su propia escala:
 * los grises del área de trabajo ahí no se distinguen.
 *
 * Se deriva de la marca en lugar de fijarse, para que el espacio de cada
 * cliente tenga su barra y no la de JC. El color del ítem activo se aclara
 * hasta que se lee de verdad sobre ese fondo; si la marca es muy oscura, el
 * resultado es un tono claro de la misma familia, no un gris cualquiera.
 */
function navVariables(theme: ThemeColors): Record<string, string> {
  const fondo = mix('#0c0d10', theme.primary, 0.3)
  const fondo2 = lighten(fondo, 0.06)
  const activo = ensureContrast(theme.accent, fondo, CONTRAST_MIN_TEXT)
  return {
    '--jc-nav-bg': fondo,
    '--jc-nav-bg-2': fondo2,
    '--jc-nav-border': lighten(fondo, 0.1),
    '--jc-nav-text': mix('#ffffff', fondo, 0.38),
    '--jc-nav-text-strong': mix('#ffffff', fondo, 0.04),
    '--jc-nav-active-bg': lighten(fondo, 0.1),
    '--jc-nav-active-text': activo,
    '--jc-nav-accent': activo,
  }
}

export function resolveTheme(input: ThemeInput): ResolvedTheme {
  const safe = input.safeMode === true
  const base = safe ? (input.mode === 'DARK' ? NEUTRAL_DARK : NEUTRAL_LIGHT) : input.colors
  const { theme, report } = enforceThemeContrast(base)
  const dark = input.mode === 'DARK'

  const step = (amount: number): string =>
    dark ? lighten(theme.background, amount) : darken(theme.background, amount)

  const variables: Record<string, string> = {
    '--jc-primary': theme.primary,
    '--jc-primary-strong': dark ? lighten(theme.primary, 0.14) : darken(theme.primary, 0.14),
    '--jc-primary-soft': mix(theme.surface, theme.primary, dark ? 0.18 : 0.08),
    '--jc-primary-soft-2': mix(theme.surface, theme.primary, dark ? 0.28 : 0.16),
    '--jc-on-primary': theme.onPrimary,
    '--jc-accent': theme.accent,

    '--jc-bg': theme.background,
    '--jc-bg-2': step(0.04),
    '--jc-surface': theme.surface,
    '--jc-surface-2': dark ? lighten(theme.surface, 0.05) : darken(theme.surface, 0.02),

    '--jc-border': theme.border,
    '--jc-border-strong': dark ? lighten(theme.border, 0.12) : darken(theme.border, 0.1),

    '--jc-muted-2': mix(theme.muted, theme.background, 0.35),
    '--jc-muted': theme.muted,
    '--jc-text-2': mix(theme.text, theme.muted, 0.4),
    '--jc-text': theme.text,
    '--jc-text-strong': dark ? lighten(theme.text, 0.1) : darken(theme.text, 0.25),

    ...navVariables(theme),

    '--jc-radius': `${Math.max(0, Math.min(24, input.radius ?? 12))}px`,
    '--jc-font-body': fontStack(safe ? null : input.fontBody),
    '--jc-font-heading': fontStack(safe ? null : (input.fontHeading ?? input.fontBody)),
    /*
     * La tipografía de los títulos grandes también es del cliente. Sin esto el
     * portal salía con los colores de la marca y los títulos en Anton, que es
     * de JC: un espacio "del cliente" con la tipografía de la agencia.
     */
    '--jc-font-display': safe
      ? SYSTEM_STACK
      : sanitizeFontName(input.fontHeading)
        ? fontStack(input.fontHeading)
        : 'var(--jc-font-anton), Impact, sans-serif',
  }

  const googleFonts = safe
    ? []
    : [sanitizeFontName(input.fontHeading), sanitizeFontName(input.fontBody)].filter(
        (name): name is string => name !== null,
      )

  return { variables, colors: theme, report, mode: input.mode, googleFonts: [...new Set(googleFonts)] }
}

/** URL de Google Fonts para las tipografías elegidas. Null si no hay ninguna. */
export function googleFontsHref(families: string[]): string | null {
  const clean = families.map(sanitizeFontName).filter((name): name is string => name !== null)
  if (clean.length === 0) return null
  const params = clean.map((name) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;500;600;700`)
  return `https://fonts.googleapis.com/css2?${params.join('&')}&display=swap`
}

/** Color de acompañamiento para el logo: si el logo es oscuro necesita fondo claro. */
export const logoBackdrop = (theme: ResolvedTheme, logoIsDark: boolean): string =>
  logoIsDark ? readableTextOn(theme.colors.text) : 'transparent'
