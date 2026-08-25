"use server"

import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { NotFoundError } from '@/lib/authz/errors'
import { scoped } from '@/lib/repos/base'
import { searchInfluencers } from '@/lib/repos/influencers'

/** Buscador para agregar influencers a una campaña. Excluye los que ya están. */
export const searchInfluencersForCampaign = defineAction(
  z.object({ campaignId: z.string().min(1).max(60), query: z.string().trim().min(2).max(120) }),
  async (input, ctx) => {
    const campaign = await scoped(ctx, (tx) =>
      tx.campaign.findUnique({ where: { id: input.campaignId }, select: { clientId: true } }),
    )
    if (!campaign) throw new NotFoundError()
    assertClientInScope(ctx, campaign.clientId)
    assertCan(ctx, 'candidate.manage', campaign.clientId)

    const existing = await scoped(ctx, (tx) =>
      tx.candidacy.findMany({ where: { campaignId: input.campaignId }, select: { influencerId: true } }),
    )
    const taken = new Set(existing.map((row) => row.influencerId))

    const page = await searchInfluencers(ctx, { search: input.query }, { pageSize: 40 })
    return page.items
      .filter((item) => !taken.has(item.id))
      .slice(0, 20)
      .map((item) => ({
        id: item.id,
        displayName: item.displayName,
        handle: item.primaryHandle ?? item.profiles[0]?.handle ?? null,
        followers: item.profiles[0]?.followers ?? null,
        country: item.country,
      }))
  },
)
