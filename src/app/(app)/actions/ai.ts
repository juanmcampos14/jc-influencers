"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { consumeRateLimit } from '@/lib/auth/rate-limit'
import {
  analyzeCampaign,
  analyzeProfileFit,
  shareInsight,
  suggestCreatives,
  writeCampaignReport,
} from '@/lib/repos/ai'

const id = z.string().min(1).max(60)

export const analyzeProfileAction = defineAction(
  z.object({ candidacyId: id, campaignId: id }),
  async (input, ctx) => {
    await consumeRateLimit('aiRun', ctx.user.id)
    const insight = await analyzeProfileFit(ctx, input.candidacyId)
    revalidatePath(`/campanas/${input.campaignId}`)
    return insight
  },
)

export const suggestCreativesAction = defineAction(z.object({ campaignId: id }), async (input, ctx) => {
  await consumeRateLimit('aiRun', ctx.user.id)
  const insight = await suggestCreatives(ctx, input.campaignId)
  revalidatePath(`/campanas/${input.campaignId}`)
  return insight
})

export const analyzeCampaignAction = defineAction(z.object({ campaignId: id }), async (input, ctx) => {
  await consumeRateLimit('aiRun', ctx.user.id)
  const insight = await analyzeCampaign(ctx, input.campaignId)
  revalidatePath(`/campanas/${input.campaignId}`)
  return insight
})

export const campaignReportAction = defineAction(
  z.object({ campaignId: id, audience: z.enum(['AGENCIA', 'CLIENTE']) }),
  async (input, ctx) => {
    await consumeRateLimit('aiRun', ctx.user.id)
    const insight = await writeCampaignReport(ctx, input.campaignId, input.audience)
    revalidatePath(`/campanas/${input.campaignId}`)
    return insight
  },
)

export const shareInsightAction = defineAction(
  z.object({ insightId: id, visible: z.boolean(), campaignId: id }),
  async (input, ctx) => {
    await shareInsight(ctx, input.insightId, input.visible)
    revalidatePath(`/campanas/${input.campaignId}`)
    revalidatePath(`/portal/campanas/${input.campaignId}`)
    return { ok: true }
  },
)
