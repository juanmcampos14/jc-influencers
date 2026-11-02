"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { fail, ok, traducirFalla, type ActionResult } from '@/lib/actions/result'
import { requireContext } from '@/lib/auth/current'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { ValidationError } from '@/lib/authz/errors'
import { assertUploadAllowed, MAX_UPLOAD_BYTES } from '@/lib/ports/storage'
import { ajustarImportacion, cancelImport, confirmImport, previewImport, type ImportSummary } from '@/lib/import/runner'
import {
  aplicarPaisesEncontrados,
  ejecutarBusquedaDePaises,
  filasParaPreguntar,
  preverBusquedaDePaises,
} from '@/lib/import/paises'

const XLSX_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
])

/** Subida y previsualización. La validación de tipo y tamaño corre en el servidor. */
export async function previewImportAction(formData: FormData): Promise<ActionResult<ImportSummary>> {
  try {
    const ctx = await requireContext()
    const clientId = String(formData.get('clientId') ?? '')
    assertClientInScope(ctx, clientId)
    assertCan(ctx, 'import.run', clientId)

    const file = formData.get('file')
    if (!(file instanceof File)) throw new ValidationError({ clave: 'elegiXlsx' })
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ValidationError({
        clave: 'archivoDemasiadoGrande',
        valores: { mb: Math.round(MAX_UPLOAD_BYTES / 1024 / 1024) },
      })
    }
    const contentType = XLSX_TYPES.has(file.type)
      ? file.type
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    assertUploadAllowed(file.name, contentType, file.size)

    const data = Buffer.from(await file.arrayBuffer())
    const summary = await previewImport(ctx, { clientId, filename: file.name, data })
    revalidatePath('/importacion')
    return ok(summary)
  } catch (error) {
    // No pasa por `defineAction` --recibe un FormData-- así que traduce el
    // error acá, como haría el camino de siempre.
    return traducirFalla(fail(error), error)
  }
}

export const confirmImportAction = defineAction(
  z.object({ importRunId: z.string().min(1).max(60) }),
  async (input, ctx) => {
    const result = await confirmImport(ctx, input.importRunId)
    revalidatePath('/importacion')
    revalidatePath('/campanas')
    revalidatePath('/influencers')
    return result
  },
)

export const cancelImportAction = defineAction(
  z.object({ importRunId: z.string().min(1).max(60) }),
  async (input, ctx) => {
    await cancelImport(ctx, input.importRunId)
    revalidatePath('/importacion')
    return { ok: true }
  },
)

/** Cambiar el país que se aplica a las filas que no lo traen. */
export const ajustarImportacionAction = defineAction(
  z.object({
    importRunId: z.string().min(1).max(60),
    paisPorDefecto: z.string().trim().max(60).nullable(),
  }),
  async (input, ctx) => {
    const summary = await ajustarImportacion(ctx, input.importRunId, {
      paisPorDefecto: input.paisPorDefecto || null,
    })
    return summary
  },
)

/** Cuántas filas se le pueden preguntar al proveedor, y cuántas no tienen URL. */
export const contarFilasSinPaisAction = defineAction(
  z.object({ importRunId: z.string().min(1).max(60) }),
  async (input, ctx) => filasParaPreguntar(ctx, input.importRunId),
)

/** Paso 1: registrar la consulta al proveedor y decir cuánto sale. No gasta. */
export const preverPaisesAction = defineAction(
  z.object({ importRunId: z.string().min(1).max(60) }),
  async (input, ctx) => preverBusquedaDePaises(ctx, input.importRunId),
)

/** Paso 2: ejecutarla. Acá sí se gasta, y queda en la lista de Búsquedas. */
export const buscarPaisesAction = defineAction(
  z.object({ scoutingRunId: z.string().min(1).max(60) }),
  async (input, ctx) => ejecutarBusquedaDePaises(ctx, input.scoutingRunId),
)

/** Paso 3: traer a la importación los países que contestó. */
export const aplicarPaisesAction = defineAction(
  z.object({
    importRunId: z.string().min(1).max(60),
    scoutingRunId: z.string().min(1).max(60),
  }),
  async (input, ctx) => {
    const resultado = await aplicarPaisesEncontrados(ctx, input)
    revalidatePath('/importacion')
    return resultado
  },
)
