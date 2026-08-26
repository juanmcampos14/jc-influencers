"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { fail, ok, type ActionResult } from '@/lib/actions/result'
import { requireContext } from '@/lib/auth/current'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { ValidationError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import {
  descargarFondo,
  extractFromInstagram,
  extractFromUpload,
  extractFromWebsite,
  miniaturaDeFondo,
} from '@/lib/ports/brand-extractor'
import { scoutingProvider } from '@/lib/ports/scouting'
import { resolveTheme } from '@/lib/domain/theme'
import { assertUploadAllowed } from '@/lib/ports/storage'
import { consumeRateLimit } from '@/lib/auth/rate-limit'
import { drawBrandMural, removeBrandMural } from '@/lib/repos/ai'
import { resetBrand, saveBrand } from '@/lib/repos/brand'
import { actorOf, scoped } from '@/lib/repos/base'

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Usá un color en formato #rrggbb.')

const colorsSchema = z.object({
  primary: HEX,
  onPrimary: HEX,
  accent: HEX,
  background: HEX,
  surface: HEX,
  text: HEX,
  muted: HEX,
  border: HEX,
})

export type BrandProposal = {
  source: 'WEBSITE' | 'INSTAGRAM' | 'UPLOAD'
  sourceUrl: string | null
  siteTitle: string | null
  colors: Array<{ hex: string; origin: string }>
  fontHints: string[]
  theme: z.infer<typeof colorsSchema>
  logoDataUrl: string | null
  logoIsDark: boolean
  /**
   * Imágenes del sitio que pueden servir de fondo.
   *
   * Viajan como miniatura, no enteras: al elegir se manda la URL y el servidor
   * la vuelve a bajar. Mandar tres imágenes de cuatro megas para una decisión
   * de un clic sería tirar doce megas.
   */
  fondos: Array<{ url: string; miniatura: string; ancho: number; alto: number; esOscura: boolean }>
  warnings: string[]
  contrastIssues: Array<{ pair: string; ratio: number; minimum: number; fixed: boolean }>
}

const MAX_LOGO_PREVIEW_BYTES = 1_500_000

/**
 * Analiza la web, el Instagram o el archivo del cliente y PROPONE una identidad.
 * No guarda nada: la propuesta se ve, se ajusta y recién ahí se aprueba.
 */
export async function extractBrandAction(formData: FormData): Promise<ActionResult<BrandProposal>> {
  try {
    const ctx = await requireContext()
    const clientId = String(formData.get('clientId') ?? '')
    assertClientInScope(ctx, clientId)
    assertCan(ctx, 'brand.manage', clientId)

    const mode = String(formData.get('mode') ?? 'LIGHT') === 'DARK' ? 'DARK' : 'LIGHT'
    const kind = String(formData.get('kind') ?? 'WEBSITE')

    const extraction = await (async () => {
      if (kind === 'UPLOAD') {
        const file = formData.get('file')
        if (!(file instanceof File)) throw new ValidationError('Elegí un archivo de imagen.')
        assertUploadAllowed(file.name, file.type || 'image/png', file.size)
        if (!file.type.startsWith('image/')) throw new ValidationError('El archivo tiene que ser una imagen.')
        return extractFromUpload(Buffer.from(await file.arrayBuffer()), file.type, mode)
      }
      if (kind === 'INSTAGRAM') {
        const handle = String(formData.get('handle') ?? '').trim()
        if (!handle) throw new ValidationError('Ingresá el usuario de Instagram.')
        return extractFromInstagram(handle, (value) => scoutingProvider().fetchProfileImage(value), mode)
      }
      const website = String(formData.get('website') ?? '').trim()
      if (!website) throw new ValidationError('Ingresá la dirección del sitio.')
      return extractFromWebsite(website, mode)
    })()

    const resolved = resolveTheme({ colors: extraction.theme, mode })

    await scoped(ctx, (tx) =>
      recordAudit(tx, actorOf(ctx), {
        action: AUDIT.BRAND_EXTRACTED,
        entityType: 'ClientBrand',
        entityId: clientId,
        clientId,
        metadata: { kind, sourceUrl: extraction.sourceUrl, colores: extraction.colors.length },
      }),
    )

    const logoDataUrl =
      extraction.logo?.data && extraction.logo.data.byteLength <= MAX_LOGO_PREVIEW_BYTES
        ? `data:${extraction.logo.contentType ?? 'image/png'};base64,${extraction.logo.data.toString('base64')}`
        : null

    return ok({
      source: extraction.source,
      sourceUrl: extraction.sourceUrl,
      siteTitle: extraction.siteTitle,
      colors: extraction.colors.map((color) => ({ hex: color.hex, origin: color.origin })),
      fontHints: extraction.fontHints,
      theme: resolved.colors,
      logoDataUrl,
      logoIsDark: extraction.logo?.isDark ?? false,
      fondos: await Promise.all(
        extraction.backdrops.map(async (fondo) => ({
          url: fondo.url,
          miniatura: await miniaturaDeFondo(fondo.data),
          ancho: fondo.width,
          alto: fondo.height,
          esOscura: fondo.isDark,
        })),
      ),
      warnings: [
        ...extraction.warnings,
        ...(extraction.logo?.data && !logoDataUrl ? ['El logo es muy pesado para previsualizarlo acá.'] : []),
      ],
      contrastIssues: resolved.report.issues,
    })
  } catch (error) {
    return fail(error)
  }
}

/** Guarda la identidad visual. `status: APPROVED` es lo que la pone en vivo. */
export async function saveBrandAction(
  formData: FormData,
): Promise<ActionResult<{ status: string; aviso: string | null }>> {
  try {
    const ctx = await requireContext()
    const clientId = String(formData.get('clientId') ?? '')

    const parsed = z
      .object({
        source: z.enum(['WEBSITE', 'INSTAGRAM', 'UPLOAD', 'MANUAL']),
        sourceUrl: z.string().max(500).nullish(),
        mode: z.enum(['LIGHT', 'DARK']),
        radius: z.coerce.number().int().min(0).max(24),
        safeMode: z.coerce.boolean(),
        status: z.enum(['DRAFT', 'APPROVED']),
        fontHeading: z.string().max(40).nullish(),
        fontBody: z.string().max(40).nullish(),
        version: z.coerce.number().int().min(1).optional(),
        colors: colorsSchema,
        /*
         * Lo que se encontró en el sitio se guarda con la marca. No es para
         * mostrarlo: es el material con el que después se dibuja el mural, y
         * tenerlo evita volver a scrapear el sitio del cliente por gusto.
         */
        siteTitle: z.string().max(300).nullish(),
        fontHints: z.string().max(400).nullish(),
        /* El fondo viaja como URL: el servidor lo vuelve a bajar. */
        fondoUrl: z.string().max(1000).nullish(),
        quitarFondo: z.coerce.boolean().optional(),
        fondoOpacidad: z.coerce.number().int().min(4).max(30).nullish(),
      })
      .parse({
        source: formData.get('source'),
        sourceUrl: String(formData.get('sourceUrl') ?? '') || null,
        mode: formData.get('mode'),
        radius: formData.get('radius') ?? 12,
        safeMode: formData.get('safeMode') === 'on' || formData.get('safeMode') === 'true',
        status: formData.get('status'),
        fontHeading: String(formData.get('fontHeading') ?? '') || null,
        fontBody: String(formData.get('fontBody') ?? '') || null,
        version: formData.get('version') ? Number(formData.get('version')) : undefined,
        colors: JSON.parse(String(formData.get('colors') ?? '{}')) as unknown,
        siteTitle: String(formData.get('siteTitle') ?? '') || null,
        fontHints: String(formData.get('fontHints') ?? '') || null,
        fondoUrl: String(formData.get('fondoUrl') ?? '') || null,
        quitarFondo: formData.get('quitarFondo') === 'true',
        fondoOpacidad: formData.get('fondoOpacidad') ? Number(formData.get('fondoOpacidad')) : null,
      })

    const file = formData.get('logo')
    let logo: { data: Buffer; contentType: string; isDark: boolean } | null = null
    if (file instanceof File && file.size > 0) {
      assertUploadAllowed(file.name, file.type || 'image/png', file.size)
      if (!file.type.startsWith('image/')) throw new ValidationError('El logo tiene que ser una imagen.')
      logo = {
        data: Buffer.from(await file.arrayBuffer()),
        contentType: file.type,
        isDark: formData.get('logoIsDark') === 'true',
      }
    }

    /*
     * Si la descarga del fondo falla, se guarda TODO lo demás igual y se avisa.
     * Perder la paleta recién ajustada porque una imagen no bajó sería castigar
     * al usuario por algo del sitio del cliente.
     */
    let fondo: { data: Buffer; contentType: string; sourceUrl: string } | null = null
    let avisoDelFondo: string | null = null
    if (parsed.fondoUrl && !parsed.quitarFondo) {
      fondo = await descargarFondo(parsed.fondoUrl).catch(() => null)
      if (!fondo) avisoDelFondo = 'No se pudo bajar la imagen de fondo. Se guardó el resto.'
    }

    const result = await saveBrand(ctx, clientId, {
      source: parsed.source,
      sourceUrl: parsed.sourceUrl ?? null,
      colors: parsed.colors,
      fontHeading: parsed.fontHeading ?? null,
      fontBody: parsed.fontBody ?? null,
      radius: parsed.radius,
      mode: parsed.mode,
      safeMode: parsed.safeMode,
      status: parsed.status,
      logo,
      removeLogo: formData.get('removeLogo') === 'true',
      fondo,
      removeFondo: parsed.quitarFondo === true,
      fondoOpacidad: parsed.fondoOpacidad ?? null,
      extractedAt: parsed.source === 'MANUAL' ? null : new Date(),
      version: parsed.version,
      rawExtraction:
        parsed.siteTitle || parsed.fontHints
          ? { siteTitle: parsed.siteTitle, fontHints: parsed.fontHints }
          : undefined,
    })

    revalidatePath(`/clientes/${clientId}`)
    revalidatePath(`/clientes/${clientId}/marca`)
    revalidatePath('/portal')
    return ok({ status: result.status, aviso: avisoDelFondo })
  } catch (error) {
    return fail(error)
  }
}

/**
 * Dibuja el mural del espacio del cliente. Es un pedido de IA, así que cuesta
 * plata: sólo lo puede disparar la agencia, con el mismo tope mensual que el
 * resto de los análisis.
 */
export const drawMuralAction = defineAction(
  z.object({ clientId: z.string().min(1).max(60) }),
  async (input, ctx) => {
    await consumeRateLimit('aiRun', ctx.user.id)
    const insight = await drawBrandMural(ctx, input.clientId)
    revalidatePath(`/clientes/${input.clientId}/marca`)
    revalidatePath('/portal')
    return {
      status: insight.status,
      concepto: insight.outputText,
      motivo: insight.errorMessage,
      costoUsd: insight.costUsd,
    }
  },
)

export const removeMuralAction = defineAction(
  z.object({ clientId: z.string().min(1).max(60) }),
  async (input, ctx) => {
    await removeBrandMural(ctx, input.clientId)
    revalidatePath(`/clientes/${input.clientId}/marca`)
    revalidatePath('/portal')
    return { ok: true }
  },
)

export const resetBrandAction = defineAction(
  z.object({ clientId: z.string().min(1).max(60) }),
  async (input, ctx) => {
    await resetBrand(ctx, input.clientId)
    revalidatePath(`/clientes/${input.clientId}`)
    revalidatePath(`/clientes/${input.clientId}/marca`)
    revalidatePath('/portal')
    return { ok: true }
  },
)
