"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { createClient, updateClient } from '@/lib/repos/clients'

const baseSchema = {
  name: z.string().trim().min(2, 'El nombre es obligatorio.').max(120),
  legalName: z.string().trim().max(200).nullish(),
  country: z.string().trim().max(40).nullish(),
  markets: z.array(z.string().trim().max(40)).max(30).optional(),
  website: z.string().trim().url('Ingresá una URL válida.').max(300).nullish().or(z.literal('')),
  description: z.string().trim().max(2000).nullish(),
  defaultCurrency: z.string().trim().length(3).toUpperCase().optional(),
  timezone: z.string().trim().max(60).optional(),
  allowClientUserInvites: z.boolean().optional(),
  allowClientExports: z.boolean().optional(),
}

export const createClientAction = defineAction(z.object(baseSchema), async (input, ctx) => {
  const result = await createClient(ctx, { ...input, website: input.website || null })
  revalidatePath('/clientes')
  return result
})

export const updateClientAction = defineAction(
  z.object({ clientId: z.string().min(1).max(60), version: z.number().int().min(1), ...baseSchema }),
  async (input, ctx) => {
    const { clientId, ...rest } = input
    await updateClient(ctx, clientId, { ...rest, website: rest.website || null })
    revalidatePath('/clientes')
    revalidatePath(`/clientes/${clientId}`)
    return { ok: true }
  },
)
