import 'server-only'
import type { GoalDirection, GoalMetric } from '@/generated/prisma/enums'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope, can } from '@/lib/authz/context'
import { NotFoundError, ValidationError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import {
  esVisibleParaCliente,
  evaluarObjetivos,
  METRICA_LABEL,
  type Mediciones,
  type Metrica,
  type Objetivo,
  type ResumenDeObjetivos,
} from '@/lib/domain/objetivos'
import { actorOf, scoped } from './base'
import { resumirResultados } from './reporting'

/**
 * Los objetivos de una campaña y su evaluación.
 *
 * Las mediciones NO se recalculan acá: salen de donde ya viven --resultados,
 * candidaturas y plata-- para que no puedan divergir. Un objetivo que se evalúa
 * contra su propia copia del número es un objetivo que en algún momento va a
 * decir algo distinto de la pantalla de al lado.
 */

const toNumber = (valor: unknown): number => Number(valor)

export type ObjetivosDeCampana = ResumenDeObjetivos & {
  campaignId: string
  cerrada: boolean
  /** Qué se pudo medir, para poder mostrar de dónde sale cada número. */
  mediciones: Mediciones
}

export async function getObjetivos(ctx: AuthContext, campaignId: string): Promise<ObjetivosDeCampana> {
  // Campaña y objetivos en la misma transacción: ver la nota en `entregas.ts`.
  const { campaign, filas } = await scoped(ctx, async (tx) => {
    const fila = await tx.campaign.findUnique({
      where: { id: campaignId },
      select: { clientId: true, status: true },
    })
    if (!fila) throw new NotFoundError()
    assertClientInScope(ctx, fila.clientId)
    assertCan(ctx, 'campaign.view', fila.clientId)
    return {
      campaign: fila,
      filas: await tx.campaignGoal.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } }),
    }
  })

  const cerrada = campaign.status === 'CLOSED' || campaign.status === 'CANCELLED'

  /*
   * Se mide SÓLO lo que algún objetivo pide.
   *
   * La primera versión traía el resumen entero de resultados --todas las
   * entregas y todos los clics-- para evaluar cualquier objetivo, y esto se
   * llama desde la pestaña de Brief. Medido en producción: la pantalla tardaba
   * 17 segundos en repintarse después de guardar. Sin objetivos definidos no
   * hay nada que medir y el costo tiene que ser cero.
   */
  const pedidas = new Set<Metrica>(filas.map((fila) => fila.metric))
  const mediciones = await medir(ctx, campaignId, campaign.clientId, pedidas)

  /*
   * El filtro por lado va acá y no en la pantalla: un objetivo interno no puede
   * llegar al portal ni siquiera dentro de un payload que después se esconde
   * con CSS.
   */
  const objetivos: Objetivo[] = filas
    .map((fila) => ({
      id: fila.id,
      metric: fila.metric,
      direction: fila.direction,
      target: toNumber(fila.target),
      rationale: fila.rationale,
      clientVisible: fila.clientVisible,
    }))
    .filter((objetivo) => ctx.side === 'AGENCY' || esVisibleParaCliente(objetivo))

  return {
    campaignId,
    cerrada,
    mediciones,
    ...evaluarObjetivos(objetivos, mediciones, { cerrada }),
  }
}

/**
 * Lo que se pudo medir hoy.
 *
 * Cada `null` es deliberado: significa que nadie cargó ese dato. Ninguna de
 * estas ramas devuelve cero por las dudas.
 */
