import ExcelJS from 'exceljs'
import {
  cleanText,
  isPlaceholder,
  nameSimilarity,
  looksLikeMultiplePeople,
  looksLikeSectionHeading,
  normalizeHandle,
  parseClientApproval,
  parseEngagementRate,
  parseFollowers,
  parseProfileUrl,
  parseStars,
  parseTierLabel,
  splitMetricLines,
  type ClientApprovalValue,
} from '@/lib/domain/normalize'

/**
 * Lectura del Excel de scouting.
 *
 * No hay influencers escritos a mano acá: todo sale del archivo. Cada fila que
 * no se puede interpretar se reporta con su hoja y su número de fila, en vez de
 * descartarse en silencio o completarse con un valor inventado.
 */

export type RowIssue = {
  sheetName: string
  rowNumber: number
  outcome: 'SECTION' | 'MULTI_PERSON' | 'INCOMPLETE' | 'UNPARSEABLE' | 'CONFLICT'
  message: string
  rawValues: Record<string, unknown>
}

export type ParsedProfile = {
  url: string
  followersRaw: string | null
  followers: number | null
  followersUnparsed: boolean
  engagementRate: number | null
  engagementRaw: string | null
}

export type ParsedPerson = {
  sheetName: string
  rowNumber: number
  /** Clave estable para que reimportar no duplique. */
  importKey: string
  displayName: string
  handle: string | null
  country: string | null
  city: string | null
  niches: string[]
  tierLabel: string | null
  bio: string | null
  profiles: ParsedProfile[]
  /** A qué campaña va esta fila. Se resuelve contra los bloques del Excel. */
  campaignKey: string
  clusterKey: string | null
  clusterLabel: string | null
  statusKey: string
  clientApproval: ClientApprovalValue
  clientFeedback: string | null
  agencyRationale: string | null
  contentIdea: string | null
  deliverablesSummary: string | null
  fitScore: number | null
  budgetRaw: string | null
  rank: number | null
  sourceUrl: string | null
  rawValues: Record<string, unknown>
}

export type ParsedBrief = {
  /** Distribución alternativa propuesta en otra hoja. No reemplaza a la del brief. */
  alternativeClusters: Array<{ label: string; targetPercent: number; source: string }>
  country: string | null
  language: string | null
  followersMin: number | null
  followersMax: number | null
  engagementRateMin: number | null
  audienceAgeMin: number | null
  audienceAgeMax: number | null
  audienceGeoPredominance: string | null
  audienceGeoMinPercent: number | null
  platforms: string[]
  idealProfile: string | null
  contentIdeas: string | null
  realProductUses: string | null
  inclusionCriteria: string | null
  exclusionCriteria: string | null
  internalNotes: string | null
  niches: Array<{ label: string; mode: 'PRIORITY' | 'EXCLUDED'; priority: number; idealProfile: string | null }>
  keywords: Array<{ category: string; term: string }>
  clusters: Array<{ key: string; label: string; emoji: string | null; targetPercent: number }>
}

export type ParsedBudget = { cacheRaw: string | null; barterRaw: string | null; currency: string | null; amount: number | null }

export type ParsedWorkbook = {
  people: ParsedPerson[]
  brief: ParsedBrief
  budget: ParsedBudget
  shortlist: Array<{ handle: string; order: number; note: string | null }>
  campaigns: Array<{ key: string; name: string; description: string }>
  issues: RowIssue[]
  decisions: string[]
  sheetsSeen: Array<{ name: string; rows: number; handled: boolean; note: string }>
}

const MAIN_CAMPAIGN_KEY = 'scouting-actual'

// ── Utilidades de celda ──────────────────────────────────────────────────────

function cellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return ''
  const value = cell.value
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('')
    }
    if ('result' in value) return String(value.result ?? '')
    if ('hyperlink' in value && typeof value.hyperlink === 'string') return value.hyperlink
    if (value instanceof Date) return value.toISOString()
  }
  return String(value)
}

/** Texto de la celda conservando saltos de línea (hay celdas multi-métrica). */
function cellRaw(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return ''
  const value = cell.value
  if (value && typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join('')
  }
  return cellText(cell)
}

/**
 * ExcelJS devuelve el valor del maestro en TODAS las celdas de un rango
 * combinado. Sin esto, una celda A30:A32 se leería como tres filas iguales.
 */
function isMergedContinuation(cell: ExcelJS.Cell): boolean {
  if (!cell.isMerged) return false
  const master = cell.master
  return Boolean(master) && master.address !== cell.address
}

/** URL destino de una celda con hipervínculo (el texto visible suele decir sólo "Instagram"). */
function cellHyperlink(cell: ExcelJS.Cell | undefined): string | null {
  if (!cell) return null
  const value = cell.value
  if (value && typeof value === 'object' && 'hyperlink' in value && typeof value.hyperlink === 'string') {
    return value.hyperlink
  }
  return null
}

function rowValues(row: ExcelJS.Row, maxCol: number): string[] {
  const out: string[] = []
  for (let col = 1; col <= maxCol; col += 1) {
    const cell = row.getCell(col)
    out.push(isMergedContinuation(cell) ? '' : cellRaw(cell))
  }
  return out
}

function isRowEmpty(values: string[]): boolean {
  return values.every((value) => cleanText(value) === '')
}

function findHeaderRow(sheet: ExcelJS.Worksheet, needles: string[]): number | null {
  const limit = Math.min(sheet.rowCount, 30)
  for (let r = 1; r <= limit; r += 1) {
    const values = rowValues(sheet.getRow(r), Math.min(sheet.columnCount, 30)).map((v) => cleanText(v).toUpperCase())
    if (needles.every((needle) => values.some((value) => value.includes(needle)))) return r
  }
  return null
}

/**
 * Busca una columna por su encabezado. Prioriza coincidencia exacta para que
 * un encabezado corto como "ER" no matchee dentro de "PERFIL INSTAGRAM".
 */
function headerIndex(headers: string[], ...needles: string[]): number {
  for (const needle of needles) {
    const exact = headers.findIndex((header) => header === needle)
    if (exact >= 0) return exact
  }
  for (const needle of needles) {
    const starts = headers.findIndex((header) => header.startsWith(needle))
    if (starts >= 0) return starts
  }
  for (const needle of needles) {
    // El "contiene" sólo se usa con needles largos, donde no hay ambigüedad.
    if (needle.length < 4) continue
    const index = headers.findIndex((header) => header.includes(needle))
    if (index >= 0) return index
  }
  return -1
}

