import { describe, expect, it } from 'vitest'
import {
  buildThemeFromBrandColors,
  contrastBetween,
  CONTRAST_MIN_TEXT,
  dominantColors,
  ensureContrast,
  enforceThemeContrast,
  isDark,
  normalizeHex,
  readableTextOn,
  relativeLuminance,
  parseHex,
} from '@/lib/domain/color'
import { resolveTheme, sanitizeFontName, googleFontsHref } from '@/lib/domain/theme'

describe('color', () => {
  it('lee hexadecimales cortos y largos', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseHex('3b5bdb')).toEqual({ r: 59, g: 91, b: 219 })
    expect(parseHex('no es un color')).toBeNull()
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
  })

  it('calcula el contraste según WCAG', () => {
    // Negro sobre blanco es el máximo posible.
    expect(contrastBetween('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastBetween('#ffffff', '#ffffff')).toBeCloseTo(1, 2)
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 3)
  })

  it('elige el texto que mejor se lee sobre un color', () => {
    expect(readableTextOn('#111827')).toBe('#ffffff')
    expect(readableTextOn('#fde047')).toBe('#111111')
  })

  it('ajusta un color hasta alcanzar el contraste mínimo', () => {
    // Amarillo sobre blanco es ilegible; tiene que oscurecerse.
    const fixed = ensureContrast('#fde047', '#ffffff', CONTRAST_MIN_TEXT)
    expect(contrastBetween(fixed, '#ffffff')).toBeGreaterThanOrEqual(CONTRAST_MIN_TEXT)
    expect(isDark(fixed)).toBe(true)
  })

  it('no toca un color que ya cumple', () => {
    expect(ensureContrast('#171a21', '#ffffff')).toBe('#171a21')
  })
})

describe('tema', () => {
  it('corrige un tema ilegible y explica qué corrigió', () => {
    const { theme, report } = enforceThemeContrast({
      primary: '#fde047',
      onPrimary: '#ffffff',
      accent: '#fde047',
      background: '#ffffff',
      surface: '#ffffff',
      // Gris clarísimo sobre blanco: no se lee.
      text: '#eeeeee',
      muted: '#f5f5f5',
      border: '#ffffff',
    })
    expect(report.issues.length).toBeGreaterThan(0)
    expect(contrastBetween(theme.text, theme.surface)).toBeGreaterThanOrEqual(CONTRAST_MIN_TEXT)
    // El texto del botón se recalcula: blanco sobre amarillo no se lee.
    expect(contrastBetween(theme.onPrimary, theme.primary)).toBeGreaterThanOrEqual(CONTRAST_MIN_TEXT)
  })

  it('un tema legible pasa sin cambios', () => {
    const input = {
      primary: '#3b5bdb',
      onPrimary: '#ffffff',
      accent: '#5c7cfa',
      background: '#f8f9fb',
      surface: '#ffffff',
      text: '#171a21',
      muted: '#5b6270',
      border: '#e2e6ee',
    }
    const { theme, report } = enforceThemeContrast(input)
    expect(report.issues).toHaveLength(0)
    expect(theme).toEqual(input)
  })

  it('construye una paleta a partir del color de marca, en claro y en oscuro', () => {
    const light = buildThemeFromBrandColors(['#e11d48'], 'LIGHT')
    expect(light.primary).toBe('#e11d48')
    expect(isDark(light.background)).toBe(false)

    const dark = buildThemeFromBrandColors(['#e11d48'], 'DARK')
    expect(isDark(dark.background)).toBe(true)
    expect(contrastBetween(dark.text, dark.background)).toBeGreaterThanOrEqual(CONTRAST_MIN_TEXT)
  })

  it('el modo seguro descarta la paleta de marca pero es legible', () => {
    const unreadable = {
      primary: '#fafafa',
      onPrimary: '#ffffff',
      accent: '#fafafa',
      background: '#ffffff',
      surface: '#fefefe',
      text: '#fdfdfd',
      muted: '#fdfdfd',
      border: '#ffffff',
    }
    const normal = resolveTheme({ colors: unreadable, mode: 'LIGHT' })
    const safe = resolveTheme({ colors: unreadable, mode: 'LIGHT', safeMode: true })

    expect(normal.report.issues.length).toBeGreaterThan(0)
    expect(safe.report.issues).toHaveLength(0)
    expect(contrastBetween(safe.colors.text, safe.colors.background)).toBeGreaterThanOrEqual(CONTRAST_MIN_TEXT)
  })

  it('emite todas las variables que consume la interfaz', () => {
    const theme = resolveTheme({ colors: buildThemeFromBrandColors(['#0f766e'], 'LIGHT'), mode: 'LIGHT', radius: 8 })
    for (const key of ['--jc-primary', '--jc-bg', '--jc-surface', '--jc-text', '--jc-border', '--jc-radius']) {
      expect(theme.variables[key]).toBeTruthy()
    }
    expect(theme.variables['--jc-radius']).toBe('8px')
  })

  it('rechaza nombres de tipografía peligrosos', () => {
    expect(sanitizeFontName('Poppins')).toBe('Poppins')
    expect(sanitizeFontName('IBM Plex Sans')).toBe('IBM Plex Sans')
    // Nada que pueda romper el CSS o la URL de Google Fonts.
    expect(sanitizeFontName('"; background: url(x)')).toBeNull()
    expect(sanitizeFontName('Font</style><script>')).toBeNull()
    expect(sanitizeFontName('')).toBeNull()
  })

  it('arma la URL de Google Fonts sólo con nombres válidos', () => {
    expect(googleFontsHref(['Poppins', 'Inter'])).toContain('family=Poppins')
    expect(googleFontsHref(['<script>'])).toBeNull()
    expect(googleFontsHref([])).toBeNull()
  })
})

describe('extracción de paleta', () => {
  it('encuentra el color dominante e ignora fondo y grises', () => {
    // Doce píxeles: nueve rojos de marca, y blanco, negro y gris de relleno.
    const pixels: number[] = []
    for (let index = 0; index < 9; index += 1) pixels.push(225, 29, 72, 255)
    pixels.push(255, 255, 255, 255)
    pixels.push(0, 0, 0, 255)
    pixels.push(128, 128, 128, 255)

    const colors = dominantColors(pixels, { channels: 4 })
    expect(colors.length).toBeGreaterThan(0)
    expect(colors[0]?.hex).toBe('#e11d48')
  })

  it('descarta los píxeles transparentes', () => {
    const pixels = [225, 29, 72, 0, 225, 29, 72, 0]
    expect(dominantColors(pixels, { channels: 4 })).toHaveLength(0)
  })
})
