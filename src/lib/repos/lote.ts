import 'server-only'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { AUDIT, recordAudit } from '@/lib/audit'
import { actorOf, scoped } from './base'
import { deleteInfluencer, mergeInfluencers } from './influencers'
import { claseDeParecido } from '@/lib/domain/parecido'

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

// ── Duplicados ──────────────────────────────────────────────────────────────

/**
 * Fusiona varios pares de duplicados de una vez.
 *
 * Antes esto no existía a propósito: fusionar une dos fichas y decide cuál
 * sobrevive, y un "fusionar todos" a ciegas mezcla gente distinta. La razón
 * seguía siendo buena, pero el remedio era demasiado: obligaba a revisar de a
 * uno diecisiete pares idénticos para limpiar la lista.
 *
 * La salida no es confiar en el lote, es **acotarlo a lo que el sistema sabe
 * con certeza**. Y la certeza no la da el puntaje sino de dónde salió la
 * coincidencia (ver `parecido.ts`):
 *
 * - Se fusiona sólo cuando las dos fichas son **la misma cuenta**: misma URL
 *   normalizada, o mismo handle en la misma red. Ahí no hay juicio que hacer.
 * - Cuando el detector las juntó porque **el nombre se parece**, se omite y se
 *   dice por qué --por más que ese parecido sea del 100 %, que es un empate
 *   exacto de nombre y no impide que sean dos personas distintas--. Ése se
 *   sigue mirando de a uno, con las dos columnas al lado.
 *
 * Sobrevive el que tiene más historia --perfiles más campañas--, que es el
 * mismo criterio que la pantalla propone al resolver un par suelto. Si empatan
 * queda el primero. Nadie se borra: el otro queda archivado con una nota que
 * dice en quién se fusionó.
 */
export async function fusionarDuplicados(ctx: AuthContext, ids: string[]): Promise<ResultadoDeLote> {
  assertCan(ctx, 'influencer.manage', null)
  const omitidos: ResultadoDeLote['omitidos'] = []
  let hechos = 0

  for (const id of acotar(ids)) {
    try {
      const par = await scoped(ctx, (tx) =>
        tx.influencerDuplicate.findUnique({
          where: { id },
          select: {
            id: true,
            score: true,
            status: true,
            reason: true,
            influencerA: {
              select: {
                id: true,
                displayName: true,
                _count: { select: { profiles: true, candidacies: true } },
              },
            },
            influencerB: {
              select: {
                id: true,
                displayName: true,
                _count: { select: { profiles: true, candidacies: true } },
              },
            },
          },
        }),
      )

      if (!par) {
        omitidos.push({ nombre: id, motivo: 'Ese par ya no existe.' })
        continue
      }

      const nombre = `${par.influencerA.displayName} y ${par.influencerB.displayName}`

      if (par.status !== 'OPEN') {
        omitidos.push({ nombre, motivo: 'Ya estaba resuelto.' })
        continue
      }

      /*
       * El corte, y es por identidad, no por puntaje. Si el detector las juntó
       * por parecido de nombre, dos personas distintas pueden llamarse igual:
       * fusionar eso sin verlo es lo que arruina una base.
       */
      if (claseDeParecido(par.reason) !== 'IDENTIDAD') {
        omitidos.push({
          nombre,
          motivo: `Se juntaron por el nombre (${par.score} %), no por la cuenta. Miralo de a uno para elegir cuál se conserva.`,
        })
        continue
      }

      const historiaA = par.influencerA._count.profiles + par.influencerA._count.candidacies
      const historiaB = par.influencerB._count.profiles + par.influencerB._count.candidacies
      const sobrevive = historiaB > historiaA ? par.influencerB : par.influencerA
      const absorbido = sobrevive.id === par.influencerA.id ? par.influencerB : par.influencerA

      await mergeInfluencers(ctx, {
        keepId: sobrevive.id,
        mergeId: absorbido.id,
        duplicateId: par.id,
      })
      hechos += 1
    } catch (error) {
      omitidos.push({ nombre: id, motivo: motivoDe(error) })
    }
  }

  return { hechos, omitidos }
}
