"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { createInfluencer, dismissDuplicate, updateInfluencer, upsertSocialProfile } from '@/lib/repos/influencers'

const influencerFields = {
  displayName: z.string().trim().min(2, 'El nombre es obligatorio.').max(160),
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
  contactEmail: z.string().trim().email('Email inválido.').max(200).nullish().or(z.literal('')),
  contactPhone: z.string().trim().max(60).nullish(),
  contactNotes: z.string().trim().max(2000).nullish(),
  contactLegalBasis: z.string().trim().max(400).nullish(),
  nicheKeys: z.array(z.string().trim().max(60)).max(30).optional(),
  tagKeys: z.array(z.string().trim().max(60)).max(30).optional(),
}

export const createInfluencerAction = defineAction(z.object(influencerFields), async (input, ctx) => {
  const result = await createInfluencer(ctx, { ...input, contactEmail: input.contactEmail || null })
  revalidatePath('/influencers')
  return result
})

export const updateInfluencerAction = defineAction(
  z.object({ influencerId: z.string().min(1).max(60), version: z.number().int().min(1), ...influencerFields }),
  async (input, ctx) => {
    const { influencerId, ...rest } = input
    await updateInfluencer(ctx, influencerId, { ...rest, contactEmail: rest.contactEmail || null })
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
    metricSourceUrl: z.string().trim().url('URL de fuente inválida.').max(500).nullish().or(z.literal('')),
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
