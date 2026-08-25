import 'server-only'
import { headers } from 'next/headers'
import type { z } from 'zod'
import { env } from '@/lib/env'
import { ForbiddenError } from '@/lib/authz/errors'
import { requireContext } from '@/lib/auth/current'
import type { AuthContext } from '@/lib/authz/context'
import { fail, ok, type ActionResult } from './result'

/**
 * Defensa en profundidad frente a CSRF. Next ya valida el origen de las server
 * actions; esto lo vuelve explícito y cubre despliegues detrás de proxy.
 */
async function assertSameOrigin(): Promise<void> {
  const headerList = await headers()
  const origin = headerList.get('origin')
  if (!origin) return // navegaciones same-origin sin Origin (GET) no mutan estado
  const allowed = new Set<string>([new URL(env().APP_URL).origin])
  const forwardedHost = headerList.get('x-forwarded-host') ?? headerList.get('host')
  if (forwardedHost) {
    const proto = headerList.get('x-forwarded-proto') ?? 'https'
    allowed.add(`${proto}://${forwardedHost}`)
    allowed.add(`http://${forwardedHost}`)
  }
  if (!allowed.has(origin)) throw new ForbiddenError('Origen no permitido.')
}

type Handler<TInput, TOutput> = (input: TInput, ctx: AuthContext) => Promise<TOutput>

/**
 * Server action autenticada con contrato tipado.
 * Valida entrada con Zod, resuelve el contexto desde la sesión y traduce errores.
 */
export function defineAction<TSchema extends z.ZodTypeAny, TOutput>(
  schema: TSchema,
  handler: Handler<z.infer<TSchema>, TOutput>,
): (raw: unknown) => Promise<ActionResult<TOutput>> {
  return async (raw: unknown) => {
    try {
      await assertSameOrigin()
      const ctx = await requireContext()
      const input = schema.parse(raw) as z.infer<TSchema>
      return ok(await handler(input, ctx))
    } catch (error) {
      return fail(error)
    }
  }
}

/** Server action pública (login, invitación, recuperación). Sin sesión previa. */
export function definePublicAction<TSchema extends z.ZodTypeAny, TOutput>(
  schema: TSchema,
  handler: (input: z.infer<TSchema>) => Promise<TOutput>,
): (raw: unknown) => Promise<ActionResult<TOutput>> {
  return async (raw: unknown) => {
    try {
      await assertSameOrigin()
      const input = schema.parse(raw) as z.infer<TSchema>
      return ok(await handler(input))
    } catch (error) {
      return fail(error)
    }
  }
}
