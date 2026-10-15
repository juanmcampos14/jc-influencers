import 'server-only'
import type { AgencyFeeMode, PaymentDirection, PaymentStatus } from '@/generated/prisma/enums'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import { calcularCuentas, calcularSaldos, type Cuentas, type Saldo } from '@/lib/domain/dinero'
import { fileStorage } from '@/lib/ports/storage'
import { actorOf, scoped } from './base'

/**
 * La plata de una campaña.
 *
 * Todo este archivo está detrás de `budget.view` / `budget.manage`. No es una
 * pantalla más: acá están los márgenes de la agencia, y un usuario de cliente
 * --o un empleado sin ese permiso-- no puede ver cuánto se gana con él.
 */

const toNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value)

export type MovimientoDto = {
  id: string
  direction: PaymentDirection
  status: PaymentStatus
  amount: number
  currency: string
  concept: string
  dueDate: string | null
  paidAt: string | null
  method: string | null
  reference: string | null
  notes: string | null
  candidacyId: string | null
  /** A quién corresponde, cuando el movimiento es de un influencer. */
  quien: string | null
  documento: { nombre: string; url: string } | null
  version: number
}

export type PlanDeCampana = {
  campaignId: string
  currency: string
  terminos: {
    feeMode: AgencyFeeMode
    feePercent: number | null
    feeFixed: number | null
    productionCost: number | null
    adSpend: number | null
    terms: string | null
    notes: string | null
    version: number
  }
  cuentas: Cuentas
  saldos: Record<PaymentDirection, Saldo>
  movimientos: MovimientoDto[]
  /** Los perfiles confirmados y lo que se acordó con cada uno. */
  talento: Array<{ candidacyId: string; nombre: string; acordado: number | null; pagado: number; pendiente: number }>
}

const TERMINOS_VACIOS = {
  feeMode: 'PERCENT' as AgencyFeeMode,
  feePercent: null,
  feeFixed: null,
  productionCost: null,
  adSpend: null,
  terms: null,
  notes: null,
  version: 1,
}

/** Estados en los que un perfil ya cuesta plata. Antes de eso no es un costo. */
const CUENTA_COMO_COSTO = new Set([
  'CONFIRMADO',
  'CONTENIDO_EN_PRODUCCION',
  'CONTENIDO_PARA_APROBACION',
  'PUBLICADO',
  'FINALIZADO',
])

export async function getPlan(ctx: AuthContext, campaignId: string): Promise<PlanDeCampana> {
  const campaign = await scoped(ctx, (tx) =>
    tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true, currency: true } }),
  )
  if (!campaign) throw new NotFoundError()
  assertClientInScope(ctx, campaign.clientId)
  assertCan(ctx, 'budget.view', campaign.clientId)

  return scoped(ctx, async (tx) => {
    const [finance, candidacies, payments] = await Promise.all([
      tx.campaignFinance.findUnique({ where: { campaignId } }),
      tx.candidacy.findMany({
        where: { campaignId },
        select: {
          id: true,
          statusKey: true,
          budgetNegotiated: true,
          cacheAmount: true,
          influencer: { select: { displayName: true } },
        },
      }),
      tx.payment.findMany({
        where: { campaignId },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
        include: { candidacy: { select: { influencer: { select: { displayName: true } } } } },
      }),
    ])

    const terminos = finance
      ? {
          feeMode: finance.feeMode,
          feePercent: toNumber(finance.feePercent),
          feeFixed: toNumber(finance.feeFixed),
          productionCost: toNumber(finance.productionCost),
          adSpend: toNumber(finance.adSpend),
          terms: finance.terms,
          notes: finance.notes,
          version: finance.version,
        }
      : TERMINOS_VACIOS

    /*
     * Sólo los confirmados cuentan como costo. Un perfil en screening todavía
     * no cuesta nada, y meterlo en la cotización infla el número con gente que
     * capaz nunca participe.
     */
    const confirmados = candidacies.filter((c) => CUENTA_COMO_COSTO.has(c.statusKey))
    const acordadoDe = (c: (typeof candidacies)[number]): number | null =>
      toNumber(c.budgetNegotiated) ?? toNumber(c.cacheAmount)

    const cuentas = calcularCuentas(terminos, confirmados.map((c) => ({ monto: acordadoDe(c) })))

    const saldos = calcularSaldos(
      payments.map((p) => ({ direction: p.direction, status: p.status, amount: Number(p.amount) })),
    )

    const porCandidatura = new Map<string, { pagado: number; pendiente: number }>()
    for (const pago of payments) {
      if (pago.direction !== 'TALENT_OUT' || !pago.candidacyId || pago.status === 'CANCELLED') continue
      const actual = porCandidatura.get(pago.candidacyId) ?? { pagado: 0, pendiente: 0 }
      if (pago.status === 'PAID') actual.pagado += Number(pago.amount)
      else actual.pendiente += Number(pago.amount)
      porCandidatura.set(pago.candidacyId, actual)
    }

    return {
      campaignId,
      currency: campaign.currency,
      terminos,
      cuentas,
      saldos,
      movimientos: payments.map((p) => ({
        id: p.id,
        direction: p.direction,
        status: p.status,
        amount: Number(p.amount),
        currency: p.currency,
        concept: p.concept,
        dueDate: p.dueDate?.toISOString() ?? null,
        paidAt: p.paidAt?.toISOString() ?? null,
        method: p.method,
        reference: p.reference,
        notes: p.notes,
        candidacyId: p.candidacyId,
        quien: p.candidacy?.influencer.displayName ?? null,
        documento: p.documentKey
          ? { nombre: p.documentName ?? 'Comprobante', url: `/api/pagos/${p.id}/comprobante` }
          : null,
        version: p.version,
      })),
      talento: confirmados.map((c) => ({
        candidacyId: c.id,
        nombre: c.influencer.displayName,
        acordado: acordadoDe(c),
        pagado: porCandidatura.get(c.id)?.pagado ?? 0,
        pendiente: porCandidatura.get(c.id)?.pendiente ?? 0,
      })),
    }
  })
}