function collectUrls(text: string): string[] {
  return text
    .split(/[\n\r]+/)
    .map((line) => cleanText(line))
    .filter((line) => line.length > 0 && !isPlaceholder(line))
    .filter((line) => /\./.test(line))
}

function buildProfiles(urlText: string, followersText: string, erText: string): { profiles: ParsedProfile[]; problems: string[] } {
  const urls = collectUrls(urlText)
  const followerLines = splitMetricLines(followersText)
  const erLines = splitMetricLines(erText)
  const problems: string[] = []
  const profiles: ParsedProfile[] = []

  for (const [index, url] of urls.entries()) {
    const parsedUrl = parseProfileUrl(url)
    if (parsedUrl.kind !== 'value') {
      problems.push(`URL "${url}": ${parsedUrl.reason}`)
      continue
    }
    const platform = parsedUrl.value.platform

    const followerLine =
      followerLines.find((line) => line.platform === platform) ??
      (followerLines.length === urls.length ? followerLines[index] : followerLines[0])
    const erLine =
      erLines.find((line) => line.platform === platform) ??
      (erLines.length === urls.length ? erLines[index] : erLines[0])

    const followers = followerLine ? parseFollowers(followerLine.text) : { kind: 'absent' as const, raw: '', reason: '' }
    const engagement = erLine ? parseEngagementRate(erLine.text) : { kind: 'absent' as const, raw: '', reason: '' }

    if (followers.kind === 'unparseable') problems.push(`Seguidores "${followers.raw}": ${followers.reason}`)
    if (engagement.kind === 'unparseable') problems.push(`ER "${engagement.raw}": ${engagement.reason}`)

    profiles.push({
      url: parsedUrl.value.url,
      followersRaw: followerLine?.text ?? null,
      followers: followers.kind === 'value' ? followers.value : null,
      followersUnparsed: followers.kind === 'unparseable',
      engagementRate: engagement.kind === 'value' ? engagement.value.rate : null,
      engagementRaw: erLine?.text ?? null,
    })
  }

  return { profiles, problems }
}

/** Dos URLs apuntan al mismo perfil si normalizan igual (http/https, tracking, barra final). */
function sameProfile(a: string, b: string): boolean {
  const pa = parseProfileUrl(a)
  const pb = parseProfileUrl(b)
  if (pa.kind !== 'value' || pb.kind !== 'value') return a === b
  return pa.value.platform === pb.value.platform && pa.value.urlNormalized === pb.value.urlNormalized
}

function handleOf(profiles: ParsedProfile[]): string | null {
  const first = profiles[0]
  if (!first) return null
  const parsed = parseProfileUrl(first.url)
  return parsed.kind === 'value' ? parsed.value.handle : null
}

function importKeyFor(profiles: ParsedProfile[], displayName: string): string {
  const first = profiles[0]
  if (first) {
    const parsed = parseProfileUrl(first.url)
    if (parsed.kind === 'value') return `url:${parsed.value.urlNormalized}`
  }
  return `name:${cleanText(displayName).toLowerCase()}`
}

// ── Hojas de scouting con encabezado CREADOR ─────────────────────────────────

function parseCreatorSheet(sheet: ExcelJS.Worksheet, campaignKey: string, out: ParsedWorkbook): void {
  const headerRow = findHeaderRow(sheet, ['CREADOR'])
  if (headerRow === null) {
    out.sheetsSeen.push({ name: sheet.name, rows: sheet.rowCount, handled: false, note: 'no se encontró el encabezado CREADOR' })
    return
  }
  const maxCol = Math.min(sheet.columnCount, 30)
  const headers = rowValues(sheet.getRow(headerRow), maxCol).map((h) => cleanText(h).toUpperCase())

  const iName = headerIndex(headers, 'CREADOR')
  const iUrl = headerIndex(headers, 'PERFIL')
  const iSegment = headerIndex(headers, 'SEGMENTO')
  const iFollowers = headerIndex(headers, 'FOLLOWERS', 'SEGUIDORES')
  const iEr = headerIndex(headers, 'ER')
  const iDeliverable = headerIndex(headers, 'ENTREGABLE')
  const iBudget = headerIndex(headers, 'PRESUPUESTO')
  const iApproval = headerIndex(headers, 'APROBACION', 'APROBACIÓN')
  const iFeedback = headerIndex(headers, 'FEEDBACK')
  const iRank = headers.findIndex((h) => h === '#')

  let handled = 0
  for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
    const values = rowValues(sheet.getRow(r), maxCol)
    if (isRowEmpty(values)) continue

    const name = cleanText(values[iName] ?? '')

    // Bloque de presupuesto al pie de la hoja.
    const label = cleanText(values[1] ?? values[0] ?? '').toUpperCase()
    if (label.startsWith('CACHE') || label.startsWith('CACHÉ')) {
      out.budget.cacheRaw = cleanText(values[2] ?? '')
      out.decisions.push(`"${sheet.name}" fila ${r}: caché de campaña = "${out.budget.cacheRaw}".`)
      continue
    }
    if (label.startsWith('CANJE')) {
      out.budget.barterRaw = cleanText(values[2] ?? '')
      continue
    }
    if (label.startsWith('PRESUPUESTO ESTIMADO')) continue

    if (!name) continue
    if (looksLikeSectionHeading(name)) {
      out.issues.push({ sheetName: sheet.name, rowNumber: r, outcome: 'SECTION', message: `Título de bloque: "${name}"`, rawValues: { name } })
      continue
    }
    if (looksLikeMultiplePeople(name)) {
      out.issues.push({
        sheetName: sheet.name,
        rowNumber: r,
        outcome: 'MULTI_PERSON',
        message: `La fila describe a más de una persona ("${name}"). Hay que separarla a mano.`,
        rawValues: { name },
      })
      continue
    }

    const urlText = iUrl >= 0 ? (values[iUrl] ?? '') : ''
    const { profiles, problems } = buildProfiles(
      urlText,
      iFollowers >= 0 ? (values[iFollowers] ?? '') : '',
      iEr >= 0 ? (values[iEr] ?? '') : '',
    )

    if (profiles.length === 0) {
      out.issues.push({
        sheetName: sheet.name,
        rowNumber: r,
        outcome: 'INCOMPLETE',
        message: `"${name}" no tiene una URL de perfil utilizable. Se importa igual, sin perfil social.`,
        rawValues: { name, url: urlText },
      })
    }
    for (const problem of problems) {
      out.issues.push({ sheetName: sheet.name, rowNumber: r, outcome: 'UNPARSEABLE', message: `${name}: ${problem}`, rawValues: { name } })
    }

    const approval = parseClientApproval(iApproval >= 0 ? values[iApproval] : '')
    const rankRaw = iRank >= 0 ? cleanText(values[iRank] ?? '') : ''
    const rank = rankRaw ? Math.round(Number(rankRaw.replace(',', '.'))) : null

    out.people.push({
      sheetName: sheet.name,
      rowNumber: r,
      importKey: importKeyFor(profiles, name),
      displayName: name,
      handle: handleOf(profiles),
      country: null,
      city: null,
      niches: iSegment >= 0 ? splitNiches(values[iSegment] ?? '') : [],
      tierLabel: null,
      bio: null,
      profiles,
      campaignKey,
      clusterKey: null,
      clusterLabel: null,
      statusKey: statusFromApproval(approval),
      clientApproval: approval,
      clientFeedback: iFeedback >= 0 ? nullIfEmpty(values[iFeedback]) : null,
      agencyRationale: null,
      contentIdea: null,
      deliverablesSummary: iDeliverable >= 0 ? nullIfEmpty(values[iDeliverable]) : null,
      fitScore: null,
      budgetRaw: iBudget >= 0 ? nullIfEmpty(values[iBudget]) : null,
      rank: Number.isFinite(rank) ? rank : null,
      sourceUrl: null,
      rawValues: Object.fromEntries(headers.map((h, i) => [h || `col${i}`, values[i] ?? ''])),
    })
    handled += 1
  }
  out.sheetsSeen.push({ name: sheet.name, rows: sheet.rowCount, handled: true, note: `${handled} perfiles` })
}

