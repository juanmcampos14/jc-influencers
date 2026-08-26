import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { env } from '@/lib/env'

/**
 * Análisis con IA.
 *
 * Dos reglas de diseño que atraviesan todo este archivo:
 *
 *  1. **El modelo sólo razona sobre datos que tenemos.** Cada llamada recibe un
 *     bloque explícito con lo que se sabe, y la instrucción de decir "no hay
 *     dato" en vez de completar el hueco. Un análisis que inventa seguidores es
 *     peor que no tener análisis.
 *  2. **La salida es estructurada y se guarda con su procedencia**: modelo,
 *     versión del prompt y qué datos entraron. Así siempre se puede explicar de
 *     dónde salió una recomendación.
 */

export const PROMPT_VERSION = '2026-08-25.1'

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiUnavailableError'
  }
}

// ── Esquemas de salida ───────────────────────────────────────────────────────

export const profileFitSchema = z.object({
  fitScore: z.number().int().min(1).max(5).describe('Qué tan bien encaja el perfil con el brief, de 1 a 5.'),
  veredicto: z.string().max(400).describe('Una o dos frases con la conclusión, en español rioplatense.'),
  razones: z.array(z.string().max(300)).max(6).describe('Por qué encaja. Cada razón se apoya en un dato concreto del material provisto.'),
  riesgos: z.array(z.string().max(300)).max(6).describe('Qué mirar antes de avanzar: dudas, señales de alerta, cosas a verificar.'),
  datosFaltantes: z.array(z.string().max(200)).max(8).describe('Qué información falta para poder decidir con más certeza.'),
  ideasDeContenido: z.array(z.string().max(300)).max(5).describe('Ideas de contenido concretas para este perfil y esta marca.'),
})

export const creativeIdeasSchema = z.object({
  conceptoGeneral: z.string().max(600).describe('El concepto creativo que une toda la campaña.'),
  ideas: z
    .array(
      z.object({
        titulo: z.string().max(120),
        formato: z.string().max(60).describe('Reel, story, TikTok, carrusel, video largo.'),
        cluster: z.string().max(80).nullable().describe('Cluster del brief al que apunta, si aplica.'),
        descripcion: z.string().max(600),
        porQueFunciona: z.string().max(400),
      }),
    )
    .max(10),
  queEvitar: z.array(z.string().max(300)).max(6).describe('Qué NO hacer, según los criterios de exclusión del brief.'),
})

export const campaignAnalysisSchema = z.object({
  resumen: z.string().max(800).describe('Estado de la campaña en dos o tres frases.'),
  loQueVaBien: z.array(z.string().max(300)).max(6),
  loQuePreocupa: z.array(z.string().max(300)).max(6),
  desviosDelBrief: z.array(z.string().max(300)).max(6).describe('En qué se está apartando el squad de lo que pedía el brief.'),
  proximosPasos: z.array(z.string().max(300)).max(6).describe('Acciones concretas, en orden de prioridad.'),
  datosFaltantes: z.array(z.string().max(200)).max(8),
})

export type ProfileFit = z.infer<typeof profileFitSchema>
export type CreativeIdeas = z.infer<typeof creativeIdeasSchema>
export type CampaignAnalysis = z.infer<typeof campaignAnalysisSchema>

// ── Puerto ───────────────────────────────────────────────────────────────────

export type AiUsage = { inputTokens: number; outputTokens: number; costUsd: number; model: string }
export type AiResult<T> = { output: T; usage: AiUsage }

export interface AiProvider {
  readonly name: string
  readonly configured: boolean
  readonly model: string
  analyzeProfileFit(input: { brief: string; profile: string }): Promise<AiResult<ProfileFit>>
  suggestCreatives(input: { brief: string; squad: string }): Promise<AiResult<CreativeIdeas>>
  analyzeCampaign(input: { brief: string; state: string }): Promise<AiResult<CampaignAnalysis>>
  writeCampaignReport(input: { brief: string; state: string; audience: 'AGENCIA' | 'CLIENTE' }): Promise<AiResult<string>>
}

const NOT_CONFIGURED =
  'El análisis con IA no está configurado. Cargá ANTHROPIC_API_KEY para habilitarlo.'

