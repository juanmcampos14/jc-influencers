import 'server-only'
import type { AuthContext } from '@/lib/authz/context'
import { assertClientInScope } from '@/lib/authz/context'
import { scoped } from './base'

/**
 * Qué vista eligió cada persona para el portal de cada cliente.
 *
 * Se apoya en `SavedView`, que ya existe y ya tiene su política RLS
 * (`own_views`) restringiéndolo al propio usuario. No hace falta tabla nueva.
 *
 * **El detalle que importa:** la unique de `SavedView` es
 * `(userId, resource, name)` y NO incluye `clientId`. Con un `name` fijo, la
 * preferencia de un cliente le pisaría la del otro, y una persona de la agencia
 * que trabaja con dos marcas perdería una de las dos sin entender por qué. Por
 * eso el `name` ES el clientId.
 */

export type VistaCampana = 'bandeja' | 'conjunto'

const RECURSO = 'campaign_view'

const esVista = (valor: unknown): valor is VistaCampana => valor === 'bandeja' || valor === 'conjunto'

/** `null` significa que esta persona nunca eligió: decide el default de la página. */
export async function getVistaPreferida(
  ctx: AuthContext,
  clientId: string,
): Promise<VistaCampana | null> {
  assertClientInScope(ctx, clientId)

  const fila = await scoped(ctx, (tx) =>
    tx.savedView.findUnique({
      where: { userId_resource_name: { userId: ctx.user.id, resource: RECURSO, name: clientId } },
      select: { config: true },
    }),
  ).catch(() => null)

  /*
   * `config` es una columna Json y puede tener basura vieja de otra versión.
   * Una preferencia de interfaz rota no puede tumbar la pantalla: se cae al
   * default como si nunca se hubiera elegido nada.
   */
  const vista = (fila?.config as { vista?: unknown } | null)?.vista
  return esVista(vista) ? vista : null
}

export async function setVistaPreferida(
  ctx: AuthContext,
  clientId: string,
  vista: VistaCampana,
): Promise<void> {
  assertClientInScope(ctx, clientId)

  await scoped(ctx, (tx) =>
    tx.savedView.upsert({
      where: { userId_resource_name: { userId: ctx.user.id, resource: RECURSO, name: clientId } },
      create: { userId: ctx.user.id, clientId, resource: RECURSO, name: clientId, config: { vista } },
      update: { config: { vista } },
    }),
  )
}

/**
 * Qué vista mostrar, en orden de prioridad.
 *
 * El umbral no es arbitrario: con una cola larga, decidir de a uno es más
 * rápido que mirar una grilla; con pocos pendientes, lo que hace falta es
 * entender el equipo completo.
 */
export function resolverVista(input: {
  pedida: string | undefined
  preferida: VistaCampana | null
  esperando: number
}): VistaCampana {
  if (esVista(input.pedida)) return input.pedida
  if (input.preferida) return input.preferida
  return input.esperando > 20 ? 'bandeja' : 'conjunto'
}
