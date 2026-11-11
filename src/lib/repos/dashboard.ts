import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, capabilitiesFor } from '@/lib/authz/context'
import { STALE_METRIC_DAYS } from '@/lib/domain/statuses'
import { scoped } from './base'

export type DashboardData = {
  /**
   * Totales contados en la base, sin tope.
   *
   * La lista de campañas trae sólo las 25 más recientes por costo. Sumar esa
   * lista y presentar el resultado como total de la agencia era mentir en
   * cuanto hubiera 26 campañas, y nadie lo habría notado.
   */
  totals: {
    activeCampaigns: number
    proposedProfiles: number
    /** Pendientes que el cliente PUEDE ver. Misma definición que la lista de al lado. */
    awaitingClient: number
    /**
     * Pendientes que el cliente todavía no puede ver. Es trabajo de la agencia,
     * no del cliente. Null para usuarios de cliente: no es asunto suyo.
     */
    notSharedYet: number | null
    approved: number
  }
  /** Cuántas campañas se listan de las que hay. Si no coinciden, la pantalla lo dice. */
  campaignsShown: number
  campaigns: Array<{
    id: string
    name: string
    clientId: string
    clientName: string
    status: string
    total: number
    approved: number
    pending: number
    shortlist: number
    currency: string
    /** Suma de lo negociado o solicitado en las candidaturas. Null si el rol no ve presupuesto. */
    committed: number | null
    /** Presupuesto propio de la campaña (estimado o caché). Null si no hay ninguno cargado. */
    planned: number | null
  }>
  pendingApprovals: Array<{
    candidacyId: string
    campaignId: string
    campaignName: string
    clientName: string
    influencerName: string
    since: string
  }>
  byStatus: Array<{ statusKey: string; count: number }>
  staleMetrics: number
  openDuplicates: number
  canSeeBudget: boolean
}

/** Panel principal. Todo el conteo respeta el alcance del usuario. */
export async function dashboard(ctx: AuthContext, clientId?: string | null): Promise<DashboardData> {
  const scopeClient = clientId ?? ctx.activeClientId
  assertCan(ctx, 'campaign.view', scopeClient)
  const canSeeBudget = capabilitiesFor(ctx, scopeClient).has('budget.view')
  const staleBefore = new Date(Date.now() - STALE_METRIC_DAYS * 24 * 60 * 60 * 1000)

  return scoped(ctx, async (tx) => {
    const campaigns = await tx.campaign.findMany({
      where: {
        ...(clientId ? { clientId } : {}),
        status: { notIn: ['CLOSED', 'CANCELLED'] },
        // Archivada es "no la quiero ver más", y el panel es lo primero que se ve.
        archivedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
      take: 25,
      include: {
        client: { select: { name: true } },
        candidacies: {
          select: {
            clientApproval: true,
            clientVisible: true,
            inShortlist: true,
            budgetNegotiated: true,
            budgetRequested: true,
          },
        },
      },
    })

    const visibleOf = <T extends { clientVisible: boolean }>(rows: T[]) =>
      ctx.side === 'CLIENT' ? rows.filter((r) => r.clientVisible) : rows

    const pendingRows = await tx.candidacy.findMany({
      where: {
        ...(clientId ? { clientId } : {}),
        clientApproval: { in: ['PENDING', 'NEEDS_REVIEW'] },
        clientVisible: true,
        campaign: { status: { notIn: ['CLOSED', 'CANCELLED'] }, archivedAt: null },
      },
      orderBy: { proposedAt: 'asc' },
      take: 20,
      include: {
        influencer: { select: { displayName: true } },
        campaign: { select: { id: true, name: true, client: { select: { name: true } } } },
      },
    })

    const byStatusRows = await tx.candidacy.groupBy({
      by: ['statusKey'],
      where: {
        ...(clientId ? { clientId } : {}),
        ...(ctx.side === 'CLIENT' ? { clientVisible: true } : {}),
      },
      _count: { _all: true },
    })

    // Los totales se cuentan aparte, sobre todo el conjunto y no sobre la
    // página que se muestra.
    const enCampanasVivas: Prisma.CandidacyWhereInput = {
      ...(clientId ? { clientId } : {}),
      campaign: { status: { notIn: ['CLOSED', 'CANCELLED'] }, archivedAt: null },
      ...(ctx.side === 'CLIENT' ? { clientVisible: true } : {}),
    }

    const [activeCampaigns, proposedProfiles, awaitingClient, approved, notSharedYet] = await Promise.all([
      tx.campaign.count({
        where: { ...(clientId ? { clientId } : {}), status: { notIn: ['CLOSED', 'CANCELLED'] }, archivedAt: null },
      }),
      tx.candidacy.count({ where: enCampanasVivas }),
      tx.candidacy.count({
        where: { ...enCampanasVivas, clientApproval: { in: ['PENDING', 'NEEDS_REVIEW'] }, clientVisible: true },
      }),
      tx.candidacy.count({ where: { ...enCampanasVivas, clientApproval: 'APPROVED' } }),
      ctx.side === 'AGENCY'
        ? tx.candidacy.count({
            where: { ...enCampanasVivas, clientApproval: { in: ['PENDING', 'NEEDS_REVIEW'] }, clientVisible: false },
          })
        : Promise.resolve(null),
    ])

    const [staleMetrics, openDuplicates] = ctx.side === 'AGENCY'
      ? await Promise.all([
          tx.socialProfile.count({ where: { OR: [{ measuredAt: null }, { measuredAt: { lt: staleBefore } }] } }),
          tx.influencerDuplicate.count({ where: { status: 'OPEN' } }),
        ])
      : [0, 0]

    return {
      totals: { activeCampaigns, proposedProfiles, awaitingClient, notSharedYet, approved },
      campaignsShown: campaigns.length,
      campaigns: campaigns.map((campaign) => {
        const rows = visibleOf(campaign.candidacies)
        return {
          id: campaign.id,
          name: campaign.name,
          clientId: campaign.clientId,
          clientName: campaign.client.name,
          status: campaign.status,
          total: rows.length,
          approved: rows.filter((r) => r.clientApproval === 'APPROVED').length,
          pending: rows.filter((r) => r.clientApproval === 'PENDING' || r.clientApproval === 'NEEDS_REVIEW').length,
          shortlist: rows.filter((r) => r.inShortlist).length,
          currency: campaign.currency,
          committed: canSeeBudget
            ? rows.reduce((sum, r) => sum + Number(r.budgetNegotiated ?? r.budgetRequested ?? 0), 0)
            : null,
          planned: canSeeBudget
            ? (campaign.budgetEstimated ?? campaign.budgetCache) === null
              ? null
              : Number(campaign.budgetEstimated ?? campaign.budgetCache)
            : null,
        }
      }),
      pendingApprovals: pendingRows.map((row) => ({
        candidacyId: row.id,
        campaignId: row.campaign.id,
        campaignName: row.campaign.name,
        clientName: row.campaign.client.name,
        influencerName: row.influencer.displayName,
        since: (row.proposedAt ?? row.createdAt).toISOString(),
      })),
      byStatus: byStatusRows.map((row) => ({ statusKey: row.statusKey, count: row._count._all })),
      staleMetrics,
      openDuplicates,
      canSeeBudget,
    }
  })
}