export type TerminosInput = {
  feeMode: AgencyFeeMode
  feePercent: number | null
  feeFixed: number | null
  productionCost: number | null
  adSpend: number | null
  terms: string | null
  notes: string | null
}

export async function guardarTerminos(
  ctx: AuthContext,
  campaignId: string,
  input: TerminosInput,
): Promise<void> {
  const campaign = await scoped(ctx, (tx) =>
    tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true } }),
  )
  if (!campaign) throw new NotFoundError()
  assertClientInScope(ctx, campaign.clientId)
  assertCan(ctx, 'budget.manage', campaign.clientId)

  if (input.feeMode === 'PERCENT' && input.feePercent !== null && (input.feePercent < 0 || input.feePercent > 100)) {
    throw new ValidationError({ clave: 'porcentajeFueraDeRango' })
  }

  await scoped(ctx, async (tx) => {
    const antes = await tx.campaignFinance.findUnique({ where: { campaignId } })
    const datos = {
      feeMode: input.feeMode,
      feePercent: input.feePercent,
      feeFixed: input.feeFixed,
      productionCost: input.productionCost,
      adSpend: input.adSpend,
      terms: input.terms,
      notes: input.notes,
    }
    await tx.campaignFinance.upsert({
      where: { campaignId },
      create: { campaignId, clientId: campaign.clientId, ...datos },
      update: { ...datos, version: { increment: 1 } },
    })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.FINANCE_UPDATED,
      entityType: 'CampaignFinance',
      entityId: campaignId,
      clientId: campaign.clientId,
      before: antes ? { feeMode: antes.feeMode, feePercent: toNumber(antes.feePercent) } : null,
      after: { feeMode: input.feeMode, feePercent: input.feePercent },
    })
  })
}

export type MovimientoInput = {
  direction: PaymentDirection
  status: PaymentStatus
  amount: number
  concept: string
  candidacyId: string | null
  dueDate: Date | null
  paidAt: Date | null
  method: string | null
  reference: string | null
  notes: string | null
  documento: { data: Buffer; filename: string; contentType: string } | null
}