function statusFromApproval(approval: ClientApprovalValue): string {
  switch (approval) {
    case 'APPROVED':
      return 'APROBADO'
    case 'REJECTED':
      return 'RECHAZADO'
    case 'NEEDS_REVIEW':
      return 'A_REVISAR'
    case 'REPLACEMENT_REQUESTED':
      return 'SOLICITAR_REEMPLAZO'
    default:
      return 'PROPUESTO'
  }
}

function nullIfEmpty(value: string | undefined): string | null {
  const clean = cleanText(value ?? '')
  return clean && !isPlaceholder(clean) ? clean : null
}

function splitNiches(value: string): string[] {
  return cleanText(value)
    .split(/[,/·|]+/)
    .map((part) => cleanText(part))
    .filter((part) => part.length > 1 && !isPlaceholder(part))
}

// ── Hoja "Scouting Mili 2" (el modelo más completo) ──────────────────────────

function parseClusterSheet(sheet: ExcelJS.Worksheet, out: ParsedWorkbook): void {
  const headerRow = findHeaderRow(sheet, ['CLUSTER', 'NOMBRE'])
  if (headerRow === null) {
    out.sheetsSeen.push({ name: sheet.name, rows: sheet.rowCount, handled: false, note: 'sin encabezado CLUSTER/NOMBRE' })
    return
  }
  const maxCol = Math.min(sheet.columnCount, 30)
  const headers = rowValues(sheet.getRow(headerRow), maxCol).map((h) => cleanText(h).toUpperCase())

  const iCluster = headerIndex(headers, 'CLUSTER')
  const iRank = headers.findIndex((h) => h === '#')
  const iName = headerIndex(headers, 'NOMBRE')
  const iHandle = headerIndex(headers, 'INSTAGRAM')
  const iFollowers = headerIndex(headers, 'SEGUIDORES')
  const iEr = headerIndex(headers, 'ER')
  const iFit = headerIndex(headers, 'FIT')
  const iStatus = headerIndex(headers, 'ESTADO')
  const iIdea = headerIndex(headers, 'IDEA')
  const iRationale = headerIndex(headers, 'JUSTIFICACI')
  const iBudget = headerIndex(headers, 'PRESUPUESTO')
  const iApproval = headerIndex(headers, 'APROBACI')
  const iFeedback = headerIndex(headers, 'FEEDBACK')

  let shortlistMode = false
  let handled = 0

  for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
    const values = rowValues(sheet.getRow(r), maxCol)
    if (isRowEmpty(values)) continue

    const joined = cleanText(values.join(' '))
    if (/SHORTLIST/i.test(joined) && /TOP/i.test(joined)) {
      shortlistMode = true
      out.decisions.push(`"${sheet.name}" fila ${r}: comienza el bloque de shortlist recomendada.`)
      continue
    }
    if (/CHECKLIST VETTING/i.test(joined)) {
      out.brief.internalNotes = [out.brief.internalNotes, cleanText(joined)].filter(Boolean).join('\n\n')
      continue
    }

    const clusterCell = cleanText(values[iCluster] ?? '')
    const nameCell = cleanText(values[iName] ?? '')
    const handleCell = cleanText(values[iHandle] ?? '')

    // Cabecera de cluster: "🪙 CRYPTO / WEB3 — 35% del squad · ..."
    if (!nameCell && !handleCell && clusterCell === '' && /%/.test(joined) && /squad/i.test(joined)) {
      registerClusterFromHeading(joined, out)
      continue
    }
    if (!nameCell && !handleCell) continue

    if (shortlistMode) {
      const handle = normalizeHandle(handleCell || nameCell)
      if (handle) {
        const orderRaw = cleanText(values[iRank] ?? '').replace('#', '')
        const order = Number(orderRaw)
        out.shortlist.push({
          handle,
          order: Number.isFinite(order) && order > 0 ? order : out.shortlist.length + 1,
          note: nullIfEmpty(values[iFeedback] ?? values[iRationale] ?? ''),
        })
      }
      continue
    }

    if (looksLikeMultiplePeople(nameCell)) {
      out.issues.push({
        sheetName: sheet.name,
        rowNumber: r,
        outcome: 'MULTI_PERSON',
        message: `La fila describe a más de una persona ("${nameCell}").`,
        rawValues: { name: nameCell },
      })
      continue
    }

    const handle = normalizeHandle(handleCell)
    const url = handle ? `https://www.instagram.com/${handle}` : ''
    const { profiles, problems } = buildProfiles(
      url,
      iFollowers >= 0 ? (values[iFollowers] ?? '') : '',
      iEr >= 0 ? (values[iEr] ?? '') : '',
    )
    for (const problem of problems) {
      out.issues.push({ sheetName: sheet.name, rowNumber: r, outcome: 'UNPARSEABLE', message: `${nameCell}: ${problem}`, rawValues: { name: nameCell } })
    }
    if (!handle) {
      out.issues.push({
        sheetName: sheet.name,
        rowNumber: r,
        outcome: 'INCOMPLETE',
        message: `"${nameCell}" no tiene handle utilizable. Se importa sin perfil social.`,
        rawValues: { name: nameCell, handle: handleCell },
      })
    }

    const clusterLabel = clusterCell ? cleanText(clusterCell.replace(/[\n\r]+/g, ' ')) : null
    const approval = parseClientApproval(values[iApproval] ?? '')
    const statusRaw = cleanText(values[iStatus] ?? '')
    const rankRaw = cleanText(values[iRank] ?? '')
    const rank = rankRaw ? Math.round(Number(rankRaw.replace(',', '.'))) : null

    out.people.push({
      sheetName: sheet.name,
      rowNumber: r,
      importKey: importKeyFor(profiles, nameCell),
      displayName: nameCell || handleCell,
      handle,
      country: null,
      city: null,
      niches: [],
      tierLabel: null,
      bio: null,
      profiles,
      campaignKey: MAIN_CAMPAIGN_KEY,
      clusterKey: clusterLabel ? clusterKeyFor(clusterLabel) : null,
      clusterLabel,
      statusKey: statusFromExcelStatus(statusRaw, approval),
      clientApproval: approval !== 'PENDING' ? approval : parseClientApproval(statusRaw),
      clientFeedback: nullIfEmpty(values[iFeedback] ?? ''),
      agencyRationale: nullIfEmpty(values[iRationale] ?? ''),
      contentIdea: nullIfEmpty(values[iIdea] ?? ''),
      deliverablesSummary: null,
      fitScore: parseStars(values[iFit] ?? ''),
      budgetRaw: nullIfEmpty(values[iBudget] ?? ''),
      rank: Number.isFinite(rank) ? rank : null,
      sourceUrl: null,
      rawValues: Object.fromEntries(headers.map((h, i) => [h || `col${i}`, values[i] ?? ''])),
    })
    handled += 1
  }
  out.sheetsSeen.push({ name: sheet.name, rows: sheet.rowCount, handled: true, note: `${handled} perfiles` })
}