class UnconfiguredAiProvider implements AiProvider {
  readonly name = 'sin configurar'
  readonly configured = false
  readonly model = '—'
  async analyzeProfileFit(): Promise<never> {
    throw new AiUnavailableError(NOT_CONFIGURED)
  }
  async suggestCreatives(): Promise<never> {
    throw new AiUnavailableError(NOT_CONFIGURED)
  }
  async analyzeCampaign(): Promise<never> {
    throw new AiUnavailableError(NOT_CONFIGURED)
  }
  async writeCampaignReport(): Promise<never> {
    throw new AiUnavailableError(NOT_CONFIGURED)
  }
}

/**
 * Recorta la respuesta a los límites declarados en el esquema.
 *
 * Los `maxLength` y `maxItems` son una guía de estilo para el modelo, no un
 * requisito de corrección. Descartar un análisis pago entero porque una viñeta
 * salió veinte caracteres más larga sería tirar plata y trabajo: se recorta y
 * sigue. Lo que sí se valida estrictamente después es la ESTRUCTURA.
 */
function clampToSchema(value: unknown, schema: Record<string, unknown>): unknown {
  const type = schema.type

  if (type === 'string' && typeof value === 'string') {
    const max = typeof schema.maxLength === 'number' ? schema.maxLength : null
    if (max !== null && value.length > max) {
      // Se corta en el último espacio para no partir una palabra al medio.
      const cut = value.slice(0, max)
      const lastSpace = cut.lastIndexOf(' ')
      return lastSpace > max * 0.7 ? `${cut.slice(0, lastSpace)}…` : cut
    }
    return value
  }

  if (type === 'array' && Array.isArray(value)) {
    const max = typeof schema.maxItems === 'number' ? schema.maxItems : null
    const items = (schema.items ?? {}) as Record<string, unknown>
    const trimmed = max !== null ? value.slice(0, max) : value
    return trimmed.map((entry) => clampToSchema(entry, items))
  }

  if (type === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = properties[key] ? clampToSchema(entry, properties[key]) : entry
    }
    return out
  }

  return value
}

/** Expuesto sólo para los tests. */
export const __clampToSchemaForTests = clampToSchema

/** Precio por millón de tokens de Claude Opus 5. */
const PRICE_PER_MTOK = { input: 5, output: 25 }

const SYSTEM_BASE = `Sos el analista de una agencia argentina de marketing de influencers.
Escribís en español rioplatense, directo y sin adornos. Tuteás.

Reglas que no se negocian:
- Trabajás SÓLO con los datos que te paso. Si falta un dato, lo decís en "datosFaltantes"; nunca lo completás con una suposición.
- No inventás cifras de seguidores, engagement ni audiencia. Si un número no está, no existe.
- Cuando un dato viene marcado como "sin verificar" o "desactualizado", lo tratás como tal y lo aclarás.
- Sos concreto: cada afirmación se apoya en algo del material.
- No adules ni exageres. Si un perfil no encaja, lo decís.`

class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic'
  readonly configured = true
  private readonly client: Anthropic

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 })
  }

  private usage(response: { usage: { input_tokens: number; output_tokens: number } }): AiUsage {
    const inputTokens = response.usage.input_tokens
    const outputTokens = response.usage.output_tokens
    return {
      inputTokens,
      outputTokens,
      costUsd:
        (inputTokens / 1_000_000) * PRICE_PER_MTOK.input + (outputTokens / 1_000_000) * PRICE_PER_MTOK.output,
      model: this.model,
    }
  }

  /**
   * Pide una salida con forma fija.
   *
   * El esquema se declara en Zod (una sola fuente de verdad) y se traduce a JSON
   * Schema para el modelo. La respuesta se vuelve a validar con el MISMO esquema
   * de Zod antes de devolverse: la garantía del formato no se delega, se comprueba.
   */
  private async structured<T extends z.ZodTypeAny>(
    schema: T,
    schemaName: string,
    system: string,
    prompt: string,
    effort: 'low' | 'medium' | 'high' = 'medium',
  ): Promise<AiResult<z.infer<T>>> {
    const jsonSchema = zodToJsonSchema(schema, { name: schemaName, target: 'openApi3' })
    const definition = (jsonSchema.definitions?.[schemaName] ?? jsonSchema) as Record<string, unknown>

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 16_000,
      system,
      thinking: { type: 'adaptive' },
      output_config: {
        effort,
        format: jsonSchemaOutputFormat({ ...definition, type: 'object' } as never),
      },
      messages: [{ role: 'user', content: prompt }],
    })

    if (response.stop_reason === 'refusal') {
      throw new AiUnavailableError('El modelo declinó responder a este pedido.')
    }
    if (!response.parsed_output) {
      throw new AiUnavailableError('El modelo no devolvió una respuesta con el formato esperado.')
    }

    const clamped = clampToSchema(response.parsed_output, { ...definition, type: 'object' })
    const validated = schema.safeParse(clamped)
    if (!validated.success) {
      // El detalle va al registro del análisis, que sólo ve la agencia.
      const detail = validated.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || 'raíz'}: ${issue.message}`)
        .join(' · ')
      throw new AiUnavailableError(`La respuesta del modelo no cumple el formato esperado (${detail}).`)
    }
    return { output: validated.data as z.infer<T>, usage: this.usage(response) }
  }

  async analyzeProfileFit(input: { brief: string; profile: string }): Promise<AiResult<ProfileFit>> {
    return this.structured(
      profileFitSchema,
      'AnalisisDePerfil',
      SYSTEM_BASE,
      `Evaluá si este perfil encaja con el brief de la campaña.

