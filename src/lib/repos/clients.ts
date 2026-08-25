import 'server-only'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { NotFoundError, ValidationError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import { slugify } from '@/lib/domain/normalize'
import { actorOf, assertUpdated, scoped } from './base'

export type ClientSummary = {
  id: string
  slug: string
  name: string
  country: string | null
  markets: string[]
  status: string
  defaultCurrency: string
  allowClientUserInvites: boolean
  allowClientExports: boolean
  campaignCount: number
  activeCampaignCount: number
  userCount: number
  version: number
}

export async function listClients(ctx: AuthContext): Promise<ClientSummary[]> {
  assertCan(ctx, 'client.view', ctx.clients[0]?.id ?? null)
  return scoped(ctx, async (tx) => {
    const rows = await tx.client.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { memberships: true } },
        campaigns: { select: { status: true } },
      },
    })
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      country: row.country,
      markets: row.markets,
      status: row.status,
      defaultCurrency: row.defaultCurrency,
      allowClientUserInvites: row.allowClientUserInvites,
      allowClientExports: row.allowClientExports,
      campaignCount: row.campaigns.length,
      activeCampaignCount: row.campaigns.filter((c) => c.status !== 'CLOSED' && c.status !== 'CANCELLED').length,
      userCount: row._count.memberships,
      version: row.version,
    }))
  })
}

export async function getClient(ctx: AuthContext, clientId: string) {
  assertClientInScope(ctx, clientId)
  assertCan(ctx, 'client.view', clientId)
  const row = await scoped(ctx, (tx) => tx.client.findUnique({ where: { id: clientId } }))
  if (!row) throw new NotFoundError()
  return row
}

export type CreateClientInput = {
  name: string
  legalName?: string | null
  country?: string | null
  markets?: string[]
  website?: string | null
  description?: string | null
  defaultCurrency?: string
  timezone?: string
  allowClientUserInvites?: boolean
  allowClientExports?: boolean
}

export async function createClient(ctx: AuthContext, input: CreateClientInput): Promise<{ id: string; slug: string }> {
  // Sólo roles con alcance total de agencia pueden dar de alta un tenant.
  if (!ctx.allClients) throw new NotFoundError()
  assertCan(ctx, 'client.manage', null)

  const baseSlug = slugify(input.name)
  if (!baseSlug) throw new ValidationError('El nombre del cliente no genera un identificador válido.')

  return scoped(ctx, async (tx) => {
    let slug = baseSlug
    let attempt = 1
    while (await tx.client.findUnique({ where: { slug } })) {
      attempt += 1
      slug = `${baseSlug}-${attempt}`
      if (attempt > 50) throw new ValidationError('No se pudo generar un identificador único.')
    }
    const created = await tx.client.create({
      data: {
        slug,
        name: input.name.trim(),
        legalName: input.legalName ?? null,
        country: input.country ?? null,
        markets: input.markets ?? [],
        website: input.website ?? null,
        description: input.description ?? null,
        defaultCurrency: input.defaultCurrency ?? 'USD',
        timezone: input.timezone ?? 'America/Argentina/Buenos_Aires',
        allowClientUserInvites: input.allowClientUserInvites ?? false,
        allowClientExports: input.allowClientExports ?? true,
        createdById: ctx.user.id,
      },
    })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.CLIENT_CREATED,
      entityType: 'Client',
      entityId: created.id,
      clientId: created.id,
      after: { name: created.name, slug: created.slug },
    })
    return { id: created.id, slug: created.slug }
  })
}

export type UpdateClientInput = Partial<CreateClientInput> & { version: number }

export async function updateClient(ctx: AuthContext, clientId: string, input: UpdateClientInput): Promise<void> {
  assertClientInScope(ctx, clientId)
  assertCan(ctx, 'client.manage', clientId)

  await scoped(ctx, async (tx) => {
    const before = await tx.client.findUnique({ where: { id: clientId } })
    if (!before) throw new NotFoundError()
    const result = await tx.client.updateMany({
      where: { id: clientId, version: input.version },
      data: {
        name: input.name?.trim(),
        legalName: input.legalName,
        country: input.country,
        markets: input.markets,
        website: input.website,
        description: input.description,
        defaultCurrency: input.defaultCurrency,
        timezone: input.timezone,
        allowClientUserInvites: input.allowClientUserInvites,
        allowClientExports: input.allowClientExports,
        version: { increment: 1 },
      },
    })
    assertUpdated(result.count)
    const after = await tx.client.findUnique({ where: { id: clientId } })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.CLIENT_UPDATED,
      entityType: 'Client',
      entityId: clientId,
      clientId,
      before: { name: before.name, allowClientUserInvites: before.allowClientUserInvites },
      after: { name: after?.name, allowClientUserInvites: after?.allowClientUserInvites },
    })
  })
}

/**
 * Perfiles esperando decisión, por cliente.
 *
 * Es lo que ordena el día: qué cliente tiene gente esperando que le respondan.
 * No estaba en ningún lado, ni como cifra ni como columna.
 */
export async function pendientesPorCliente(ctx: AuthContext): Promise<Map<string, number>> {
  assertCan(ctx, 'client.view', null)
  return scoped(ctx, async (tx) => {
    const filas = await tx.candidacy.groupBy({
      by: ['clientId'],
      where: {
        clientApproval: { in: ['PENDING', 'NEEDS_REVIEW'] },
        // Sólo lo que el cliente puede ver: lo que todavía no le compartimos es
        // trabajo nuestro, no suyo.
        clientVisible: true,
        campaign: { status: { notIn: ['CLOSED', 'CANCELLED'] } },
      },
      _count: { _all: true },
    })
    return new Map(filas.map((fila) => [fila.clientId, fila._count._all]))
  })
}
