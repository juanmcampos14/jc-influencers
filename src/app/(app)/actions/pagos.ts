"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { requireContext } from '@/lib/auth/current'
import { fail, ok, type ActionResult } from '@/lib/actions/result'
import { ValidationError } from '@/lib/authz/errors'
import { assertUploadAllowed } from '@/lib/ports/storage'
import { borrarMovimiento, crearMovimiento, guardarTerminos, marcarPagado } from '@/lib/repos/pagos'

const id = z.string().min(1).max(60)

/** Un número que puede no estar. Vacío es "no hay dato", no cero. */
const monto = z
  .union([z.string(), z.number(), z.null()])
  .transform((valor) => {
    if (valor === null) return null
    const texto = String(valor).trim().replace(',', '.')
    if (!texto) return null
    const numero = Number(texto)
    if (!Number.isFinite(numero)) throw new ValidationError('Escribí un número válido.')
    return numero
  })

export const guardarTerminosAction = defineAction(
  z.object({
    campaignId: id,
    feeMode: z.enum(['PERCENT', 'FIXED', 'NONE']),
    feePercent: monto,
    feeFixed: monto,
    productionCost: monto,
    adSpend: monto,
    terms: z.string().trim().max(2000).nullish(),
    notes: z.string().trim().max(2000).nullish(),
  }),
  async (input, ctx) => {
    await guardarTerminos(ctx, input.campaignId, {
      feeMode: input.feeMode,
      feePercent: input.feePercent,
      feeFixed: input.feeFixed,
      productionCost: input.productionCost,
      adSpend: input.adSpend,
      terms: input.terms ?? null,
      notes: input.notes ?? null,
    })
    revalidatePath(`/campanas/${input.campaignId}`)
    return { ok: true }
  },
)

/**
 * Alta de un movimiento. Va por FormData y no por objeto porque puede traer la
 * factura adjunta.
 */
export async function crearMovimientoAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireContext()
    const campaignId = String(formData.get('campaignId') ?? '')

    const parsed = z
      .object({
        direction: z.enum(['AGENCY_IN', 'TALENT_OUT', 'EXPENSE_OUT']),
        status: z.enum(['PENDING', 'PAID']),
        amount: z.coerce.number().positive('El monto tiene que ser mayor a cero.'),
        concept: z.string().trim().min(1, 'Escribí de qué se trata.').max(200),
        candidacyId: z.string().max(60).nullish(),
        dueDate: z.string().max(30).nullish(),
        paidAt: z.string().max(30).nullish(),
        method: z.string().trim().max(80).nullish(),
        reference: z.string().trim().max(120).nullish(),
        notes: z.string().trim().max(2000).nullish(),
      })
      .parse({
        direction: formData.get('direction'),
        status: formData.get('status'),
        amount: String(formData.get('amount') ?? '').replace(',', '.'),
        concept: formData.get('concept'),
        candidacyId: String(formData.get('candidacyId') ?? '') || null,
        dueDate: String(formData.get('dueDate') ?? '') || null,
        paidAt: String(formData.get('paidAt') ?? '') || null,
        method: String(formData.get('method') ?? '') || null,
        reference: String(formData.get('reference') ?? '') || null,
        notes: String(formData.get('notes') ?? '') || null,
      })

    const archivo = formData.get('documento')
    let documento: { data: Buffer; filename: string; contentType: string } | null = null
    if (archivo instanceof File && archivo.size > 0) {
      assertUploadAllowed(archivo.name, archivo.type || 'application/pdf', archivo.size)
      documento = {
        data: Buffer.from(await archivo.arrayBuffer()),
        filename: archivo.name,
        contentType: archivo.type || 'application/pdf',
      }
    }

    const creado = await crearMovimiento(ctx, campaignId, {
      direction: parsed.direction,
      status: parsed.status,
      amount: parsed.amount,
      concept: parsed.concept,
      candidacyId: parsed.candidacyId ?? null,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      paidAt: parsed.paidAt ? new Date(parsed.paidAt) : null,
      method: parsed.method ?? null,
      reference: parsed.reference ?? null,
      notes: parsed.notes ?? null,
      documento,
    })

    revalidatePath(`/campanas/${campaignId}`)
    return ok(creado)
  } catch (error) {
    return fail(error)
  }
}

export const marcarPagadoAction = defineAction(
  z.object({ paymentId: id, campaignId: id, pagado: z.boolean() }),
  async (input, ctx) => {
    await marcarPagado(ctx, input.paymentId, input.pagado)
    revalidatePath(`/campanas/${input.campaignId}`)
    return { ok: true }
  },
)

export const borrarMovimientoAction = defineAction(
  z.object({ paymentId: id, campaignId: id }),
  async (input, ctx) => {
    await borrarMovimiento(ctx, input.paymentId)
    revalidatePath(`/campanas/${input.campaignId}`)
    return { ok: true }
  },
)
