"use server"

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { getAuthContext, PREVIEW_COOKIE, requestMeta } from '@/lib/auth/current'
import { AUDIT, recordAudit } from '@/lib/audit'
import { ForbiddenError } from '@/lib/authz/errors'
import { withSystemScope } from '@/lib/db/scope'

/**
 * Entrar a mirar el espacio de un cliente con sus ojos.
 *
 * Se audita, y no como formalidad: alguien de la agencia mirando el espacio de
 * un cliente es un hecho que después puede hacer falta explicar. Es barato de
 * registrar y caro de no tener.
 */
export const entrarEnVistaPreviaAction = defineAction(
  z.object({ clientId: z.string().min(1).max(60) }),
  async (input, ctx) => {
    // Sólo la agencia, y sólo sobre un cliente que ya tiene en su alcance.
    if (!ctx.agencyRole) throw new ForbiddenError()
    const cliente = ctx.clients.find((entrada) => entrada.id === input.clientId)
    if (!cliente) throw new ForbiddenError()

    await withSystemScope((tx) =>
      recordAudit(tx, { userId: ctx.user.id, email: ctx.user.email, ip: ctx.ip, userAgent: ctx.userAgent }, {
        action: AUDIT.CLIENT_PREVIEW_ENTERED,
        entityType: 'Client',
        entityId: cliente.id,
        clientId: cliente.id,
        metadata: { cliente: cliente.name },
      }),
    )

    const store = await cookies()
    store.set(PREVIEW_COOKIE, cliente.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      // Dura poco a propósito: una vista previa olvidada abierta es alguien de
      // la agencia trabajando a ciegas sin entender por qué no puede hacer nada.
      maxAge: 60 * 30,
    })
    return { ok: true }
  },
)

/**
 * Salir.
 *
 * Es la única acción permitida durante la vista previa: si el candado la
 * bloqueara, no habría forma de volver sin borrar la cookie a mano.
 */
export async function salirDeVistaPreviaAction(): Promise<void> {
  const ctx = await getAuthContext()
  const store = await cookies()
  const clientId = store.get(PREVIEW_COOKIE)?.value ?? null
  store.delete(PREVIEW_COOKIE)

  if (ctx && clientId) {
    const meta = await requestMeta()
    await withSystemScope((tx) =>
      recordAudit(tx, { userId: ctx.user.id, email: ctx.user.email, ...meta }, {
        action: AUDIT.CLIENT_PREVIEW_LEFT,
        entityType: 'Client',
        entityId: clientId,
        clientId,
      }),
    )
  }
  redirect(clientId ? `/clientes/${clientId}` : '/clientes')
}
