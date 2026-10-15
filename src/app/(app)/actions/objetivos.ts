"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { borrarObjetivo, guardarObjetivo } from '@/lib/repos/objetivos'

const id = z.string().min(1).max(60)

export const guardarObjetivoAction = defineAction(
  z.object({
    campaignId: id,
    metric: z.enum([
      'ALCANCE_ESTIMADO',
      'ALCANCE_REAL',
      'VISUALIZACIONES',
      'INTERACCIONES',
      'CLICS',
      'PUBLICACIONES',
      'PERFILES_APROBADOS',
      'INVERSION_EN_TALENTO',
    ]),
    direction: z.enum(['AL_MENOS', 'COMO_MUCHO']),
    target: z.coerce.number().positive('objetivoMayorACero'),
    rationale: z.string().trim().max(500).nullish(),
    clientVisible: z.boolean(),
  }),
  async (input, ctx) => {
    const guardado = await guardarObjetivo(ctx, input.campaignId, {
      metric: input.metric,
      direction: input.direction,
      target: input.target,
      rationale: input.rationale ?? null,
      clientVisible: input.clientVisible,
    })
    revalidatePath(`/campanas/${input.campaignId}`)
    revalidatePath(`/portal/campanas/${input.campaignId}`)
    return guardado
  },
)

export const borrarObjetivoAction = defineAction(
  z.object({ goalId: id, campaignId: id }),
  async (input, ctx) => {
    await borrarObjetivo(ctx, input.goalId)
    revalidatePath(`/campanas/${input.campaignId}`)
    revalidatePath(`/portal/campanas/${input.campaignId}`)
    return { ok: true }
  },
)