function statusFromExcelStatus(raw: string, approval: ClientApprovalValue): string {
  const upper = cleanText(raw).toUpperCase()
  if (upper.includes('NUEVO')) return 'EN_SCREENING'
  if (upper.includes('REVISAR')) return 'A_REVISAR'
  if (upper.includes('APROBAD')) return 'APROBADO'
  if (upper.includes('ANTERIOR')) return 'APROBADO'
  if (upper.includes('DESCARTAD') || upper.includes('RECHAZAD')) return 'RECHAZADO'
  return statusFromApproval(approval)
}

const EMOJI_PREFIX = new RegExp('^[^\\p{L}\\p{N}]+', 'u')

function clusterKeyFor(label: string): string {
  return cleanText(label)
    .replace(EMOJI_PREFIX, '')
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 3)
    .join('-')
}

function registerClusterFromHeading(text: string, out: ParsedWorkbook): void {
  const match = text.match(/^(.*?)\s*[—–-]\s*(\d{1,3})\s*%\s*del squad/i)
  if (!match) return
  const rawLabel = cleanText(match[1] ?? '')
  const percent = Number(match[2])
  if (!rawLabel || !Number.isFinite(percent)) return
  const emojiMatch = rawLabel.match(EMOJI_PREFIX)
  const emoji = emojiMatch ? cleanText(emojiMatch[0]) : null
  const label = cleanText(rawLabel.replace(EMOJI_PREFIX, ''))
  const key = clusterKeyFor(label)
  if (out.brief.clusters.some((c) => c.key === key)) return
  out.brief.clusters.push({ key, label, emoji: emoji || null, targetPercent: percent })
  out.decisions.push(`Cluster "${label}" con ${percent}% del squad, leído del encabezado de bloque.`)
}

// ── Hoja "Scouting Mili" (bloques con encabezado repetido) ──────────────────

/**
 * Hoja con varios bloques (CRYPTO / TRAVEL / BUSINESS), cada uno con su propio
 * encabezado repetido: `# | Perfil | Seguidores | ER | Nicho | Fit | Idea`.
 * El título del bloque se usa como cluster.
 */
function parseBlockScoutingSheet(sheet: ExcelJS.Worksheet, out: ParsedWorkbook): void {
  const headerRow = findHeaderRow(sheet, ['PERFIL', '#'])
  if (headerRow === null) {
    out.sheetsSeen.push({ name: sheet.name, rows: sheet.rowCount, handled: false, note: 'sin encabezado Perfil' })
    return
  }
  const maxCol = Math.min(sheet.columnCount, 12)
  const headers = rowValues(sheet.getRow(headerRow), maxCol).map((h) => cleanText(h).toUpperCase())
  const iRank = headers.findIndex((h) => h === '#')
  const iProfile = headerIndex(headers, 'PERFIL')
  const iFollowers = headerIndex(headers, 'SEGUIDORES')
  const iEr = headerIndex(headers, 'ER', 'ER / DATO')
  const iNiche = headerIndex(headers, 'NICHO')
  const iFit = headerIndex(headers, 'FIT')
  const iIdea = headerIndex(headers, 'IDEA')

  let clusterLabel: string | null = null
  let handled = 0

  for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
    const values = rowValues(sheet.getRow(r), maxCol)
    if (isRowEmpty(values)) continue

    const upper = values.map((v) => cleanText(v).toUpperCase())
    // Encabezado repetido de un bloque siguiente.
    if (upper.some((v) => v === '#') && upper.some((v) => v.startsWith('PERFIL'))) continue

    const profileCell = cleanText(values[iProfile] ?? '')
    const nonEmpty = values.map((v) => cleanText(v)).filter(Boolean)

    // Título de bloque: una sola celda con texto en mayúsculas.
    if (!profileCell.startsWith('@')) {
      if (nonEmpty.length <= 2 && nonEmpty[0] && looksLikeSectionHeading(nonEmpty[0])) {
        clusterLabel = cleanText(nonEmpty[0])
        out.decisions.push(`"${sheet.name}" fila ${r}: bloque "${clusterLabel}" usado como cluster.`)
      }
      continue
    }

    const handle = normalizeHandle(profileCell)
    const url = handle ? `https://www.instagram.com/${handle}` : ''
    const { profiles, problems } = buildProfiles(url, values[iFollowers] ?? '', values[iEr] ?? '')
    for (const problem of problems) {
      out.issues.push({ sheetName: sheet.name, rowNumber: r, outcome: 'UNPARSEABLE', message: `${profileCell}: ${problem}`, rawValues: { profile: profileCell } })
    }

    const sourceUrl = nonEmpty.find((value) => /^https?:\/\//i.test(value) && !value.includes('instagram.com')) ?? null
    const rankRaw = iRank >= 0 ? cleanText(values[iRank] ?? '') : ''
    const rank = rankRaw ? Math.round(Number(rankRaw.replace(',', '.'))) : null

    out.people.push({
      sheetName: sheet.name,
      rowNumber: r,
      importKey: importKeyFor(profiles, profileCell),
      displayName: profileCell,
      handle,
      country: null,
      city: null,
      niches: splitNiches(values[iNiche] ?? ''),
      tierLabel: null,
      bio: null,
      profiles,
      campaignKey: MAIN_CAMPAIGN_KEY,
      clusterKey: clusterLabel ? clusterKeyFor(clusterLabel) : null,
      clusterLabel,
      statusKey: 'EN_SCREENING',
      clientApproval: 'PENDING',
      clientFeedback: null,
      agencyRationale: null,
      contentIdea: nullIfEmpty(values[iIdea] ?? ''),
      deliverablesSummary: null,
      fitScore: parseStars(values[iFit] ?? ''),
      budgetRaw: null,
      rank: Number.isFinite(rank) ? rank : null,
      sourceUrl,
      rawValues: Object.fromEntries(headers.map((h, i) => [h || `col${i}`, values[i] ?? ''])),
    })
    handled += 1
  }
  out.sheetsSeen.push({ name: sheet.name, rows: sheet.rowCount, handled: true, note: `${handled} perfiles` })
}