async function medir(
  ctx: AuthContext,
  campaignId: string,
  clientId: string,
  pedidas: Set<Metrica>,
): Promise<Mediciones> {
  const VACIO: Mediciones = {
    ALCANCE_ESTIMADO: null,
    ALCANCE_REAL: null,
    VISUALIZACIONES: null,
    INTERACCIONES: null,
    CLICS: null,
    PUBLICACIONES: null,
    PERFILES_APROBADOS: null,
    INVERSION_EN_TALENTO: null,
  }
  if (pedidas.size === 0) return VACIO

  // Lo que sale de las publicaciones y los links: caro, y sólo si hace falta.
  const DE_RESULTADOS: Metrica[] = [
    'ALCANCE_REAL',
    'VISUALIZACIONES',
    'INTERACCIONES',
    'CLICS',
    'PUBLICACIONES',
  ]
  const necesitaResultados = DE_RESULTADOS.some((metrica) => pedidas.has(metrica))
  const resumen = necesitaResultados ? await resumirResultados(ctx, campaignId) : null

  const DE_CANDIDATURAS: Metrica[] = ['ALCANCE_ESTIMADO', 'PERFILES_APROBADOS', 'INVERSION_EN_TALENTO']
  const necesitaCandidaturas = DE_CANDIDATURAS.some((metrica) => pedidas.has(metrica))
  const aprobados = necesitaCandidaturas
    ? await scoped(ctx, (tx) =>
        tx.candidacy.findMany({
          where: { campaignId, clientApproval: 'APPROVED' },
          select: {
            budgetNegotiated: true,
            cacheAmount: true,
            statusKey: true,
            influencer: { select: { profiles: { select: { followers: true, isPrimary: true } } } },
          },
        }),
      )
    : []

  /*
   * Alcance estimado: seguidores del perfil principal de cada aprobado. Si
   * nadie tiene la cifra cargada, es null y no cero -- una campaña con perfiles
   * sin medir no tiene "alcance cero", tiene alcance desconocido.
   */
  const seguidores = aprobados
    .map((fila) => {
      const principal = fila.influencer.profiles.find((perfil) => perfil.isPrimary) ?? fila.influencer.profiles[0]
      return principal?.followers ?? null
    })
    .filter((valor): valor is number => valor !== null)

  // Sólo cuentan como costo los confirmados, igual que en la pestaña de Pagos.
  const CUENTA_COMO_COSTO = new Set([
    'CONFIRMADO',
    'CONTENIDO_EN_PRODUCCION',
    'CONTENIDO_PARA_APROBACION',
    'PUBLICADO',
    'FINALIZADO',
  ])
  const cachets = aprobados
    .filter((fila) => CUENTA_COMO_COSTO.has(fila.statusKey))
    .map((fila) => (fila.budgetNegotiated ?? fila.cacheAmount) as unknown)
    .filter((valor) => valor !== null && valor !== undefined)
    .map(toNumber)

  const puedeVerPlata = can(ctx, 'budget.view', clientId)

  return {
    ...VACIO,
    ...(pedidas.has('ALCANCE_ESTIMADO')
      ? { ALCANCE_ESTIMADO: seguidores.length === 0 ? null : seguidores.reduce((suma, valor) => suma + valor, 0) }
      : {}),
    ...(resumen
      ? {
          ALCANCE_REAL: resumen.reach.con === 0 ? null : resumen.reach.total,
          VISUALIZACIONES: resumen.views.con === 0 ? null : resumen.views.total,
          INTERACCIONES: resumen.interacciones.con === 0 ? null : resumen.interacciones.total,
          CLICS: resumen.clics.links === 0 ? null : resumen.clics.total,
          PUBLICACIONES: resumen.publicaciones.publicadas,
        }
      : {}),
    ...(pedidas.has('PERFILES_APROBADOS') ? { PERFILES_APROBADOS: aprobados.length } : {}),
    // Sin permiso de presupuestos el número no se calcula, ni siquiera para
    // descartarlo después: no sale de la base.
    ...(pedidas.has('INVERSION_EN_TALENTO')
      ? {
          INVERSION_EN_TALENTO:
            !puedeVerPlata || cachets.length === 0 ? null : cachets.reduce((s, v) => s + v, 0),
        }
      : {}),
  }
}

export type ObjetivoInput = {
  metric: GoalMetric
  direction: GoalDirection
  target: number
  rationale: string | null
  clientVisible: boolean
}

