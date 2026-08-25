"use server"

import { cookies } from 'next/headers'
import { z } from 'zod'
import { definePublicAction } from '@/lib/actions/define'
import { requestMeta } from '@/lib/auth/current'
import {
  acceptInvitation,
  completePasswordReset,
  login,
  requestPasswordReset,
} from '@/lib/auth/flows'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session'

const emailSchema = z.string().trim().min(3).max(200).email('Ingresá un email válido.')

export const loginAction = definePublicAction(
  z.object({ email: emailSchema, password: z.string().min(1, 'Ingresá tu contraseña.').max(400) }),
  async (input) => {
    const meta = await requestMeta()
    const result = await login({ ...input, ...meta })
    if (!result.ok) return { ok: false as const, message: result.message }
    const store = await cookies()
    store.set(SESSION_COOKIE, result.session.token, sessionCookieOptions(result.session.expiresAt))
    return { ok: true as const }
  },
)

export const requestResetAction = definePublicAction(z.object({ email: emailSchema }), async (input) => {
  const meta = await requestMeta()
  await requestPasswordReset({ email: input.email, ...meta })
  // Respuesta idéntica exista o no el email: no se filtra qué cuentas hay.
  return { ok: true as const }
})

export const completeResetAction = definePublicAction(
  z.object({ token: z.string().min(10).max(400), password: z.string().min(1).max(400) }),
  async (input) => {
    const meta = await requestMeta()
    return completePasswordReset({ ...input, ...meta })
  },
)

export const acceptInvitationAction = definePublicAction(
  z.object({
    token: z.string().min(10).max(400),
    name: z.string().trim().min(2, 'Ingresá tu nombre.').max(120),
    password: z.string().min(1).max(400),
  }),
  async (input) => {
    const meta = await requestMeta()
    const result = await acceptInvitation({ ...input, ...meta })
    if (!result.ok) return { ok: false as const, message: result.message }
    const store = await cookies()
    store.set(SESSION_COOKIE, result.session.token, sessionCookieOptions(result.session.expiresAt))
    return { ok: true as const }
  },
)