// ── Hoja "Busqueda clickup" (base rica, sin encabezado) ──────────────────────

function parseDatabaseSheet(sheet: ExcelJS.Worksheet, out: ParsedWorkbook): void {
  const maxCol = Math.min(sheet.columnCount, 12)
  let handled = 0
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const values = rowValues(sheet.getRow(r), maxCol)
    if (isRowEmpty(values)) continue

    const name = cleanText(values[0] ?? '')
    if (!name || looksLikeSectionHeading(name)) continue
    if (cleanText(values[0] ?? '').toUpperCase() === 'NOMBRE') continue

    if (looksLikeMultiplePeople(name)) {
      out.issues.push({
        sheetName: sheet.name,
        rowNumber: r,
        outcome: 'MULTI_PERSON',
        message: `La fila describe a más de una persona ("${name}").`,
        rawValues: { name },
      })
      continue
    }

    const { profiles, problems } = buildProfiles(values[4] ?? '', values[5] ?? '', values[6] ?? '')
    for (const problem of problems) {
      out.issues.push({ sheetName: sheet.name, rowNumber: r, outcome: 'UNPARSEABLE', message: `${name}: ${problem}`, rawValues: { name } })
    }
    if (profiles.length === 0) {
      out.issues.push({
        sheetName: sheet.name,
        rowNumber: r,
        outcome: 'INCOMPLETE',
        message: `"${name}" no tiene URL utilizable.`,
        rawValues: { name, urls: values[4] ?? '' },
      })
    }

    out.people.push({
      sheetName: sheet.name,
      rowNumber: r,
      importKey: importKeyFor(profiles, name),
      displayName: name,
      handle: null,
      country: cleanText(values[2] ?? '') || null,
      city: null,
      niches: splitNiches(values[1] ?? ''),
      tierLabel: parseTierLabel(values[3] ?? ''),
      bio: nullIfEmpty(values[7] ?? ''),
      profiles,
      campaignKey: 'base-general',
      clusterKey: null,
      clusterLabel: null,
      statusKey: 'EN_SCREENING',
      clientApproval: 'PENDING',
      clientFeedback: null,
      agencyRationale: nullIfEmpty(values[7] ?? ''),
      contentIdea: null,
      deliverablesSummary: null,
      fitScore: null,
      budgetRaw: null,
      rank: null,
      sourceUrl: null,
      rawValues: { nombre: name, nichos: values[1], pais: values[2], tier: values[3] },
    })
    handled += 1
  }
  out.sheetsSeen.push({ name: sheet.name, rows: sheet.rowCount, handled: true, note: `${handled} perfiles` })
}

// ── Hoja "SCOUTING Anteriores de kast" (bloques por ronda) ───────────────────

const ROUND_CAMPAIGNS: Array<{ match: RegExp; key: string; name: string; status: string }> = [
  { match: /^FEBRERO/i, key: 'ronda-febrero', name: 'Ronda febrero', status: 'FINALIZADO' },
  { match: /^JULIO/i, key: 'ronda-julio', name: 'Ronda julio', status: 'FINALIZADO' },
  { match: /^JUNIO\s*-\s*FOCO MUNDIAL/i, key: 'ronda-junio-mundial', name: 'Ronda junio — foco mundial', status: 'FINALIZADO' },
  { match: /^JUNIO\s*-\s*FOCO GENERAL/i, key: 'ronda-junio-general', name: 'Ronda junio — foco general', status: 'FINALIZADO' },
  { match: /^SCREENING/i, key: 'historial-screening', name: 'Historial — screening', status: 'EN_SCREENING' },
  { match: /^FINALIZADOS/i, key: 'historial-cerrados', name: 'Historial — cerrados y no disponibles', status: 'NO_DISPONIBLE' },
]

/** Tokens de la lista desplegable de países del Excel, para distinguir país de nombre. */
const COUNTRY_TOKEN = /^(argentina|arg|bolivia|chile|colombia|col|emirates|espa[nñ]a|europa|global|latam|lan|las|m[eé]xico|mex|panam[aá]|per[uú]|rep[uú]blica dominicana|rep\. dom\.|turkey|usa|venezuela)\b/i

