import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

const CURRENCY_LABELS: Record<string, string> = {
  USD: 'US$',
  ARS: '$',
  EUR: '€',
  BRL: 'R$',
  COP: 'COL$',
  MXN: 'MX$',
  CLP: 'CLP$',
}

/** Importes con moneda y formato regional argentino. */
export function formatMoney(amount: number | null | undefined, currency = 'USD', locale = 'es-AR'): string {
  if (amount === null || amount === undefined) return '—'
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${CURRENCY_LABELS[currency] ?? currency} ${new Intl.NumberFormat(locale).format(amount)}`
  }
}

/**
 * Un importe chico, sin redondearlo a cero.
 *
 * `formatMoney` no lleva decimales porque los presupuestos de campaña son de
 * miles y los centavos sólo ensucian. Pero el scouting cuesta fracciones de
 * centavo por perfil, y ahí ese redondeo escribía "US$ 0": exactamente la
 * mentira que el producto no puede decir --que buscar es gratis--.
 *
 * Por debajo de un centavo se pasa a "cada 1.000", que es como se lee un precio
 * así sin llenar la pantalla de ceros.
 */
export function formatMoneyFino(
  amount: number | null | undefined,
  currency = 'USD',
  locale = 'es-AR',
): string {
  if (amount === null || amount === undefined) return '—'
  if (amount === 0) return formatMoney(0, currency, locale)

  const simbolo = (valor: number, decimales: number): string => {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      }).format(valor)
    } catch {
      return `${CURRENCY_LABELS[currency] ?? currency} ${valor.toFixed(decimales)}`
    }
  }

  if (amount < 0.01) return `${simbolo(amount * 1000, 2)} cada mil`
  if (amount < 1) return simbolo(amount, 2)
  return formatMoney(amount, currency, locale)
}

export function formatNumber(value: number | null | undefined, locale = 'es-AR'): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat(locale).format(value)
}

/** Seguidores compactos: 31.600 → 31,6 k */
export function formatFollowers(value: number | null | undefined, locale = 'es-AR'): string {
  if (value === null || value === undefined) return '—'
  if (value < 1000) return new Intl.NumberFormat(locale).format(value)
  if (value < 1_000_000) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1000)} k`
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1_000_000)} M`
}

export function formatPercent(value: number | null | undefined, locale = 'es-AR'): string {
  if (value === null || value === undefined) return '—'
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}%`
}

export function formatDate(
  value: string | Date | null | undefined,
  timeZone = 'America/Argentina/Buenos_Aires',
  locale = 'es-AR',
): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(date)
}

export function formatDateTime(
  value: string | Date | null | undefined,
  timeZone = 'America/Argentina/Buenos_Aires',
  locale = 'es-AR',
): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date)
}

export function relativeDays(value: string | Date | null | undefined, now = new Date()): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  const days = Math.round((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  const months = Math.round(days / 30)
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`
}
