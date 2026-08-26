"use server"

import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { setVistaPreferida } from '@/lib/repos/view-prefs'

/**
 * Guarda la vista elegida. No se audita: es una preferencia de interfaz, no un
 * hecho del negocio, y llenar la auditoría de esto taparía lo que sí importa.
 */
export const setVistaCampanaAction = defineAction(
  z.object({
    clientId: z.string().min(1).max(60),
    vista: z.enum(['bandeja', 'conjunto']),
  }),
  async (input, ctx) => {
    await setVistaPreferida(ctx, input.clientId, input.vista)
    return { ok: true }
  },
)