function parseHistorySheet(sheet: ExcelJS.Worksheet, out: ParsedWorkbook): void {
  const maxCol = Math.min(sheet.columnCount, 8)
  let current = { key: 'historial-inicial', name: 'Historial — rondas iniciales', status: 'FINALIZADO' }
  out.campaigns.push({ key: current.key, name: current.name, description: `Importado de la hoja "${sheet.name}".` })
  let handled = 0

  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r)
    const values = rowValues(row, maxCol)
    if (isRowEmpty(values)) continue
    const joined = cleanText(values.join(' '))

    const round = ROUND_CAMPAIGNS.find((candidate) => candidate.match.test(cleanText(values[0] ?? '')))
    if (round) {
      current = { key: round.key, name: round.name, status: round.status }
      if (!out.campaigns.some((c) => c.key === round.key)) {
        out.campaigns.push({ key: round.key, name: round.name, description: `Bloque "${cleanText(values[0] ?? '')}" de la hoja "${sheet.name}".` })
      }
      out.decisions.push(`Bloque "${cleanText(values[0] ?? '')}" mapeado a la campaña "${round.name}" con estado ${round.status}.`)
      continue
    }
    if (/sujetos a disponibilidad/i.test(joined) && cleanText(values[0] ?? '') === '') continue

    const a = cleanText(values[0] ?? '')
    const b = cleanText(values[1] ?? '')
    const c = cleanText(values[2] ?? '')
    const looksUrl = (value: string) => /\.[a-z]{2,}/i.test(value) && !/\s/.test(value)

    // La hoja mezcla dos formatos. El discriminante es si la columna A trae un
    // país de la lista del Excel; si lo trae, el nombre está en la columna B.
    let name: string
    let country: string | null = null
    let extra: string
    let extraColumn: number
    if (COUNTRY_TOKEN.test(a) && b && !looksUrl(b)) {
      country = a
      name = b
      extra = c
      extraColumn = 3
    } else {
      name = a
      extra = looksUrl(c) ? c : b
      extraColumn = looksUrl(c) ? 3 : 2
    }

    // Regla frente a un origen que se contradice: manda el texto visible.
    // El hipervínculo sólo se usa cuando la celda no muestra una URL (celdas
    // que dicen sólo "Instagram"), y en ese caso se avisa de dónde salió.
    const link = cellHyperlink(row.getCell(extraColumn))
    let urlText = ''
    let urlFromLink = false
    if (looksUrl(extra)) {
      urlText = extra
      if (link && !sameProfile(extra, link)) {
        out.issues.push({
          sheetName: sheet.name,
          rowNumber: r,
          outcome: 'CONFLICT',
          message: `"${name}": la celda muestra ${extra} pero el hipervínculo apunta a ${link}. Se importó el texto visible; hay que verificar cuál es el correcto.`,
          rawValues: { texto: extra, hipervinculo: link },
        })
      }
    } else if (link && looksUrl(link)) {
      urlText = link
      urlFromLink = true
    }

    if (!name || looksLikeSectionHeading(name)) continue
    if (looksLikeMultiplePeople(name)) {
      out.issues.push({
        sheetName: sheet.name,
        rowNumber: r,
        outcome: 'MULTI_PERSON',
        message: `La fila describe a más de una persona ("${name}").`,
        rawValues: { a, b, c },
      })
      continue
    }

    const { profiles, problems } = buildProfiles(urlText, '', '')
    for (const problem of problems) {
      out.issues.push({ sheetName: sheet.name, rowNumber: r, outcome: 'UNPARSEABLE', message: `${name}: ${problem}`, rawValues: { a, b, c } })
    }
    if (profiles.length === 0) {
      out.issues.push({
        sheetName: sheet.name,
        rowNumber: r,
        outcome: 'INCOMPLETE',
        message: `"${name}" viene sin URL (la hoja sólo indica plataformas). Se importa sin perfil social.`,
        rawValues: { a, b, c },
      })
    } else if (urlFromLink) {
      const recovered = handleOf(profiles)
      const similar = recovered ? nameSimilarity(name, recovered) : 0
      if (similar < 0.45) {
        out.issues.push({
          sheetName: sheet.name,
          rowNumber: r,
          outcome: 'CONFLICT',
          message: `"${name}": la celda sólo dice "${extra}"; el link lleva a @${recovered ?? '?'}, que no se parece al nombre. Verificar el perfil antes de usarlo.`,
          rawValues: { nombre: name, celda: extra, link: urlText },
        })
      }
    }

    const nicheText = country && c && !looksUrl(c) && !/instagram|tiktok|youtube/i.test(c) ? c : ''

    out.people.push({
      sheetName: sheet.name,
      rowNumber: r,
      importKey: importKeyFor(profiles, name),
      displayName: name,
      handle: handleOf(profiles),
      country,
      city: null,
      niches: splitNiches(nicheText),
      tierLabel: null,
      bio: null,
      profiles,
      campaignKey: current.key,
      clusterKey: null,
      clusterLabel: null,
      statusKey: current.status,
      clientApproval: current.status === 'NO_DISPONIBLE' ? 'REJECTED' : 'PENDING',
      clientFeedback: null,
      agencyRationale: null,
      contentIdea: null,
      deliverablesSummary: null,
      fitScore: null,
      budgetRaw: null,
      rank: null,
      sourceUrl: null,
      rawValues: { a, b, c },
    })
    handled += 1
  }
  out.sheetsSeen.push({ name: sheet.name, rows: sheet.rowCount, handled: true, note: `${handled} perfiles en ${out.campaigns.length} bloques` })
}

// ── Hojas de una sola columna (nombres o URLs sueltos) ───────────────────────

function parseBacklogSheet(sheet: ExcelJS.Worksheet, out: ParsedWorkbook): void {
  let handled = 0
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const cell = sheet.getRow(r).getCell(1)
    if (isMergedContinuation(cell)) continue
    const value = cleanText(cellRaw(cell))
    if (!value) continue
    if (looksLikeSectionHeading(value)) continue

    const isUrl = /\.[a-z]{2,}/i.test(value) && !/\s/.test(value)
    const { profiles, problems } = isUrl ? buildProfiles(value, '', '') : { profiles: [], problems: [] }
    for (const problem of problems) {
      out.issues.push({ sheetName: sheet.name, rowNumber: r, outcome: 'UNPARSEABLE', message: problem, rawValues: { value } })
    }

    const parsedUrl = profiles[0] ? parseProfileUrl(profiles[0].url) : null
    const handle = parsedUrl && parsedUrl.kind === 'value' ? parsedUrl.value.handle : null
    const displayName = isUrl ? (handle ? `@${handle}` : value) : value

    if (!isUrl) {
      out.issues.push({
        sheetName: sheet.name,
        rowNumber: r,
        outcome: 'INCOMPLETE',
        message: `"${value}" es sólo un nombre, sin perfil ni métricas. Entra al backlog.`,
        rawValues: { value },
      })
    }

    out.people.push({
      sheetName: sheet.name,
      rowNumber: r,
      importKey: importKeyFor(profiles, displayName),
      displayName,
      handle,
      country: null,
      city: null,
      niches: [],
      tierLabel: null,
      bio: null,
      profiles,
      campaignKey: 'backlog',
      clusterKey: null,
      clusterLabel: null,
      statusKey: 'NUEVO',
      clientApproval: 'PENDING',
      clientFeedback: null,
      agencyRationale: null,
      contentIdea: null,
      deliverablesSummary: null,
      fitScore: null,
      budgetRaw: null,
      rank: null,
      sourceUrl: null,
      rawValues: { value },
    })
    handled += 1
  }
  out.sheetsSeen.push({ name: sheet.name, rows: sheet.rowCount, handled: true, note: `${handled} entradas de backlog` })
}