export async function guardarObjetivo(
  ctx: AuthContext,
  campaignId: string,
  input: ObjetivoInput,
): Promise<{ id: string }> {
  const campaign = await scoped(ctx, (tx) =>
    tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true } }),
  )
  if (!campaign) throw new NotFoundError()
  assertClientInScope(ctx, campaign.clientId)
  assertCan(ctx, 'brief.manage', campaign.clientId)

  if (!(input.target > 0)) throw new ValidationError('El objetivo tiene que ser mayor a cero.')
  if (input.metric === 'INVERSION_EN_TALENTO') {
    // Un tope de plata sólo lo pone quien maneja plata.
    assertCan(ctx, 'budget.manage', campaign.clientId)
  }

  return scoped(ctx, async (tx) => {
    const guardado = await tx.campaignGoal.upsert({
      where: { campaignId_metric: { campaignId, metric: input.metric } },
      create: {
        campaignId,
        clientId: campaign.clientId,
        metric: input.metric,
        direction: input.direction,
        target: input.target,
        rationale: input.rationale,
        clientVisible: input.clientVisible,
        createdById: ctx.user.id,
      },
      update: {
        direction: input.direction,
        target: input.target,
        rationale: input.rationale,
        clientVisible: input.clientVisible,
      },
    })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.GOAL_SAVED,
      entityType: 'CampaignGoal',
      entityId: guardado.id,
      clientId: campaign.clientId,
      after: { metrica: input.metric, objetivo: input.target, direccion: input.direction },
    })
    return { id: guardado.id }
  })
}

export async function borrarObjetivo(ctx: AuthContext, goalId: string): Promise<void> {
  const fila = await scoped(ctx, (tx) =>
    tx.campaignGoal.findUnique({ where: { id: goalId }, select: { clientId: true, metric: true } }),
  )
  if (!fila) throw new NotFoundError()
  assertClientInScope(ctx, fila.clientId)
  assertCan(ctx, 'brief.manage', fila.clientId)

  await scoped(ctx, async (tx) => {
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.GOAL_DELETED,
      entityType: 'CampaignGoal',
      entityId: goalId,
      clientId: fila.clientId,
      before: { metrica: fila.metric },
    })
    await tx.campaignGoal.delete({ where: { id: goalId } })
  })
}

/**
 * Los objetivos en texto, para el reporte con IA.
 *
 * Lo que está SIN_DATO se manda declarado como tal. Si le pasáramos sólo los
 * objetivos evaluables, el modelo escribiría el balance de la campaña sobre la
 * mitad de la promesa y lo presentaría como el balance entero.
 */
export function contextoDeObjetivos(resumen: ObjetivosDeCampana): string {
  if (resumen.objetivos.length === 0) {
    return 'La campaña no tiene objetivos definidos. No inventes uno ni digas si "estuvo bien": contá qué pasó.'
  }

  const lineas = resumen.objetivos.map((objetivo) => {
    const sentido = objetivo.direction === 'COMO_MUCHO' ? 'no pasar de' : 'al menos'
    const base = `- ${METRICA_LABEL[objetivo.metric]}: ${sentido} ${objetivo.target}`
    if (objetivo.estado === 'SIN_DATO') {
      return `${base} → SIN DATO. Nadie cargó esa métrica. NO es cero y no es un incumplimiento.`
    }
    return `${base} → ${objetivo.actual} (${objetivo.estado}). ${objetivo.explicacion}`
  })

  if (resumen.veredicto) lineas.push(`\nVeredicto calculado: ${resumen.veredicto}`)
  lineas.push(
    resumen.cerrada
      ? 'La campaña está CERRADA: lo que quedó por debajo del objetivo no se alcanzó.'
      : 'La campaña sigue ABIERTA: lo que va por debajo del objetivo está en camino, no incumplido.',
  )
  return lineas.join('\n')
}
