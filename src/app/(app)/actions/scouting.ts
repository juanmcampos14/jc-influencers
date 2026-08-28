"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import {
  cancelScouting,
  importScoutingResults,
  pollScouting,
  previewScouting,
  setBudget,
  startScouting,
} from '@/lib/repos/scouting'

const id = z.string().min(1).max(60)
const PLATFORM = z.enum(['INSTAGRAM', 'TIKTOK', 'YOUTUBE'])

export const previewScoutingAction = defineAction(
  z.object({
    clientId: id,
    campaignId: id.nullish(),
    mode: z.enum(['DISCOVER', 'ENRICH']),
    platform: PLATFORM,
    keywords: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    urls: z.array(z.string().trim().min(4).max(500)).max(200).optional(),
    limit: z.number().int().min(1).max(500),
    /*
     * Los filtros llegan del navegador, así que se acotan acá: un número
     * absurdo o un texto larguísimo no tienen por qué llegar a la evaluación.
     */
    filtros: z
      .object({
        pais: z.string().trim().max(4).nullish(),
        zona: z.string().trim().max(60).nullish(),
        bioMenciona: z.string().trim().max(60).nullish(),
        seguidoresDesde: z.number().min(0).max(1_000_000_000).nullish(),
        seguidoresHasta: z.number().min(0).max(1_000_000_000).nullish(),
        engagementMinimo: z.number().min(0).max(100).nullish(),
      })
      .nullish(),
    /*
     * Los porcentajes se acotan a 0-100 y los tramos de edad a una lista
     * cerrada: un valor inventado haría fallar el pedido entero al proveedor,
     * y perder los filtros buenos por uno malo es peor que rechazarlo acá.
     */
    audiencia: z
      .object({
        paisDelPublico: z
          .object({ pais: z.string().trim().min(2).max(4), porcentajeMinimo: z.number().min(0).max(100) })
          .nullish(),
        generoDelPublico: z
          .object({ genero: z.enum(['male', 'female']), porcentajeMinimo: z.number().min(0).max(100) })
          .nullish(),
        edadDelPublico: z
          .object({
            tramos: z.array(z.enum(['13-17', '18-24', '25-34', '35-44', '45-64', '65+'])).max(7),
            porcentajeMinimo: z.number().min(0).max(100),
          })
          .nullish(),
        calidadMinima: z.number().min(0).max(100).nullish(),
      })
      .nullish(),
  }),
  async (input, ctx) =>
    previewScouting(ctx, {
      clientId: input.clientId,
      campaignId: input.campaignId ?? null,
      mode: input.mode,
      platform: input.platform,
      keywords: input.keywords,
      filtros: input.filtros ?? null,
      audiencia: input.audiencia ?? null,
      urls: input.urls,
      limit: input.limit,
    }),
)

export const startScoutingAction = defineAction(z.object({ runId: id }), async (input, ctx) => {
  const result = await startScouting(ctx, input.runId)
  revalidatePath('/influencers/buscar')
  return result
})

export const pollScoutingAction = defineAction(z.object({ runId: id }), async (input, ctx) =>
  pollScouting(ctx, input.runId),
)

export const cancelScoutingAction = defineAction(z.object({ runId: id }), async (input, ctx) => {
  await cancelScouting(ctx, input.runId)
  revalidatePath('/influencers/buscar')
  return { ok: true }
})

export const importScoutingResultsAction = defineAction(
  z.object({ runId: id, resultIds: z.array(id).min(1).max(300), campaignId: id.nullish() }),
  async (input, ctx) => {
    const result = await importScoutingResults(ctx, input.runId, input.resultIds, input.campaignId ?? null)
    revalidatePath('/influencers/buscar')
    // La corrida que termina alimenta la base: esa lista también cambió.
    revalidatePath('/influencers/descubiertos')
    revalidatePath('/influencers')
    if (input.campaignId) revalidatePath(`/campanas/${input.campaignId}`)
    return result
  },
)

export const setScoutingBudgetAction = defineAction(
  z.object({ clientId: id.nullish(), limitUsd: z.number().min(0).max(100_000) }),
  async (input, ctx) => {
    await setBudget(ctx, { clientId: input.clientId ?? null, limitUsd: input.limitUsd })
    revalidatePath('/influencers/buscar')
    // La corrida que termina alimenta la base: esa lista también cambió.
    revalidatePath('/influencers/descubiertos')
    return { ok: true }
  },
)
