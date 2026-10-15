import 'server-only'
import { createHash } from 'node:crypto'
import type { AiInsightKind } from '@/generated/prisma/enums'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import { env } from '@/lib/env'
import { withSystemScope } from '@/lib/db/scope'
import { aiProvider, AiUnavailableError, PROMPT_VERSION } from '@/lib/ports/ai'
import { sanitizeMuralSvg } from '@/lib/domain/mural'
import { buildBriefContext, buildCampaignState, buildProfileContext } from './ai-context'
import { contextoDeResultados, resumirResultados } from './reporting'
import { contextoDeObjetivos, getObjetivos } from './objetivos'
import { actorOf, scoped } from './base'

const AI_TIMEOUT_MS = 180_000

export type InsightDto = {
  id: string
  kind: AiInsightKind
  status: string
  model: string
  promptVersion: string
  inputsSummary: unknown
  output: unknown
  outputText: string | null
  errorMessage: string | null
  costUsd: number | null
  clientVisible: boolean
  createdAt: string
  finishedAt: string | null
}

function toDto(row: {
  id: string
  kind: AiInsightKind
  status: string
  model: string
  promptVersion: string
  inputsSummary: unknown
  output: unknown
  outputText: string | null
  errorMessage: string | null
  costUsd: unknown
  clientVisible: boolean
  createdAt: Date
  finishedAt: Date | null
}): InsightDto {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    model: row.model,
    promptVersion: row.promptVersion,
    inputsSummary: row.inputsSummary,
    output: row.output,
    outputText: row.outputText,
    errorMessage: row.errorMessage,
    costUsd: row.costUsd === null || row.costUsd === undefined ? null : Number(row.costUsd),
    clientVisible: row.clientVisible,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  }
}

const currentPeriod = (now = new Date()): string => now.toISOString().slice(0, 7)

/**
 * Gasto de IA del mes en curso, en dólares.
 *
 * El tope es de la agencia, así que el gasto también tiene que serlo: leído
 * bajo el alcance del usuario, RLS lo recortaba a sus clientes y cada persona
 * veía una fracción del total mientras el tope global se pasaba sin que nadie
 * lo notara. Sólo sale de acá un número agregado.
 */
export async function aiSpendThisMonth(_ctx: AuthContext): Promise<{ spent: number; limit: number }> {
  const from = new Date(`${currentPeriod()}-01T00:00:00.000Z`)
  const rows = await withSystemScope((tx) =>
    tx.aiInsight.findMany({
      where: { createdAt: { gte: from } },
      select: { costUsd: true, status: true },
    }),
  )
  /*
   * Un análisis que falló o que todavía corre tiene `costUsd` en null y suma
   * cero, pero puede haber consumido tokens igual. El número no puede quedar
   * por debajo del gasto real sin decirlo, así que lo que no tiene costo
   * cargado cuenta como el promedio de lo que sí lo tiene.
   */
  const conCosto = rows.filter((row) => row.costUsd !== null)
  const cerrado = conCosto.reduce((sum, row) => sum + Number(row.costUsd ?? 0), 0)
  const promedio = conCosto.length > 0 ? cerrado / conCosto.length : 0
  const estimado = (rows.length - conCosto.length) * promedio
  return { spent: cerrado + estimado, limit: env().AI_MONTHLY_LIMIT_USD }
}

async function assertAiBudget(ctx: AuthContext): Promise<void> {
  const { spent, limit } = await aiSpendThisMonth(ctx)
  if (limit > 0 && spent >= limit) {
    throw new ValidationError({ clave: 'topeDeIaAlcanzado', valores: { tope: limit.toFixed(2) } })
  }
}

type RunOptions = {
  clientId: string
  campaignId?: string | null
  candidacyId?: string | null
  kind: AiInsightKind
  inputsSummary: Record<string, unknown>
  inputsDigest: string
}

/**
 * Ejecuta un análisis y lo guarda con toda su procedencia.
 * Si el proveedor falla, el registro queda en FAILED con el motivo: no se
 * pierde el intento ni se muestra un resultado a medias.
 */
