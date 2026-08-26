"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { borrarEntrega, guardarEntrega } from '@/lib/repos/entregas'
import { archivarLink, crearLink } from '@/lib/repos/links'

const id = z.string().min(1).max(60)

/** Vacío es "no hay dato", no cero. Esa distinción es todo el reporting. */
const metrica = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((valor) => {
    if (valor === null || valor === undefined) return null
    const texto = String(valor).trim()
    if (!texto) return null
    const numero = Number(texto)
    return Number.isFinite(numero) && numero >= 0 ? Math.round(numero) : null
  })

export const guardarEntregaAction = defineAction(
  z.object({
    campaignId: id,
    deliverableId: z.string().max(60).nullish(),
    candidacyId: id,
    type: z.enum(['STORY', 'REEL', 'POST', 'TIKTOK', 'VIDEO', 'YOUTUBE_VIDEO', 'LIVE', 'OTHER']),
    status: z.enum(['PENDING', 'IN_PRODUCTION', 'FOR_APPROVAL', 'APPROVED', 'PUBLISHED', 'CANCELLED']),
    description: z.string().trim().max(500).nullish(),
    url: z.string().trim().max(600).nullish(),
    publishedAt: z.string().max(30).nullish(),
    views: metrica,
    likes: metrica,
    comments: metrica,
    shares: metrica,
    saves: metrica,
    reach: metrica,
    metricsSource: z.enum(['MANUAL', 'SCREENSHOT', 'PROVIDER']).nullish(),
  }),
  async (input, ctx) => {
    const guardada = await guardarEntrega(ctx, input.campaignId, input.deliverableId || null, {
      candidacyId: input.candidacyId,
      type: input.type,
      status: input.status,
      description: input.description ?? null,
      url: input.url || null,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
      views: input.views,
      likes: input.likes,
      comments: input.comments,
      shares: input.shares,
      saves: input.saves,
      reach: input.reach,
      metricsSource: input.metricsSource ?? null,
    })
    revalidatePath(`/campanas/${input.campaignId}`)
    revalidatePath('/portal')
    return guardada
  },
)

export const borrarEntregaAction = defineAction(
  z.object({ deliverableId: id, campaignId: id }),
  async (input, ctx) => {
    await borrarEntrega(ctx, input.deliverableId)
    revalidatePath(`/campanas/${input.campaignId}`)
    return { ok: true }
  },
)

export const crearLinkAction = defineAction(
  z.object({
    campaignId: id,
    destination: z.string().trim().min(1, 'Escribí a dónde lleva el link.').max(600),
    label: z.string().trim().max(120).nullish(),
    candidacyId: z.string().max(60).nullish(),
    source: z.string().trim().min(1).max(60),
    medium: z.string().trim().min(1).max(60),
    campaign: z.string().trim().min(1).max(60),
    content: z.string().trim().max(60).nullish(),
    term: z.string().trim().max(60).nullish(),
  }),
  async (input, ctx) => {
    const creado = await crearLink(ctx, input.campaignId, {
      destination: input.destination,
      label: input.label ?? null,
      candidacyId: input.candidacyId || null,
      utm: {
        source: input.source,
        medium: input.medium,
        campaign: input.campaign,
        content: input.content ?? null,
        term: input.term ?? null,
      },
    })
    revalidatePath(`/campanas/${input.campaignId}`)
    return creado
  },
)

export const archivarLinkAction = defineAction(
  z.object({ linkId: id, campaignId: id, archivado: z.boolean() }),
  async (input, ctx) => {
    await archivarLink(ctx, input.linkId, input.archivado)
    revalidatePath(`/campanas/${input.campaignId}`)
    return { ok: true }
  },
)