## Brief de la campaña
${input.brief}

## Perfil a evaluar
${input.profile}

Devolvé el análisis en el formato pedido.`,
    )
  }

  async suggestCreatives(input: { brief: string; squad: string }): Promise<AiResult<CreativeIdeas>> {
    return this.structured(
      creativeIdeasSchema,
      'IdeasCreativas',
      SYSTEM_BASE,
      `Proponé ideas de contenido para esta campaña, pensando en los perfiles que ya están seleccionados.

## Brief de la campaña
${input.brief}

## Squad seleccionado
${input.squad}

Las ideas tienen que ser ejecutables por estos perfiles concretos, no genéricas.
Respetá los criterios de exclusión del brief.`,
      'high',
    )
  }

  async analyzeCampaign(input: { brief: string; state: string }): Promise<AiResult<CampaignAnalysis>> {
    return this.structured(
      campaignAnalysisSchema,
      'AnalisisDeCampania',
      SYSTEM_BASE,
      `Analizá cómo viene esta campaña contra lo que pedía el brief.

## Brief de la campaña
${input.brief}

## Estado actual
${input.state}

Prestá atención a la distribución del squad por cluster, a los perfiles que están trabados
esperando una decisión, y a los que tienen métricas sin verificar.`,
      'high',
    )
  }

  async writeCampaignReport(input: {
    brief: string
    state: string
    audience: 'AGENCIA' | 'CLIENTE'
  }): Promise<AiResult<string>> {
    const forClient = input.audience === 'CLIENTE'
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16_000,
      system: `${SYSTEM_BASE}

Escribís un reporte en Markdown, listo para leer.
${
  forClient
    ? 'El destinatario es el CLIENTE. No menciones márgenes, costos internos, notas internas ni cómo trabaja la agencia por dentro. Hablá de resultados y de próximos pasos.'
    : 'El destinatario es el equipo interno de la agencia. Podés ser franco sobre lo que no está funcionando.'
}
Usá encabezados de nivel 2 y 3, listas cortas y tablas sólo si aportan.
No inventes números: si un dato no está, decilo.`,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      messages: [
        {
          role: 'user',
          content: `Escribí el reporte de esta campaña.

## Brief de la campaña
${input.brief}

## Estado actual
${input.state}`,
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      throw new AiUnavailableError('El modelo declinó responder a este pedido.')
    }
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()
    if (!text) throw new AiUnavailableError('El modelo devolvió una respuesta vacía.')
    return { output: text, usage: this.usage(response) }
  }
}

let cached: AiProvider | null = null

export function aiProvider(): AiProvider {
  if (cached) return cached
  const config = env()
  cached = config.ANTHROPIC_API_KEY
    ? new AnthropicProvider(config.ANTHROPIC_API_KEY, config.ANTHROPIC_MODEL)
    : new UnconfiguredAiProvider()
  return cached
}

/** Sólo para tests. */
export function __setAiProviderForTests(provider: AiProvider | null): void {
  cached = provider
}