async function runInsight<T>(
  ctx: AuthContext,
  options: RunOptions,
  work: () => Promise<{ output: T; usage: { inputTokens: number; outputTokens: number; costUsd: number; model: string } }>,
  asText?: (output: T) => string | null,
): Promise<InsightDto> {
  const provider = aiProvider()
  if (!provider.configured) throw new AiUnavailableError('El análisis con IA no está configurado.')
  await assertAiBudget(ctx)

  const created = await scoped(ctx, (tx) =>
    tx.aiInsight.create({
      data: {
        clientId: options.clientId,
        campaignId: options.campaignId ?? null,
        candidacyId: options.candidacyId ?? null,
        kind: options.kind,
        status: 'RUNNING',
        model: provider.model,
        promptVersion: PROMPT_VERSION,
        inputsSummary: options.inputsSummary as never,
        inputsDigest: options.inputsDigest,
        createdById: ctx.user.id,
      },
    }),
  )

  try {
    const result = await work()
    const row = await scoped(ctx, async (tx) => {
      const updated = await tx.aiInsight.update({
        where: { id: created.id },
        data: {
          status: 'READY',
          output: (typeof result.output === 'string' ? null : (result.output as never)) ?? undefined,
          outputText: typeof result.output === 'string' ? result.output : (asText?.(result.output) ?? null),
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costUsd: result.usage.costUsd.toFixed(6),
          finishedAt: new Date(),
        },
      })
      await recordAudit(tx, actorOf(ctx), {
        action: AUDIT.AI_INSIGHT_CREATED,
        entityType: 'AiInsight',
        entityId: created.id,
        clientId: options.clientId,
        metadata: {
          kind: options.kind,
          modelo: result.usage.model,
          costoUsd: Number(result.usage.costUsd.toFixed(6)),
          tokens: result.usage.inputTokens + result.usage.outputTokens,
        },
      })
      return updated
    })
    return toDto(row)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido del proveedor.'
    const row = await scoped(ctx, (tx) =>
      tx.aiInsight.update({
        where: { id: created.id },
        data: { status: 'FAILED', errorMessage: message.slice(0, 500), finishedAt: new Date() },
      }),
    )
    return toDto(row)
  }
}

const digest = (parts: unknown[]): string =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32)

// ── Análisis disponibles ─────────────────────────────────────────────────────

export async function analyzeProfileFit(ctx: AuthContext, candidacyId: string): Promise<InsightDto> {
  const candidacy = await scoped(ctx, (tx) =>
    tx.candidacy.findUnique({
      where: { id: candidacyId },
      select: { clientId: true, campaignId: true, influencer: { select: { displayName: true } } },
    }),
  )
  if (!candidacy) throw new NotFoundError()
  assertClientInScope(ctx, candidacy.clientId)
  assertCan(ctx, 'ai.run', candidacy.clientId)

  const { brief, profile } = await scoped(
    ctx,
    async (tx) => ({
      brief: await buildBriefContext(tx, candidacy.campaignId),
      profile: await buildProfileContext(tx, candidacyId),
    }),
    AI_TIMEOUT_MS,
  )

  return runInsight(
    ctx,
    {
      clientId: candidacy.clientId,
      campaignId: candidacy.campaignId,
      candidacyId,
      kind: 'PROFILE_FIT',
      inputsSummary: {
        perfil: candidacy.influencer.displayName,
        briefIncluido: !brief.includes('todavía no tiene brief'),
        caracteresDeContexto: brief.length + profile.length,
      },
      inputsDigest: digest([brief, profile, PROMPT_VERSION]),
    },
    () => aiProvider().analyzeProfileFit({ brief, profile }),
    (output) => output.veredicto,
  )
}

export async function suggestCreatives(ctx: AuthContext, campaignId: string): Promise<InsightDto> {
  const campaign = await scoped(ctx, (tx) =>
    tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true, name: true } }),
  )
  if (!campaign) throw new NotFoundError()
  assertClientInScope(ctx, campaign.clientId)
  assertCan(ctx, 'ai.run', campaign.clientId)

  const { brief, squad } = await scoped(
    ctx,
    async (tx) => ({
      brief: await buildBriefContext(tx, campaignId),
      squad: await buildCampaignState(tx, campaignId),
    }),
    AI_TIMEOUT_MS,
  )

  return runInsight(
    ctx,
    {
      clientId: campaign.clientId,
      campaignId,
      kind: 'CREATIVE_IDEAS',
      inputsSummary: { campania: campaign.name, caracteresDeContexto: brief.length + squad.length },
      inputsDigest: digest([brief, squad, PROMPT_VERSION]),
    },
    () => aiProvider().suggestCreatives({ brief, squad }),
    (output) => output.conceptoGeneral,
  )
}

export async function analyzeCampaign(ctx: AuthContext, campaignId: string): Promise<InsightDto> {
  const campaign = await scoped(ctx, (tx) =>
    tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true, name: true } }),
  )
  if (!campaign) throw new NotFoundError()
  assertClientInScope(ctx, campaign.clientId)
  assertCan(ctx, 'ai.run', campaign.clientId)

  const { brief, state } = await scoped(
    ctx,
    async (tx) => ({
      brief: await buildBriefContext(tx, campaignId),
      state: await buildCampaignState(tx, campaignId),
    }),
    AI_TIMEOUT_MS,
  )

  return runInsight(
    ctx,
    {
      clientId: campaign.clientId,
      campaignId,
      kind: 'CAMPAIGN_ANALYSIS',
      inputsSummary: { campania: campaign.name, caracteresDeContexto: brief.length + state.length },
      inputsDigest: digest([brief, state, PROMPT_VERSION]),
    },
    () => aiProvider().analyzeCampaign({ brief, state }),
    (output) => output.resumen,
  )
}

