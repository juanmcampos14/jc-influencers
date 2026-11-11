"use server"

import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { NotFoundError } from '@/lib/authz/errors'
import { scoped } from '@/lib/repos/base'
import { searchInfluencers } from '@/lib/repos/influencers'
import { agregarPorEnlace, crearYAgregarPorNombre, resolverEnlaces } from '@/lib/repos/altas-en-campana'
import { revalidatePath } from 'next/cache'

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

/**
 * Qué pasaría con los enlaces que se pegaron. No escribe ni gasta nada.
 *
 * El navegador manda el texto crudo y nada más: quién es cada enlace lo decide
 * el servidor, acá y otra vez al agregar. Mandar el `influencerId` resuelto
 * desde la pantalla sería confiar en que nadie lo cambia en el camino.
 */
export const resolverEnlacesAction = defineAction(
  z.object({ campaignId: z.string().min(1).max(60), texto: z.string().max(4000) }),
  async (input, ctx) => resolverEnlaces(ctx, input.campaignId, input.texto),
)

export const agregarPorEnlaceAction = defineAction(
  z.object({
    campaignId: z.string().min(1).max(60),
    texto: z.string().min(1).max(4000),
    clusterId: z.string().max(60).nullish(),
  }),
  async (input, ctx) => {
    const resultado = await agregarPorEnlace(ctx, input)
    revalidatePath(`/campanas/${input.campaignId}`)
    return resultado
  },
)

export const crearYAgregarAction = defineAction(
  z.object({
    campaignId: z.string().min(1).max(60),
    displayName: z.string().trim().min(2).max(200),
    clusterId: z.string().max(60).nullish(),
  }),
  async (input, ctx) => {
    const resultado = await crearYAgregarPorNombre(ctx, input)
    revalidatePath(`/campanas/${input.campaignId}`)
    return resultado
  },
)
