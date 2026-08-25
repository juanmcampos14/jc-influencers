"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import {
  changeCandidacyStatus,
  createCandidacy,
  setCandidacyVisibility,
  setClientApproval,
  setShortlist,
  updateCandidacy,
  addInfluencersToCampaign,
} from '@/lib/repos/candidacies'

const id = z.string().min(1).max(60)

export const createCandidacyAction = defineAction(
  z.object({ campaignId: id, influencerId: id, clusterId: id.nullish(), fitScore: z.number().int().min(1).max(5).nullish() }),
  async (input, ctx) => {
    const result = await createCandidacy(ctx, input.campaignId, input.influencerId, {
      clusterId: input.clusterId ?? null,
      fitScore: input.fitScore ?? null,
    })
    revalidatePath(`/campanas/${input.campaignId}`)
    return result
  },
)

export const updateCandidacyAction = defineAction(
  z.object({
    candidacyId: id,
    version: z.number().int().min(1),
    clusterId: id.nullish(),
    rank: z.number().int().min(0).max(9999).nullish(),
    fitScore: z.number().int().min(1).max(5).nullish(),
    agencyRationale: z.string().trim().max(4000).nullish(),
    contentIdea: z.string().trim().max(4000).nullish(),
    deliverablesSummary: z.string().trim().max(2000).nullish(),
    storiesCount: z.number().int().min(0).max(999).optional(),
    reelsCount: z.number().int().min(0).max(999).optional(),
    postsCount: z.number().int().min(0).max(999).optional(),
    tiktoksCount: z.number().int().min(0).max(999).optional(),
    videosCount: z.number().int().min(0).max(999).optional(),
    availability: z.enum(['UNKNOWN', 'AVAILABLE', 'UNAVAILABLE', 'CONDITIONAL']).optional(),
    contactStatus: z.enum(['NOT_CONTACTED', 'CONTACTED', 'RESPONDED', 'NO_RESPONSE']).optional(),
    negotiationStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'AGREED', 'DECLINED', 'ON_HOLD']).optional(),
    ownerUserId: id.nullish(),
    rejectionReason: z.string().trim().max(2000).nullish(),
    internalNotes: z.string().trim().max(6000).nullish(),
    currency: z.string().trim().length(3).toUpperCase().optional(),
    budgetRequested: z.number().nonnegative().max(99_999_999_999).nullish(),
    budgetNegotiated: z.number().nonnegative().max(99_999_999_999).nullish(),
    cacheAmount: z.number().nonnegative().max(99_999_999_999).nullish(),
    barterDescription: z.string().trim().max(2000).nullish(),
    budgetPrivateNotes: z.string().trim().max(4000).nullish(),
    campaignId: id,
  }),
  async (input, ctx) => {
    const { candidacyId, campaignId, ...rest } = input
    await updateCandidacy(ctx, candidacyId, rest)
    revalidatePath(`/campanas/${campaignId}`)
    return { ok: true }
  },
)

export const changeStatusAction = defineAction(
  z.object({
    candidacyId: id,
    campaignId: id,
    statusKey: z.string().trim().min(1).max(60),
    comment: z.string().trim().max(1000).nullish(),
  }),
  async (input, ctx) => {
    await changeCandidacyStatus(ctx, input.candidacyId, input.statusKey, input.comment)
    revalidatePath(`/campanas/${input.campaignId}`)
    revalidatePath('/portal')
    return { ok: true }
  },
)

export const approvalAction = defineAction(
  z.object({
    candidacyId: id,
    campaignId: id,
    approval: z.enum(['APPROVED', 'REJECTED', 'NEEDS_REVIEW', 'REPLACEMENT_REQUESTED']),
    feedback: z.string().trim().max(4000).nullish(),
  }),
  async (input, ctx) => {
    await setClientApproval(ctx, input.candidacyId, input.approval, input.feedback)
    revalidatePath(`/campanas/${input.campaignId}`)
    revalidatePath(`/portal/campanas/${input.campaignId}`)
    revalidatePath('/portal')
    revalidatePath('/panel')
    return { ok: true }
  },
)

export const visibilityAction = defineAction(
  z.object({ candidacyIds: z.array(id).min(1).max(500), visible: z.boolean(), campaignId: id }),
  async (input, ctx) => {
    const count = await setCandidacyVisibility(ctx, input.candidacyIds, input.visible)
    revalidatePath(`/campanas/${input.campaignId}`)
    return { count }
  },
)

export const shortlistAction = defineAction(
  z.object({
    campaignId: id,
    entries: z.array(z.object({ candidacyId: id, order: z.number().int().min(1).max(999) })).max(200),
    /** Lo que había en pantalla. Sin esto, guardar sacaría de la shortlist a lo que no se vio. */
    known: z.array(id).max(500),
  }),
  async (input, ctx) => {
    await setShortlist(ctx, input.campaignId, input.entries, input.known)
    revalidatePath(`/campanas/${input.campaignId}`)
    return { ok: true }
  },
)

export const addToCampaignAction = defineAction(
  z.object({
    campaignId: z.string().min(1).max(60),
    influencerIds: z.array(z.string().min(1).max(60)).min(1).max(200),
  }),
  async (input, ctx) => {
    const resultado = await addInfluencersToCampaign(ctx, input.campaignId, input.influencerIds)
    revalidatePath(`/campanas/${input.campaignId}`)
    revalidatePath('/influencers')
    return resultado
  },
)