export async function writeCampaignReport(
  ctx: AuthContext,
  campaignId: string,
  audience: 'AGENCIA' | 'CLIENTE',
): Promise<InsightDto> {
  const campaign = await scoped(ctx, (tx) =>
    tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true, name: true } }),
  )
  if (!campaign) throw new NotFoundError()
  assertClientInScope(ctx, campaign.clientId)
  assertCan(ctx, 'ai.run', campaign.clientId)
  // Un reporte para el cliente puede llevar cifras: sólo lo pide quien las ve.
  if (audience === 'CLIENTE') assertCan(ctx, 'candidate.view', campaign.clientId)

  const { brief, state } = await scoped(
    ctx,
    async (tx) => ({
      brief: await buildBriefContext(tx, campaignId),
      state: await buildCampaignState(tx, campaignId),
    }),
    AI_TIMEOUT_MS,
  )

  /*
   * Los resultados medidos entran al mismo reporte, con sus huecos declarados.
   * Antes el reporte sólo sabía a quién se eligió y en qué etapa estaba: podía
   * contar cómo venía la campaña, no qué pasó cuando salió al aire.
   *
   * Se agrega al final y no reemplaza nada: sin entregas cargadas, el bloque
   * dice que no hay nada medido, que es exactamente lo que el reporte tiene que
   * decir en ese caso.
   */
  const resumen = await resumirResultados(ctx, campaignId)
  /*
   * Los objetivos entran al reporte porque son la única forma de que la IA
   * pueda decir si algo estuvo BIEN. Sin ellos podía contar qué pasó -- 12.400
   * visualizaciones -- y no si eso era mucho o poco para esta campaña.
   */
  const objetivos = await getObjetivos(ctx, campaignId).catch(() => null)
  const estadoConResultados = [
    state,
    '\n# Resultados medidos',
    contextoDeResultados(resumen),
    objetivos ? `\n# Objetivos\n${contextoDeObjetivos(objetivos)}` : '',
  ].join('\n')

  return runInsight(
    ctx,
    {
      clientId: campaign.clientId,
      campaignId,
      kind: 'CAMPAIGN_REPORT',
      inputsSummary: {
        campania: campaign.name,
        destinatario: audience,
        publicacionesCargadas: resumen.publicaciones.total,
        clicsMedidos: resumen.clics.total,
        huecos: resumen.huecos.length,
        objetivos: objetivos?.objetivos.length ?? 0,
      },
      inputsDigest: digest([brief, estadoConResultados, audience, PROMPT_VERSION]),
    },
    () => aiProvider().writeCampaignReport({ brief, state: estadoConResultados, audience }),
  )
}

// ── Lectura y compartido ─────────────────────────────────────────────────────

