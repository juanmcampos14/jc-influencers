import 'server-only'
import type { BrandSource, ThemeMode } from '@/generated/prisma/enums'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { NotFoundError, ValidationError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import { normalizeHex, NEUTRAL_LIGHT, type ThemeColors } from '@/lib/domain/color'
import { resolveTheme, sanitizeFontName, type ResolvedTheme } from '@/lib/domain/theme'
import { fileStorage } from '@/lib/ports/storage'
import { actorOf, assertUpdated, scoped } from './base'

export type BrandDto = {
  clientId: string
  source: BrandSource
  sourceUrl: string | null
  extractedAt: string | null
  colors: ThemeColors
  fontHeading: string | null
  fontBody: string | null
  radius: number
  mode: ThemeMode
  safeMode: boolean
  status: 'DRAFT' | 'APPROVED'
  hasLogo: boolean
  logoIsDark: boolean
  contrastReport: unknown
  version: number
}

const DEFAULT_BRAND: Omit<BrandDto, 'clientId'> = {
  source: 'MANUAL',
  sourceUrl: null,
  extractedAt: null,
  colors: NEUTRAL_LIGHT,
  fontHeading: null,
  fontBody: null,
  radius: 12,
  mode: 'LIGHT',
  safeMode: false,
  status: 'DRAFT',
  hasLogo: false,
  logoIsDark: false,
  contrastReport: null,
  version: 1,
}

export async function getBrand(ctx: AuthContext, clientId: string): Promise<BrandDto> {
  assertClientInScope(ctx, clientId)
  const row = await scoped(ctx, (tx) => tx.clientBrand.findUnique({ where: { clientId } }))
  if (!row) return { clientId, ...DEFAULT_BRAND }
  return {
    clientId,
    source: row.source,
    sourceUrl: row.sourceUrl,
    extractedAt: row.extractedAt ? row.extractedAt.toISOString() : null,
    colors: {
      primary: row.primary,
      onPrimary: row.onPrimary,
      accent: row.accent,
      background: row.background,
      surface: row.surface,
      text: row.text,
      muted: row.muted,
      border: row.border,
    },
    fontHeading: row.fontHeading,
    fontBody: row.fontBody,
    radius: row.radius,
    mode: row.mode,
    safeMode: row.safeMode,
    status: row.status,
    hasLogo: Boolean(row.logoStorageKey),
    logoIsDark: row.logoIsDark,
    contrastReport: row.contrastReport,
    version: row.version,
  }
}

/**
 * Tema activo de un espacio de trabajo.
 * Sólo se aplica el tema APROBADO: un borrador a medio ajustar no puede llegarle
 * al cliente. Si no hay ninguno, se devuelve el tema neutro de JC.
 */
export type ActiveTheme = ResolvedTheme & {
  logoUrl: string | null
  /** true si el logo es de trazo oscuro; define sobre qué fondo mostrarlo. */
  logoIsDark: boolean
  clientId: string | null
}

export async function getActiveTheme(ctx: AuthContext, clientId: string | null): Promise<ActiveTheme> {
  if (!clientId || !ctx.clients.some((client) => client.id === clientId)) {
    return { ...resolveTheme({ colors: NEUTRAL_LIGHT, mode: 'LIGHT' }), logoUrl: null, logoIsDark: false, clientId: null }
  }

  const row = await scoped(ctx, (tx) => tx.clientBrand.findUnique({ where: { clientId } })).catch(() => null)
  if (!row || row.status !== 'APPROVED') {
    return { ...resolveTheme({ colors: NEUTRAL_LIGHT, mode: 'LIGHT' }), logoUrl: null, logoIsDark: false, clientId }
  }

  const resolved = resolveTheme({
    colors: {
      primary: row.primary,
      onPrimary: row.onPrimary,
      accent: row.accent,
      background: row.background,
      surface: row.surface,
      text: row.text,
      muted: row.muted,
      border: row.border,
    },
    mode: row.mode,
    radius: row.radius,
    fontHeading: row.fontHeading,
    fontBody: row.fontBody,
    safeMode: row.safeMode,
  })

  return {
    ...resolved,
    clientId,
    logoIsDark: row.logoIsDark,
    logoUrl: row.logoStorageKey ? `/api/marca/${clientId}/logo?v=${row.version}` : null,
  }
}

export type BrandWriteInput = {
  source: BrandSource
  sourceUrl?: string | null
  colors: ThemeColors
  fontHeading?: string | null
  fontBody?: string | null
  radius?: number
  mode: ThemeMode
  safeMode?: boolean
  status: 'DRAFT' | 'APPROVED'
  logo?: { data: Buffer; contentType: string; isDark: boolean } | null
  removeLogo?: boolean
  rawExtraction?: unknown
  extractedAt?: Date | null
  version?: number
}

const HEX_KEYS: Array<keyof ThemeColors> = [
  'primary',
  'onPrimary',
  'accent',
  'background',
  'surface',
  'text',
  'muted',
  'border',
]

function validateColors(colors: ThemeColors): ThemeColors {
  const clean = {} as ThemeColors
  for (const key of HEX_KEYS) {
    const normalized = normalizeHex(colors[key])
    if (!normalized) throw new ValidationError(`El color "${key}" no es un hexadecimal válido.`)
    clean[key] = normalized
  }
  return clean
}

/** Guarda o actualiza la identidad visual de un cliente. */
export async function saveBrand(ctx: AuthContext, clientId: string, input: BrandWriteInput): Promise<BrandDto> {
  assertClientInScope(ctx, clientId)
  assertCan(ctx, 'brand.manage', clientId)

  const colors = validateColors(input.colors)
  const fontHeading = sanitizeFontName(input.fontHeading)
  const fontBody = sanitizeFontName(input.fontBody)
  if (input.fontHeading && !fontHeading) throw new ValidationError('El nombre de la tipografía de títulos no es válido.')
  if (input.fontBody && !fontBody) throw new ValidationError('El nombre de la tipografía de texto no es válido.')

  // Se calcula el contraste ANTES de guardar: si no llega al mínimo ni corrigiendo,
  // no se puede aprobar sin el modo seguro.
  const resolved = resolveTheme({
    colors,
    mode: input.mode,
    radius: input.radius,
    fontHeading,
    fontBody,
    safeMode: input.safeMode ?? false,
  })
  if (input.status === 'APPROVED' && resolved.report.safeModeRecommended && !input.safeMode) {
    throw new ValidationError(
      'Con esta paleta no se puede respetar la marca y que además se lea. Activá el modo seguro o elegí colores con más contraste.',
      {
        colors: resolved.report.issues
          .filter((issue) => !issue.fixed)
          .map(
            (issue) =>
              `${issue.pair}: contraste ${issue.ratio}:1, mínimo ${issue.minimum}:1. Corregirlo cambiaría el color un ${Math.round(issue.adjustment * 100)}%.`,
          ),
      },
    )
  }

  let logoStorageKey: string | null | undefined
  let logoContentType: string | null | undefined
  if (input.removeLogo) {
    logoStorageKey = null
    logoContentType = null
  } else if (input.logo) {
    const stored = await fileStorage().put({
      filename: `logo-${clientId}.${input.logo.contentType.split('/')[1] ?? 'png'}`,
      contentType: input.logo.contentType,
      data: input.logo.data,
      prefix: `marca/${clientId}`,
    })
    logoStorageKey = stored.key
    logoContentType = input.logo.contentType
  }

  await scoped(ctx, async (tx) => {
    const before = await tx.clientBrand.findUnique({ where: { clientId } })

    const data = {
      source: input.source,
      sourceUrl: input.sourceUrl ?? null,
      extractedAt: input.extractedAt ?? before?.extractedAt ?? null,
      rawExtraction: (input.rawExtraction ?? before?.rawExtraction ?? undefined) as never,
      ...(logoStorageKey !== undefined ? { logoStorageKey, logoContentType } : {}),
      ...(input.logo ? { logoIsDark: input.logo.isDark } : {}),
      primary: colors.primary,
      onPrimary: colors.onPrimary,
      accent: colors.accent,
      background: colors.background,
      surface: colors.surface,
      text: colors.text,
      muted: colors.muted,
      border: colors.border,
      fontHeading,
      fontBody,
      radius: input.radius ?? 12,
      mode: input.mode,
      safeMode: input.safeMode ?? false,
      contrastReport: resolved.report as never,
      status: input.status,
      appliedAt: input.status === 'APPROVED' ? new Date() : before?.appliedAt ?? null,
    }

    if (before) {
      if (input.version !== undefined) {
        const result = await tx.clientBrand.updateMany({
          where: { clientId, version: input.version },
          data: { ...data, version: { increment: 1 } },
        })
        assertUpdated(result.count)
      } else {
        await tx.clientBrand.update({ where: { clientId }, data: { ...data, version: { increment: 1 } } })
      }
      // El logo viejo deja de referenciarse: se borra para no acumular archivos huérfanos.
      if (logoStorageKey !== undefined && before.logoStorageKey && before.logoStorageKey !== logoStorageKey) {
        await fileStorage().remove(before.logoStorageKey).catch(() => undefined)
      }
    } else {
      await tx.clientBrand.create({ data: { ...data, clientId, createdById: ctx.user.id } })
    }

    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.BRAND_UPDATED,
      entityType: 'ClientBrand',
      entityId: clientId,
      clientId,
      before: before ? { primary: before.primary, mode: before.mode, status: before.status } : undefined,
      after: { primary: colors.primary, mode: input.mode, status: input.status, source: input.source },
    })
  })

  return getBrand(ctx, clientId)
}

/** Vuelve al tema neutro de JC. */
export async function resetBrand(ctx: AuthContext, clientId: string): Promise<void> {
  assertClientInScope(ctx, clientId)
  assertCan(ctx, 'brand.manage', clientId)

  await scoped(ctx, async (tx) => {
    const before = await tx.clientBrand.findUnique({ where: { clientId } })
    if (!before) return
    await tx.clientBrand.delete({ where: { clientId } })
    if (before.logoStorageKey) await fileStorage().remove(before.logoStorageKey).catch(() => undefined)
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.BRAND_RESET,
      entityType: 'ClientBrand',
      entityId: clientId,
      clientId,
    })
  })
}

/** Devuelve el logo para servirlo. Sólo a quien tenga el cliente en alcance. */
export async function readLogo(
  ctx: AuthContext,
  clientId: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  assertClientInScope(ctx, clientId)
  const row = await scoped(ctx, (tx) => tx.clientBrand.findUnique({ where: { clientId } }))
  if (!row?.logoStorageKey) return null
  const data = await fileStorage().get(row.logoStorageKey).catch(() => null)
  if (!data) throw new NotFoundError()
  return { data, contentType: row.logoContentType ?? 'image/png' }
}
