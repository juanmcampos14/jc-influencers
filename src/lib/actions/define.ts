import 'server-only'
import { headers } from 'next/headers'
import type { z } from 'zod'
import { env } from '@/lib/env'
import { ForbiddenError } from '@/lib/authz/errors'
import { requireContext } from '@/lib/auth/current'
import type { AuthContext } from '@/lib/authz/context'
import { fail, ok, traducirFalla, type ActionResult } from './result'

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
  if (!allowed.has(origin)) throw new ForbiddenError({ clave: 'origenNoPermitido' })
}

type Handler<TInput, TOutput> = (input: TInput, ctx: AuthContext) => Promise<TOutput>

type Opciones = {
  /**
   * Si la acción puede correr durante una vista previa del cliente.
   *
   * Casi ninguna puede. La vista previa existe para MIRAR lo que ve el cliente,
   * y todo el registro de "quién aprobó y cuándo" depende de que una decisión
   * suya sea suya. La única excepción razonable es salir de la vista previa.
   */
  permitidoEnVistaPrevia?: boolean
}

/**
 * El candado de la vista previa.
 *
 * Va acá, en el único lugar por donde pasan todas las acciones autenticadas, y
 * no en cada pantalla: esconder botones no alcanza -- una acción de servidor se
 * puede invocar sin pasar por la interfaz.
 */
function assertNoEsVistaPrevia(ctx: AuthContext, opciones: Opciones): void {
  if (!ctx.preview || opciones.permitidoEnVistaPrevia) return
  throw new ForbiddenError({ clave: 'vistaPreviaEsSoloLectura' })
}

/**
 * Server action autenticada con contrato tipado.
 * Valida entrada con Zod, resuelve el contexto desde la sesión y traduce errores.
 */
export function defineAction<TSchema extends z.ZodTypeAny, TOutput>(
  schema: TSchema,
  handler: Handler<z.infer<TSchema>, TOutput>,
  opciones: Opciones = {},
): (raw: unknown) => Promise<ActionResult<TOutput>> {
  return async (raw: unknown) => {
    try {
      await assertSameOrigin()
      const ctx = await requireContext()
      assertNoEsVistaPrevia(ctx, opciones)
      const input = schema.parse(raw) as z.infer<TSchema>
      return ok(await handler(input, ctx))
    } catch (error) {
      return traducirFalla(fail(error), error)
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
      return traducirFalla(fail(error), error)
    }
  }
}