export async function listInsights(
  ctx: AuthContext,
  filters: { campaignId?: string | null; candidacyId?: string | null },
): Promise<InsightDto[]> {
  const anchor = filters.candidacyId
    ? await scoped(ctx, (tx) =>
        tx.candidacy.findUnique({ where: { id: filters.candidacyId as string }, select: { clientId: true } }),
      )
    : filters.campaignId
      ? await scoped(ctx, (tx) =>
          tx.campaign.findUnique({ where: { id: filters.campaignId as string }, select: { clientId: true } }),
        )
      : null
  if (!anchor) throw new NotFoundError()
  assertClientInScope(ctx, anchor.clientId)
  assertCan(ctx, 'ai.view', anchor.clientId)

  const rows = await scoped(ctx, (tx) =>
    tx.aiInsight.findMany({
      where: {
        ...(filters.candidacyId ? { candidacyId: filters.candidacyId } : { campaignId: filters.campaignId }),
        // El cliente sólo ve lo que la agencia compartió explícitamente.
        ...(ctx.side === 'CLIENT' ? { clientVisible: true, status: 'READY' as const } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  )
  return rows.map(toDto)
}

export async function shareInsight(ctx: AuthContext, insightId: string, visible: boolean): Promise<void> {
  if (ctx.side !== 'AGENCY') throw new ForbiddenError({ clave: 'soloAgenciaComparteAnalisis' })
  const row = await scoped(ctx, (tx) => tx.aiInsight.findUnique({ where: { id: insightId } }))
  if (!row) throw new NotFoundError()
  assertClientInScope(ctx, row.clientId)
  assertCan(ctx, 'ai.run', row.clientId)
  if (visible && row.status !== 'READY') throw new ValidationError({ clave: 'soloAnalisisTerminado' })

  await scoped(ctx, async (tx) => {
    await tx.aiInsight.update({ where: { id: insightId }, data: { clientVisible: visible } })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.AI_INSIGHT_SHARED,
      entityType: 'AiInsight',
      entityId: insightId,
      clientId: row.clientId,
      after: { clientVisible: visible },
    })
  })
}

/**
 * Dibuja el mural de fondo del espacio de un cliente.
 *
 * El dibujo lo hace un modelo y se muestra en la pantalla de otra persona, así
 * que entre una cosa y la otra pasa por `sanitizeMuralSvg`. Si de ahí no sale
 * nada dibujable, el intento queda en FAILED con el motivo y la marca se queda
 * como estaba: nunca se guarda un SVG a medio revisar.
 */
export async function drawBrandMural(ctx: AuthContext, clientId: string): Promise<InsightDto> {
  assertClientInScope(ctx, clientId)
  assertCan(ctx, 'ai.run', clientId)

  const client = await scoped(ctx, (tx) => tx.client.findUnique({ where: { id: clientId }, select: { name: true } }))
  if (!client) throw new NotFoundError()

  const brand = await scoped(ctx, (tx) => tx.clientBrand.findUnique({ where: { clientId } }))
  if (!brand) {
    throw new ValidationError({ clave: 'muralSinIdentidad' })
  }

  const contexto = buildMuralContext(client.name, brand.sourceUrl, brand.rawExtraction)
  const input = {
    marca: client.name,
    contexto,
    paleta: {
      primary: brand.primary,
      accent: brand.accent,
      surface: brand.surface,
      text: brand.text,
      muted: brand.muted,
    },
    modo: brand.mode,
  }

  const insight = await runInsight(
    ctx,
    {
      clientId,
      kind: 'BRAND_MURAL',
      inputsSummary: { marca: client.name, sitio: brand.sourceUrl, caracteresDeContexto: contexto.length },
      inputsDigest: digest([contexto, brand.primary, brand.accent, brand.mode, PROMPT_VERSION]),
    },
    async () => {
      const result = await aiProvider().drawBrandMural(input)
      // Se sanea ACÁ adentro: si el SVG no pasa, el intento se registra como
      // fallido igual que un error del proveedor, con el motivo a la vista.
      const svg = sanitizeMuralSvg(result.output.svg)
      return { output: { ...result.output, svg }, usage: result.usage }
    },
    (output) => output.concepto,
  )

  if (insight.status !== 'READY') return insight

  const output = insight.output as { svg: string; alt: string } | null
  if (!output?.svg) return insight

  await scoped(ctx, async (tx) => {
    await tx.clientBrand.update({
      where: { clientId },
      data: { muralSvg: output.svg, muralAlt: output.alt, muralGeneratedAt: new Date() },
    })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.BRAND_MURAL_DRAWN,
      entityType: 'ClientBrand',
      entityId: clientId,
      clientId,
      metadata: { insightId: insight.id, bytes: output.svg.length },
    })
  })

  return insight
}

/** Saca el mural. La marca queda con su paleta y sin fondo ilustrado. */
export async function removeBrandMural(ctx: AuthContext, clientId: string): Promise<void> {
  assertClientInScope(ctx, clientId)
  assertCan(ctx, 'brand.manage', clientId)
  await scoped(ctx, async (tx) => {
    await tx.clientBrand.updateMany({
      where: { clientId },
      data: { muralSvg: null, muralAlt: null, muralGeneratedAt: null },
    })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.BRAND_MURAL_REMOVED,
      entityType: 'ClientBrand',
      entityId: clientId,
      clientId,
    })
  })
}

/**
 * Lo que sabemos de la marca, en texto plano para el ilustrador.
 *
 * Sale de lo que ya se extrajo del sitio -- no se scrapea de nuevo -- y si no
 * hay nada, se dice que no hay nada: el prompt le pide dibujar igual, no
 * completar el hueco con una fantasía sobre el negocio del cliente.
 */
function buildMuralContext(name: string, sourceUrl: string | null, raw: unknown): string {
  const partes: string[] = [`Nombre: ${name}`]
  if (sourceUrl) partes.push(`Sitio: ${sourceUrl}`)

  const datos = (raw ?? {}) as Record<string, unknown>
  const titulo = typeof datos.siteTitle === 'string' ? datos.siteTitle : null
  const tipografias = typeof datos.fontHints === 'string' ? datos.fontHints : null

  if (titulo) partes.push(`Cómo se presenta el sitio: ${titulo}`)
  if (tipografias) partes.push(`Tipografías de la marca: ${tipografias}`)

  if (!titulo && !tipografias) {
    partes.push('No tenemos material del sitio: sólo el nombre y la paleta.')
  }
  return partes.join('\n')
}
