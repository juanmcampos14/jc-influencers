"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { changeCampaignStatus, createCampaign, updateCampaign, upsertBrief } from '@/lib/repos/campaigns'

const CAMPAIGN_STATUS = z.enum([
  'DRAFT',
  'BRIEFING',
  'SCOUTING',
  'PROPOSAL',
  'NEGOTIATION',
  'PRODUCTION',
  'LIVE',
  'CLOSED',
  'CANCELLED',
])

const dateField = z
  .string()
  .trim()
  .max(30)
  .nullish()
  .transform((value) => (value ? new Date(`${value}T00:00:00`) : null))
  .refine((value) => value === null || !Number.isNaN(value.getTime()), 'Fecha inválida.')

const campaignFields = {
  name: z.string().trim().min(2, 'nombreObligatorio').max(160),
  description: z.string().trim().max(4000).nullish(),
  objective: z.string().trim().max(2000).nullish(),
  status: CAMPAIGN_STATUS.optional(),
  countries: z.array(z.string().trim().max(40)).max(30).optional(),
  platforms: z.array(z.string().trim().max(30)).max(20).optional(),
  startDate: dateField,
  endDate: dateField,
  currency: z.string().trim().length(3).toUpperCase().optional(),
  budgetEstimated: z.number().nonnegative().max(99_999_999_999).nullish(),
  budgetCache: z.number().nonnegative().max(99_999_999_999).nullish(),
  barterDescription: z.string().trim().max(2000).nullish(),
}

export const createCampaignAction = defineAction(
  z.object({ clientId: z.string().min(1).max(60), ...campaignFields }),
  async (input, ctx) => {
    const { clientId, ...rest } = input
    const result = await createCampaign(ctx, clientId, rest)
    revalidatePath('/campanas')
    return result
  },
)

export const updateCampaignAction = defineAction(
  z.object({ campaignId: z.string().min(1).max(60), version: z.number().int().min(1), ...campaignFields }),
  async (input, ctx) => {
    const { campaignId, ...rest } = input
    await updateCampaign(ctx, campaignId, rest)
    revalidatePath('/campanas')
    revalidatePath(`/campanas/${campaignId}`)
    return { ok: true }
  },
)

export const saveBriefAction = defineAction(
  z.object({
    campaignId: z.string().min(1).max(60),
    version: z.number().int().min(1).optional(),
    country: z.string().trim().max(60).nullish(),
    language: z.string().trim().max(40).nullish(),
    followersMin: z.number().int().nonnegative().max(2_000_000_000).nullish(),
    followersMax: z.number().int().nonnegative().max(2_000_000_000).nullish(),
    engagementRateMin: z.number().min(0).max(100).nullish(),
    audienceAgeMin: z.number().int().min(0).max(120).nullish(),
    audienceAgeMax: z.number().int().min(0).max(120).nullish(),
    audienceGeoPredominance: z.string().trim().max(120).nullish(),
    audienceGeoMinPercent: z.number().int().min(0).max(100).nullish(),
    platforms: z.array(z.string().trim().max(30)).max(20).optional(),
    idealProfile: z.string().trim().max(6000).nullish(),
    contentIdeas: z.string().trim().max(6000).nullish(),
    realProductUses: z.string().trim().max(6000).nullish(),
    inclusionCriteria: z.string().trim().max(6000).nullish(),
    exclusionCriteria: z.string().trim().max(6000).nullish(),
    internalNotes: z.string().trim().max(6000).nullish(),
    niches: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(80),
          mode: z.enum(['PRIORITY', 'EXCLUDED']),
          priority: z.number().int().min(1).max(5),
          idealProfile: z.string().trim().max(400).nullish(),
        }),
      )
      .max(40)
      .optional(),
    keywords: z
      .array(z.object({ category: z.string().trim().min(1).max(40), term: z.string().trim().min(1).max(80) }))
      .max(200)
      .optional(),
    clusters: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(60),
          label: z.string().trim().min(1).max(80),
          emoji: z.string().trim().max(8).nullish(),
          targetPercent: z.number().int().min(0).max(100),
          description: z.string().trim().max(400).nullish(),
        }),
      )
      .max(20)
      .optional(),
  }),
  async (input, ctx) => {
    const { campaignId, ...rest } = input
    await upsertBrief(ctx, campaignId, rest)
    revalidatePath(`/campanas/${campaignId}`)
    return { ok: true }
  },
)

/**
 * Cambiar sólo el estado de una campaña.
 *
 * `updateCampaignAction` pide la campaña completa, así que para mover una de
 * Brief a Scouting había que reenviar nombre, fechas, presupuesto y todo lo
 * demás. Eso hacía que el cambio de estado -- que es lo que más se hace --
 * fuera lo más caro de hacer, y terminó no habiendo pantalla para hacerlo:
 * toda campaña envejecía marcada como "Brief" y la lista se volvía mentira.
 */
export const changeCampaignStatusAction = defineAction(
  z.object({
    campaignId: z.string().min(1).max(60),
    version: z.number().int().min(1),
    status: CAMPAIGN_STATUS,
  }),
  async (input, ctx) => {
    await changeCampaignStatus(ctx, input.campaignId, input.status, input.version)
    revalidatePath('/campanas')
    revalidatePath(`/campanas/${input.campaignId}`)
    return { ok: true }
  },
)
