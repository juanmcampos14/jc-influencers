"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { fail, ok, type ActionResult } from '@/lib/actions/result'
import { requireContext } from '@/lib/auth/current'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { ValidationError } from '@/lib/authz/errors'
import { assertUploadAllowed, MAX_UPLOAD_BYTES } from '@/lib/ports/storage'
import { cancelImport, confirmImport, previewImport, type ImportSummary } from '@/lib/import/runner'

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
    return fail(error)
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
