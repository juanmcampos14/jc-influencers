"use server"

import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { changeOwnPassword } from '@/lib/auth/flows'
import { ValidationError } from '@/lib/authz/errors'

/**
 * Cambio de contraseña desde la propia cuenta.
 *
 * Vale para los dos lados —agencia y cliente—: lo único que hace falta es una
 * sesión, y la comprobación de identidad la da la contraseña actual.
 */
export const changePasswordAction = defineAction(
  z.object({
    currentPassword: z.string().min(1, 'Escribí tu contraseña actual.').max(200),
    newPassword: z.string().min(1, 'Escribí la contraseña nueva.').max(200),
    confirmPassword: z.string().min(1).max(200),
  }),
  async (input, ctx) => {
    if (input.newPassword !== input.confirmPassword) {
      throw new ValidationError('Las dos contraseñas nuevas no coinciden.', {
        confirmPassword: ['No coincide con la contraseña nueva.'],
      })
    }

    const result = await changeOwnPassword({
      userId: ctx.user.id,
      sessionId: ctx.sessionId,
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    })

    if (!result.ok) throw new ValidationError(result.message ?? 'No se pudo cambiar la contraseña.')
    return { otrasSesionesCerradas: result.otrasSesionesCerradas ?? 0 }
  },
)
