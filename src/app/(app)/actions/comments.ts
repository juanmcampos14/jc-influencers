"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { createComment } from '@/lib/repos/comments'

export const createCommentAction = defineAction(
  z.object({
    campaignId: z.string().min(1).max(60).nullish(),
    candidacyId: z.string().min(1).max(60).nullish(),
    body: z.string().trim().min(1, 'Escribí algo.').max(5000),
    visibility: z.enum(['INTERNAL', 'CLIENT_VISIBLE', 'CLIENT_AUTHORED', 'BUDGET_PRIVATE']),
  }),
  async (input, ctx) => {
    const result = await createComment(
      ctx,
      { campaignId: input.campaignId ?? null, candidacyId: input.candidacyId ?? null },
      input.body,
      input.visibility,
    )
    if (input.campaignId) {
      revalidatePath(`/campanas/${input.campaignId}`)
      revalidatePath(`/portal/campanas/${input.campaignId}`)
    }
    return result
  },
)