// ── Hojas de brief ───────────────────────────────────────────────────────────

function sheetLines(sheet: ExcelJS.Worksheet): Array<{ row: number; cells: string[]; text: string }> {
  const maxCol = Math.min(sheet.columnCount, 10)
  const lines: Array<{ row: number; cells: string[]; text: string }> = []
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const cells = rowValues(sheet.getRow(r), maxCol)
    if (isRowEmpty(cells)) continue
    lines.push({ row: r, cells, text: cleanText(cells.filter(Boolean).join(' · ')) })
  }
  return lines
}

const KEYWORD_CATEGORIES = ['CRYPTO', 'FINTECH', 'TRAVEL', 'WORK']

function parseStructuredBrief(sheet: ExcelJS.Worksheet, out: ParsedWorkbook): void {
  const lines = sheetLines(sheet)
  let currentCategory: string | null = null
  const excluded: string[] = []
  let inExclusions = false

  for (const line of lines) {
    const text = line.text
    const upper = text.toUpperCase()

    if (KEYWORD_CATEGORIES.includes(upper)) {
      currentCategory = upper
      continue
    }
    if (/^Pa[ií]s:/i.test(text)) out.brief.country = cleanText(text.split(':')[1] ?? '').replace(/[^\p{L}\s]/gu, '').trim() || null
    else if (/^Idioma:/i.test(text)) out.brief.language = cleanText(text.split(':')[1] ?? '') || null
    else if (/^Followers:/i.test(text)) {
      const range = text.match(/(\d+[.,]?\d*\s*[kKmM]?)\s*[–-]\s*(\d+[.,]?\d*\s*[kKmM]?)/)
      if (range) {
        const min = parseFollowers(range[1])
        const max = parseFollowers(range[2])
        if (min.kind === 'value') out.brief.followersMin = min.value
        if (max.kind === 'value') out.brief.followersMax = max.value
        out.decisions.push(`Brief: rango de seguidores ${out.brief.followersMin}–${out.brief.followersMax} leído de "${text}".`)
      }
    } else if (/^Plataformas:/i.test(text)) {
      const raw = text.split(':')[1] ?? ''
      out.brief.platforms = raw
        .split(/[+,/]/)
        .map((part) => cleanText(part).toUpperCase())
        .filter((part) => ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'X', 'TWITCH', 'LINKEDIN', 'FACEBOOK'].includes(part))
    } else if (/^ER:/i.test(text)) {
      const match = text.match(/(\d+[.,]?\d*)\s*%/)
      if (match) out.brief.engagementRateMin = Number((match[1] ?? '').replace(',', '.'))
    } else if (/^Edad audiencia:/i.test(text)) {
      const match = text.match(/(\d{2})\s*[–-]\s*(\d{2})/)
      if (match) {
        out.brief.audienceAgeMin = Number(match[1])
        out.brief.audienceAgeMax = Number(match[2])
      }
    } else if (/^Audiencia:/i.test(text)) {
      out.brief.audienceGeoPredominance = cleanText(text.split(':')[1] ?? '') || null
    } else if (/^\s*(\d{1,3})\s*%\s+(.+)$/.test(text)) {
      const match = text.match(/^\s*(\d{1,3})\s*%\s+(.+)$/)
      if (match) {
        const percent = Number(match[1])
        const label = cleanText(match[2] ?? '')
        const key = clusterKeyFor(label)
        if (!out.brief.clusters.some((c) => c.key === key)) {
          out.brief.clusters.push({ key, label, emoji: null, targetPercent: percent })
          out.decisions.push(`Cluster "${label}" con ${percent}% leído del brief ("${sheet.name}" fila ${line.row}).`)
        }
      }
    } else if (/^Pero evitar[íi]a estos perfiles/i.test(text) || /^No ir[íi]a solamente por/i.test(text)) {
      inExclusions = true
    } else if (inExclusions && /^[A-ZÁÉÍÓÚÑ]/.test(text) && text.length < 200 && !/^Para /i.test(text)) {
      excluded.push(text)
    } else if (currentCategory && text.length > 1 && text.length < 60 && !/[:.]$/.test(text)) {
      out.brief.keywords.push({ category: currentCategory, term: cleanText(text).toLowerCase() })
    }

    if (/^Y algo importante para el brief/i.test(text)) {
      currentCategory = null
      inExclusions = false
    }
  }

  if (excluded.length > 0) {
    out.brief.exclusionCriteria = [out.brief.exclusionCriteria, ...excluded].filter(Boolean).join('\n')
  }
  out.sheetsSeen.push({ name: sheet.name, rows: sheet.rowCount, handled: true, note: 'brief estructurado' })
}

