import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/current'
import { statusOf } from '@/lib/authz/errors'
import { exportCampaignCandidacies } from '@/lib/repos/exports'

/**
 * Exportación CSV. Las columnas dependen de las capacidades del usuario:
 * lo que no puede ver en pantalla tampoco existe en el archivo.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { campaignId } = await params
  try {
    const result = await exportCampaignCandidacies(ctx, campaignId)
    return new NextResponse(result.body, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const status = statusOf(error)
    if (status === 500) console.error('[export] error', error)
    // Mensaje genérico: no revela si la campaña existe.
    return NextResponse.json({ error: status === 404 ? 'No encontrado' : 'No autorizado' }, { status })
  }
}
