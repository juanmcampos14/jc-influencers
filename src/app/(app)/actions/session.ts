"use server"

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { getAuthContext } from '@/lib/auth/current'
import { SESSION_COOKIE, revokeSession, setActiveClient } from '@/lib/auth/session'
import { AUDIT, recordAudit } from '@/lib/audit'
import { assertClientInScope } from '@/lib/authz/context'
import { withSystemScope } from '@/lib/db/scope'

export async function logoutAction(): Promise<void> {
  const ctx = await getAuthContext()
  if (ctx) {
    await revokeSession(ctx.sessionId, 'logout')
    await withSystemScope((tx) =>
      recordAudit(tx, { userId: ctx.user.id, email: ctx.user.email, ip: ctx.ip, userAgent: ctx.userAgent }, {
        action: AUDIT.LOGOUT,
        entityType: 'Session',
        entityId: ctx.sessionId,
      }),
    )
  }
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  redirect('/login')
}

/**
 * Cambio explícito de espacio de trabajo. Nunca se combinan datos de dos
 * clientes: se trabaja en uno por vez y el cambio es una acción deliberada.
 */
export const switchClientAction = defineAction(
  z.object({ clientId: z.string().min(1).max(60) }),
  async (input, ctx) => {
    assertClientInScope(ctx, input.clientId)
    await setActiveClient(ctx.sessionId, input.clientId)
    return { clientId: input.clientId }
  },
)