export async function crearMovimiento(
  ctx: AuthContext,
  campaignId: string,
  input: MovimientoInput,
): Promise<{ id: string }> {
  const campaign = await scoped(ctx, (tx) =>
    tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true, currency: true } }),
  )
  if (!campaign) throw new NotFoundError()
  assertClientInScope(ctx, campaign.clientId)
  assertCan(ctx, 'budget.manage', campaign.clientId)

  if (!(input.amount > 0)) throw new ValidationError({ clave: 'montoMayorACero' })
  /*
   * Marcar algo como pagado sin decir cuándo deja un cobro que nadie puede
   * ubicar en el tiempo. Se completa con hoy antes que dejarlo vacío.
   */
  const paidAt = input.status === 'PAID' ? (input.paidAt ?? new Date()) : null

  if (input.candidacyId) {
    const pertenece = await scoped(ctx, (tx) =>
      tx.candidacy.findFirst({ where: { id: input.candidacyId!, campaignId }, select: { id: true } }),
    )
    if (!pertenece) throw new ValidationError({ clave: 'perfilAjenoALaCampana' })
  }

  const guardado = input.documento
    ? await fileStorage().put({
        data: input.documento.data,
        filename: input.documento.filename,
        contentType: input.documento.contentType,
        clientId: campaign.clientId,
        prefix: 'comprobantes',
      })
    : null
  const documentKey = guardado?.key ?? null

  return scoped(ctx, async (tx) => {
    const creado = await tx.payment.create({
      data: {
        clientId: campaign.clientId,
        campaignId,
        candidacyId: input.candidacyId,
        direction: input.direction,
        status: input.status,
        amount: input.amount,
        currency: campaign.currency,
        concept: input.concept,
        dueDate: input.dueDate,
        paidAt,
        method: input.method,
        reference: input.reference,
        notes: input.notes,
        documentKey,
        documentName: input.documento?.filename ?? null,
        createdById: ctx.user.id,
      },
    })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.PAYMENT_CREATED,
      entityType: 'Payment',
      entityId: creado.id,
      clientId: campaign.clientId,
      after: { direction: input.direction, status: input.status, amount: input.amount },
    })
    return { id: creado.id }
  })
}

export async function marcarPagado(
  ctx: AuthContext,
  paymentId: string,
  pagado: boolean,
): Promise<void> {
  const pago = await scoped(ctx, (tx) =>
    tx.payment.findUnique({ where: { id: paymentId }, select: { clientId: true, status: true, campaignId: true } }),
  )
  if (!pago) throw new NotFoundError()
  assertClientInScope(ctx, pago.clientId)
  assertCan(ctx, 'budget.manage', pago.clientId)
  if (pago.status === 'CANCELLED') throw new ValidationError({ clave: 'movimientoCancelado' })

  await scoped(ctx, async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: pagado ? 'PAID' : 'PENDING',
        paidAt: pagado ? new Date() : null,
        version: { increment: 1 },
      },
    })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.PAYMENT_UPDATED,
      entityType: 'Payment',
      entityId: paymentId,
      clientId: pago.clientId,
      before: { status: pago.status },
      after: { status: pagado ? 'PAID' : 'PENDING' },
    })
  })
}

export async function borrarMovimiento(ctx: AuthContext, paymentId: string): Promise<void> {
  const pago = await scoped(ctx, (tx) =>
    tx.payment.findUnique({ where: { id: paymentId }, select: { clientId: true, documentKey: true, amount: true } }),
  )
  if (!pago) throw new NotFoundError()
  assertClientInScope(ctx, pago.clientId)
  assertCan(ctx, 'budget.manage', pago.clientId)

  await scoped(ctx, async (tx) => {
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.PAYMENT_DELETED,
      entityType: 'Payment',
      entityId: paymentId,
      clientId: pago.clientId,
      before: { monto: Number(pago.amount) },
    })
    await tx.payment.delete({ where: { id: paymentId } })
  })

  if (pago.documentKey) {
    await fileStorage()
      .remove(pago.documentKey, { clientId: pago.clientId })
      .catch(() => undefined)
  }
}

/** El comprobante de un movimiento, para servirlo por HTTP. */
export async function leerComprobante(
  ctx: AuthContext,
  paymentId: string,
): Promise<{ data: Buffer; contentType: string; filename: string }> {
  const pago = await scoped(ctx, (tx) =>
    tx.payment.findUnique({
      where: { id: paymentId },
      select: { clientId: true, documentKey: true, documentName: true },
    }),
  )
  if (!pago || !pago.documentKey) throw new NotFoundError()
  assertClientInScope(ctx, pago.clientId)
  // Ver una factura es ver plata: mismo permiso que el resto de la pestaña.
  if (!ctx.agencyRole) throw new ForbiddenError()
  assertCan(ctx, 'budget.view', pago.clientId)

  const data = await fileStorage().get(pago.documentKey, { clientId: pago.clientId })
  return {
    data,
    // El tipo se fija al servir, no se toma de lo que subieron: un comprobante
    // se muestra o se baja, nunca se ejecuta.
    contentType: 'application/octet-stream',
    filename: pago.documentName ?? 'comprobante',
  }
}
