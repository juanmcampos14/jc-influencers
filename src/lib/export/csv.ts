/**
 * Generación de CSV.
 *
 * Protección contra inyección de fórmulas: una celda que empieza con `=`, `+`,
 * `-`, `@`, tab o retorno de carro se prefija con comilla simple para que Excel
 * o Sheets no la ejecute al abrir el archivo.
 */
const DANGEROUS_PREFIX = new RegExp('^[=+\\-@\\t\\r]')

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (DANGEROUS_PREFIX.test(text)) text = `'${text}`
  if (/[",\n\r;]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
  return text
}

export type CsvColumn<T> = { header: string; value: (row: T) => unknown }

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines: string[] = [columns.map((c) => escapeCsvCell(c.header)).join(',')]
  for (const row of rows) lines.push(columns.map((c) => escapeCsvCell(c.value(row))).join(','))
  // BOM para que Excel abra los acentos bien.
  return `﻿${lines.join('\r\n')}\r\n`
}
