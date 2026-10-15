"use server"

import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
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

const emailSchema = z.string().trim().min(3).max(200).email('ingresaEmailValido')

/**
 * El texto de un fallo de acceso, en el idioma de quien está entrando.
 *
 * Estos resultados viajan como DATO --`{ ok: false }` dentro de un éxito-- y no
 * como excepción, porque el login no distingue casos a propósito. Por eso no
 * pasan por `fail()` y se traducen acá.
 */
async function textoDeError(clave: string): Promise<string> {
  const t = await getTranslations('errores')
  return t(clave as never)
}

export const loginAction = definePublicAction(
  z.object({ email: emailSchema, password: z.string().min(1, 'ingresaTuClave').max(400) }),
  async (input) => {
    const meta = await requestMeta()
    const result = await login({ ...input, ...meta })
    if (!result.ok) return { ok: false as const, message: await textoDeError(result.clave) }
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
    const result = await completePasswordReset({ ...input, ...meta })
    return result.ok
      ? { ok: true as const }
      : { ok: false as const, message: await textoDeError(result.clave ?? 'enlaceNoValido') }
  },
)

export const acceptInvitationAction = definePublicAction(
  z.object({
    token: z.string().min(10).max(400),
    name: z.string().trim().min(2, 'ingresaTuNombre').max(120),
    password: z.string().min(1).max(400),
  }),
  async (input) => {
    const meta = await requestMeta()
    const result = await acceptInvitation({ ...input, ...meta })
    if (!result.ok) return { ok: false as const, message: await textoDeError(result.clave) }
    const store = await cookies()
    store.set(SESSION_COOKIE, result.session.token, sessionCookieOptions(result.session.expiresAt))
    return { ok: true as const }
  },
)
