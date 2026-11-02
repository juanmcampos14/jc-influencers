"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import {
  createInfluencer,
  deleteInfluencer,
  dismissDuplicate,
  mergeInfluencers,
  updateInfluencer,
  upsertSocialProfile,
} from '@/lib/repos/influencers'

const influencerFields = {
  displayName: z.string().trim().min(2, 'nombreObligatorio').max(160),
  realName: z.string().trim().max(160).nullish(),
  primaryHandle: z.string().trim().max(80).nullish(),
  country: z.string().trim().max(60).nullish(),
  city: z.string().trim().max(80).nullish(),
  language: z.string().trim().max(40).nullish(),
  bio: z.string().trim().max(4000).nullish(),
  status: z.enum(['NEW', 'ACTIVE', 'BACKLOG', 'BLOCKED', 'ARCHIVED']).optional(),
  adultStatus: z.enum(['CONFIRMED', 'NOT_CONFIRMED', 'NOT_APPLICABLE']).optional(),
  representative: z.string().trim().max(160).nullish(),
  internalNotes: z.string().trim().max(6000).nullish(),
  contactEmail: z.string().trim().email('emailInvalido').max(200).nullish().or(z.literal('')),
  contactPhone: z.string().trim().max(60).nullish(),
  contactNotes: z.string().trim().max(2000).nullish(),
  contactLegalBasis: z.string().trim().max(400).nullish(),
  nicheKeys: z.array(z.string().trim().max(60)).max(30).optional(),
  tagKeys: z.array(z.string().trim().max(60)).max(30).optional(),
}

/**
 * Un campo de texto vacío es "sin dato", no una cadena vacía.
 *
 * El formulario manda `''` cuando alguien borra el teléfono. Guardarlo así
 * dejaría filas con `''` que no son ni un número ni la ausencia de uno.
 */
const vacioEsNulo = <T extends Record<string, unknown>>(input: T): T => ({
  ...input,
  contactEmail: (input.contactEmail as string | null) || null,
  contactPhone: (input.contactPhone as string | null) || null,
  contactNotes: (input.contactNotes as string | null) || null,
  contactLegalBasis: (input.contactLegalBasis as string | null) || null,
})

export const createInfluencerAction = defineAction(z.object(influencerFields), async (input, ctx) => {
  const result = await createInfluencer(ctx, vacioEsNulo(input))
  revalidatePath('/influencers')
  return result
})

export const updateInfluencerAction = defineAction(
  z.object({ influencerId: z.string().min(1).max(60), version: z.number().int().min(1), ...influencerFields }),
  async (input, ctx) => {
    const { influencerId, ...rest } = input
    await updateInfluencer(ctx, influencerId, vacioEsNulo(rest))
    revalidatePath('/influencers')
    revalidatePath(`/influencers/${influencerId}`)
    return { ok: true }
  },
)

export const addProfileAction = defineAction(
  z.object({
    influencerId: z.string().min(1).max(60),
    url: z.string().trim().min(4).max(500),
    followers: z.number().int().nonnegative().max(5_000_000_000).nullish(),
    followersRaw: z.string().trim().max(60).nullish(),
    engagementRate: z.number().min(0).max(100).nullish(),
    avgViews: z.number().int().nonnegative().max(2_000_000_000).nullish(),
    audienceLocalPercent: z.number().min(0).max(100).nullish(),
    metricSource: z.string().trim().max(200).nullish(),
    metricSourceUrl: z.string().trim().url('urlDeFuenteInvalida').max(500).nullish().or(z.literal('')),
    isPrimary: z.boolean().optional(),
  }),
  async (input, ctx) => {
    const { influencerId, metricSourceUrl, ...rest } = input
    const result = await upsertSocialProfile(ctx, influencerId, {
      ...rest,
      metricSourceUrl: metricSourceUrl || null,
      measuredAt: new Date(),
    })
    revalidatePath(`/influencers/${influencerId}`)
    return result
  },
)

export const dismissDuplicateAction = defineAction(
  z.object({ duplicateId: z.string().min(1).max(60), notes: z.string().trim().max(1000).nullish() }),
  async (input, ctx) => {
    await dismissDuplicate(ctx, input.duplicateId, input.notes)
    revalidatePath('/influencers/duplicados')
    return { ok: true }
  },
)

export const mergeInfluencersAction = defineAction(
  z.object({
    /** El que sobrevive y absorbe al otro. */
    keepId: z.string().min(1).max(60),
    mergeId: z.string().min(1).max(60),
    duplicateId: z.string().min(1).max(60).nullish(),
  }),
  async (input, ctx) => {
    const resultado = await mergeInfluencers(ctx, input)
    revalidatePath('/influencers/duplicados')
    revalidatePath('/influencers')
    revalidatePath(`/influencers/${resultado.survivorId}`)
    return resultado
  },
)

export const deleteInfluencerAction = defineAction(
  z.object({ influencerId: z.string().min(1).max(60) }),
  async (input, ctx) => {
    const resultado = await deleteInfluencer(ctx, input.influencerId)
    revalidatePath('/influencers')
    revalidatePath('/influencers/duplicados')
    return resultado
  },
)