function parseNarrativeBrief(sheet: ExcelJS.Worksheet, out: ParsedWorkbook): void {
  const lines = sheetLines(sheet)
  const nicheHeader = lines.findIndex((line) => /Nicho\s*·\s*Prioridad/i.test(line.text))
  if (nicheHeader >= 0) {
    for (let i = nicheHeader + 1; i < lines.length; i += 1) {
      const line = lines[i]
      if (!line) break
      const cells = line.cells.filter(Boolean)
      const label = cleanText(cells[0] ?? '')
      const stars = parseStars(cells[1] ?? '')
      const ideal = cleanText(cells[2] ?? '')
      if (!label || stars === null) break
      out.brief.niches.push({
        label: label.replace(EMOJI_PREFIX, '').trim() || label,
        mode: 'PRIORITY',
        priority: stars,
        idealProfile: ideal || null,
      })
    }
    out.decisions.push(`Brief: ${out.brief.niches.length} nichos con prioridad leídos de la tabla de "${sheet.name}".`)
  }

  const narrative = lines.map((line) => line.text).join('\n')
  const idealStart = narrative.indexOf('Los 5 perfiles que yo priorizaría')
  if (idealStart >= 0) out.brief.idealProfile = cleanText(narrative.slice(idealStart, idealStart + 1800))
  if (/uso real/i.test(narrative)) {
    out.brief.realProductUses = cleanText(
      lines.filter((line) => /uso real|caso de uso|pag[ao]|cobr[oa]/i.test(line.text)).map((line) => line.text).join('\n'),
    ).slice(0, 2000)
  }
  const excluded = lines
    .filter((line) => /^(Traders|Perfiles|Creadores|Cuentas)\b/i.test(line.text) && line.text.length < 160)
    .map((line) => line.text)
  if (excluded.length > 0) {
    out.brief.exclusionCriteria = [out.brief.exclusionCriteria, ...excluded].filter(Boolean).join('\n')
  }
  out.brief.contentIdeas = cleanText(
    lines.filter((line) => /^[“"]/.test(line.text)).map((line) => line.text).join('\n'),
  ).slice(0, 2000) || out.brief.contentIdeas

  out.sheetsSeen.push({ name: sheet.name, rows: sheet.rowCount, handled: true, note: 'brief narrativo' })
}

function parseSummarySheet(sheet: ExcelJS.Worksheet, out: ParsedWorkbook): void {
  const lines = sheetLines(sheet)
  for (const line of lines) {
    const match = line.text.match(/(\d{1,2})\.\s*@([a-z0-9._]+)/i)
    if (match) {
      const handle = normalizeHandle(match[2])
      if (handle && !out.shortlist.some((entry) => entry.handle === handle)) {
        out.shortlist.push({ handle, order: Number(match[1]), note: null })
      }
      continue
    }
    const clusterMatch = line.text.match(/^\s*(?:[^\p{L}\p{N}]*\s*)?(\d{1,3})\s*%\s+(.+)$/u)
    if (clusterMatch) {
      const percent = Number(clusterMatch[1])
      const label = cleanText(clusterMatch[2] ?? '')
      // Esta hoja propone OTRA distribución del squad, distinta a la del brief.
      // Mezclarlas daría un squad de 200%: se guarda como alternativa, no como
      // cluster activo, y queda anotada para que el equipo decida cuál usar.
      if (label.length > 2 && !out.brief.alternativeClusters.some((c) => c.label === label)) {
        out.brief.alternativeClusters.push({ label, targetPercent: percent, source: sheet.name })
      }
    }
    if (/n[uú]meros de seguidores y ER son datos de directorios/i.test(line.text)) {
      out.brief.internalNotes = [out.brief.internalNotes, line.text].filter(Boolean).join('\n\n')
      out.decisions.push('Se guardó como nota interna la advertencia sobre frescura de los datos de directorios.')
    }
  }
  out.sheetsSeen.push({ name: sheet.name, rows: sheet.rowCount, handled: true, note: `shortlist con ${out.shortlist.length} entradas` })
}

// ── Punto de entrada ─────────────────────────────────────────────────────────

export async function parseWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)

  const out: ParsedWorkbook = {
    people: [],
    brief: {
      country: null,
      language: null,
      followersMin: null,
      followersMax: null,
      engagementRateMin: null,
      audienceAgeMin: null,
      audienceAgeMax: null,
      audienceGeoPredominance: null,
      audienceGeoMinPercent: null,
      platforms: [],
      idealProfile: null,
      contentIdeas: null,
      realProductUses: null,
      inclusionCriteria: null,
      exclusionCriteria: null,
      internalNotes: null,
      niches: [],
      keywords: [],
      clusters: [],
      alternativeClusters: [],
    },
    budget: { cacheRaw: null, barterRaw: null, currency: null, amount: null },
    shortlist: [],
    campaigns: [
      { key: MAIN_CAMPAIGN_KEY, name: 'Scouting actual', description: 'Propuesta de perfiles vigente, importada del Excel.' },
      { key: 'base-general', name: 'Base general de scouting', description: 'Perfiles relevados sin campaña asignada.' },
      { key: 'backlog', name: 'Backlog de perfiles', description: 'Nombres y links sueltos a evaluar.' },
    ],
    issues: [],
    decisions: [],
    sheetsSeen: [],
  }

  for (const sheet of workbook.worksheets) {
    const name = sheet.name
    if (/^SCOUTING KAST$/i.test(name)) parseCreatorSheet(sheet, MAIN_CAMPAIGN_KEY, out)
    else if (/^SCOUTING$/i.test(name)) parseCreatorSheet(sheet, 'base-general', out)
    else if (/Anteriores/i.test(name)) parseHistorySheet(sheet, out)
    else if (/clickup/i.test(name)) parseDatabaseSheet(sheet, out)
    else if (/Mili 2/i.test(name)) parseClusterSheet(sheet, out)
    else if (/Mili/i.test(name)) parseBlockScoutingSheet(sheet, out)
    else if (/^Brief 2$/i.test(name)) parseStructuredBrief(sheet, out)
    else if (/^Brief/i.test(name)) parseNarrativeBrief(sheet, out)
    else if (/^RESUMEN$/i.test(name)) parseSummarySheet(sheet, out)
    else if (/agregar si aplica|perfiles adicionales/i.test(name)) parseBacklogSheet(sheet, out)
    else {
      const empty = sheet.rowCount <= 1
      out.sheetsSeen.push({
        name,
        rows: sheet.rowCount,
        handled: false,
        note: empty ? 'hoja vacía, no aporta datos' : 'formato no reconocido, no se importó',
      })
    }
  }

  if (out.brief.alternativeClusters.length > 0) {
    const detail = out.brief.alternativeClusters
      .map((cluster) => `${cluster.targetPercent}% ${cluster.label}`)
      .join(' · ')
    const source = out.brief.alternativeClusters[0]?.source ?? 'otra hoja'
    out.brief.internalNotes = [
      out.brief.internalNotes,
      `Distribución alternativa propuesta en "${source}": ${detail}. No se aplicó como cluster activo para no duplicar el squad.`,
    ]
      .filter(Boolean)
      .join('\n\n')
    out.decisions.push(
      `Se encontró una segunda distribución del squad en "${source}" (${detail}). Se guardó como nota interna en vez de sumarla a los clusters.`,
    )
  }

  // Presupuesto de campaña leído del pie de "SCOUTING KAST".
  if (out.budget.cacheRaw) {
    const match = out.budget.cacheRaw.match(/([\d.,]+)\s*([A-Z]{3})?/i)
    if (match) {
      const parsed = parseFollowers(match[1])
      if (parsed.kind === 'value') out.budget.amount = parsed.value
      out.budget.currency = (match[2] ?? 'USD').toUpperCase()
    }
  }

  return out
}
