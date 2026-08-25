import { prisma } from './client'
import type { Prisma } from '@/generated/prisma/client'

/** Cliente transaccional de Prisma (sin las operaciones de conexión). */
export type Tx = Prisma.TransactionClient

export type DbScope = {
  /** Usuario de la sesión. Null en flujos anónimos (login, invitación). */
  userId: string | null
  scope: 'agency' | 'client' | 'none'
  /** Ids de cliente resueltos DESDE LA BASE, nunca desde el navegador. */
  clientIds: readonly string[]
  /** Alcance total de agencia (admin de agencia / superadmin). */
  allClients: boolean
  /**
   * Contexto de sistema: sólo para autenticación, aceptación de invitaciones,
   * seed y migraciones de datos. Desactiva el filtro de RLS.
   */
  system?: boolean
}

export const SYSTEM_SCOPE: DbScope = {
  userId: null,
  scope: 'none',
  clientIds: [],
  allClients: false,
  system: true,
}

export const ANONYMOUS_SCOPE: DbScope = {
  userId: null,
  scope: 'none',
  clientIds: [],
  allClients: false,
}

type WithScopeOptions = {
  /** Milisegundos máximos de la transacción. La importación necesita más. */
  timeoutMs?: number
  maxWaitMs?: number
}

/**
 * Abre una transacción y fija el contexto de seguridad en la sesión de Postgres.
 * Todo acceso a datos de la aplicación pasa por acá: es lo que hace que las
 * políticas de Row-Level Security tengan de dónde leer el alcance.
 */
export async function withScope<T>(
  scope: DbScope,
  fn: (tx: Tx) => Promise<T>,
  options: WithScopeOptions = {},
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT
        set_config('app.user_id', ${scope.userId ?? ''}, true),
        set_config('app.scope', ${scope.scope}, true),
        set_config('app.client_ids', ${scope.clientIds.join(',')}, true),
        set_config('app.all_clients', ${scope.allClients ? 'on' : 'off'}, true),
        set_config('app.system', ${scope.system ? 'on' : 'off'}, true)`
      return fn(tx)
    },
    { timeout: options.timeoutMs ?? 15_000, maxWait: options.maxWaitMs ?? 10_000 },
  )
}

/** Atajo para operaciones de sistema (login, invitaciones, seed). */
export const withSystemScope = <T>(fn: (tx: Tx) => Promise<T>, options?: WithScopeOptions) =>
  withScope(SYSTEM_SCOPE, fn, options)
