import 'server-only'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { AUDIT, recordAudit } from '@/lib/audit'
import { actorOf, scoped } from './base'
import { deleteInfluencer } from './influencers'

/**
 * Acciones sobre varias filas a la vez.
 *
 * La regla que ordena todo este archivo: **el resultado dice exactamente qué
 * pasó con cada uno**. Una acción en lote donde algunos ítems no se pueden
 * tocar --un influencer con campañas, un cliente ajeno al alcance-- es lo
 * normal, no la excepción. Decir "archivé 12" cuando se archivaron 7 es una
 * mentira chica que después cuesta cara: el usuario cree que terminó.
 *
 * Cada ítem se resuelve por separado. Uno que falla no arrastra a los demás.
 */
export type ResultadoDeLote = {
  hechos: number
  omitidos: Array<{ nombre: string; motivo: string }>
}

const MAXIMO = 200

function acotar(ids: string[]): string[] {
  // Un lote llega de la selección de una página, que nunca es tan grande. El
  // tope existe para que un pedido armado a mano no barra la base entera.
  return [...new Set(ids)].slice(0, MAXIMO)
}

const motivoDe = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : 'No se pudo completar.'

// ── Clientes ────────────────────────────────────────────────────────────────

/**
 * Archiva o reactiva clientes.
 *
 * No hay borrado: un cliente cuelga campañas, candidaturas e historial de
 * decisiones. Borrarlo dejaría a la agencia sin poder explicar qué se hizo y
 * por qué. Archivado sale de la lista y sigue existiendo.
 */
export async function archivarClientes(
  ctx: AuthContext,
  ids: string[],
  destino: 'ARCHIVED' | 'ACTIVE',
): Promise<ResultadoDeLote> {
  const omitidos: ResultadoDeLote['omitidos'] = []
  let hechos = 0

  for (const id of acotar(ids)) {
    try {
      assertClientInScope(ctx, id)
      assertCan(ctx, 'client.manage', id)
      await scoped(ctx, async (tx) => {
        const antes = await tx.client.findUnique({ where: { id }, select: { name: true, status: true } })
        if (!antes) throw new Error('Ya no existe.')
        if (antes.status === destino) {
          omitidos.push({ nombre: antes.name, motivo: destino === 'ARCHIVED' ? 'Ya estaba archivado.' : 'Ya estaba activo.' })
          return
        }
        await tx.client.update({ where: { id }, data: { status: destino, version: { increment: 1 } } })
        await recordAudit(tx, actorOf(ctx), {
          action: AUDIT.CLIENT_UPDATED,
          entityType: 'Client',
          entityId: id,
          clientId: id,
          before: { status: antes.status },
          after: { status: destino },
        })
        hechos += 1
      })
    } catch (error) {
      omitidos.push({ nombre: id, motivo: motivoDe(error) })
    }
  }

  return { hechos, omitidos }
}

// ── Campañas ────────────────────────────────────────────────────────────────

/** Cierra o cancela campañas. Ninguna de las dos borra nada. */
export async function cerrarCampanas(
  ctx: AuthContext,
  ids: string[],
  destino: 'CLOSED' | 'CANCELLED',
): Promise<ResultadoDeLote> {
  const omitidos: ResultadoDeLote['omitidos'] = []
  let hechos = 0

  for (const id of acotar(ids)) {
    try {
      await scoped(ctx, async (tx) => {
        const antes = await tx.campaign.findUnique({
          where: { id },
          select: { name: true, status: true, clientId: true },
        })
        if (!antes) throw new Error('Ya no existe.')
        assertClientInScope(ctx, antes.clientId)
        assertCan(ctx, 'campaign.update', antes.clientId)
        if (antes.status === destino) {
          omitidos.push({ nombre: antes.name, motivo: destino === 'CLOSED' ? 'Ya estaba cerrada.' : 'Ya estaba cancelada.' })
          return
        }
        await tx.campaign.update({ where: { id }, data: { status: destino, version: { increment: 1 } } })
        await recordAudit(tx, actorOf(ctx), {
          action: AUDIT.CAMPAIGN_UPDATED,
          entityType: 'Campaign',
          entityId: id,
          clientId: antes.clientId,
          before: { status: antes.status },
          after: { status: destino },
        })
        hechos += 1
      })
    } catch (error) {
      omitidos.push({ nombre: id, motivo: motivoDe(error) })
    }
  }

  return { hechos, omitidos }
}

// ── Influencers ─────────────────────────────────────────────────────────────

/** Cambia el estado de varios influencers. Archivar los saca de la lista. */
export async function cambiarEstadoDeInfluencers(
  ctx: AuthContext,
  ids: string[],
  destino: 'ARCHIVED' | 'ACTIVE' | 'BACKLOG' | 'BLOCKED',
): Promise<ResultadoDeLote> {
  assertCan(ctx, 'influencer.manage', null)
  const omitidos: ResultadoDeLote['omitidos'] = []
  let hechos = 0

  for (const id of acotar(ids)) {
    try {
      await scoped(ctx, async (tx) => {
        const antes = await tx.influencer.findUnique({ where: { id }, select: { displayName: true, status: true } })
        if (!antes) throw new Error('Ya no existe.')
        if (antes.status === destino) {
          omitidos.push({ nombre: antes.displayName, motivo: 'Ya estaba en ese estado.' })
          return
        }
        await tx.influencer.update({ where: { id }, data: { status: destino, version: { increment: 1 } } })
        await recordAudit(tx, actorOf(ctx), {
          action: AUDIT.INFLUENCER_UPDATED,
          entityType: 'Influencer',
          entityId: id,
          before: { status: antes.status },
          after: { status: destino },
        })
        hechos += 1
      })
    } catch (error) {
      omitidos.push({ nombre: id, motivo: motivoDe(error) })
    }
  }

  return { hechos, omitidos }
}

/**
 * Borra varios influencers.
 *
 * Se apoya en `deleteInfluencer`, que se niega a borrar a alguien que participó
 * de una campaña: eso dejaría campañas sin parte de su historia. Acá esa
 * negativa no corta el lote, se acumula y se informa.
 */
export async function borrarInfluencers(ctx: AuthContext, ids: string[]): Promise<ResultadoDeLote> {
  const omitidos: ResultadoDeLote['omitidos'] = []
  let hechos = 0

  for (const id of acotar(ids)) {
    try {
      await deleteInfluencer(ctx, id)
      hechos += 1
    } catch (error) {
      const nombre = await scoped(ctx, (tx) =>
        tx.influencer.findUnique({ where: { id }, select: { displayName: true } }),
      ).catch(() => null)
      omitidos.push({ nombre: nombre?.displayName ?? id, motivo: motivoDe(error) })
    }
  }

  return { hechos, omitidos }
}
