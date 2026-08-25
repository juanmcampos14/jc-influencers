import type { AgencyRole, ClientRole } from '@/generated/prisma/enums'
import { withSystemScope, type DbScope } from '@/lib/db/scope'
import { loadSessionByToken, revokeSession, deriveCsrfToken } from '@/lib/auth/session'
import {
  AGENCY_ROLE_CAPABILITIES,
  CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE,
  CLIENT_ROLE_CAPABILITIES,
  isCapability,
  type Capability,
} from './capabilities'
import { ForbiddenError, NotFoundError, UnauthenticatedError } from './errors'

export type ClientAccess = {
  id: string
  slug: string
  name: string
  /** Rol dentro del cliente. Null para empleados de agencia (mandan sus caps de agencia). */
  role: ClientRole | null
  capabilities: ReadonlySet<Capability>
  allowClientUserInvites: boolean
  allowClientExports: boolean
  defaultCurrency: string
  timezone: string
}

export type AuthContext = {
  sessionId: string
  csrfToken: string
  user: { id: string; email: string; name: string; timezone: string; locale: string }
  side: 'AGENCY' | 'CLIENT'
  agencyRole: AgencyRole | null
  /** Capacidades de agencia (vacío para usuarios de cliente). */
  agencyCapabilities: ReadonlySet<Capability>
  /** Clientes accesibles, resueltos desde la base. */
  clients: readonly ClientAccess[]
  allClients: boolean
  activeClientId: string | null
  /** Contexto de base de datos derivado. Es lo que alimenta a RLS. */
  db: DbScope
  ip: string | null
  userAgent: string | null
  correlationId: string
}

function toCapabilitySet(base: readonly Capability[], extras: readonly string[], side: 'AGENCY' | 'CLIENT'): Set<Capability> {
  const set = new Set<Capability>(base)
  for (const raw of extras) {
    if (!isCapability(raw)) continue
    if (side === 'CLIENT' && CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE.has(raw)) continue
    set.add(raw)
  }
  if (side === 'CLIENT') {
    for (const forbidden of CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE) set.delete(forbidden)
  }
  return set
}

type BuildOptions = { ip?: string | null; userAgent?: string | null; correlationId?: string }

/**
 * Construye el contexto de autorización a partir del token de sesión.
 * Todo el alcance sale de la base. Nada llega del navegador.
 */
export async function buildAuthContext(token: string | null, options: BuildOptions = {}): Promise<AuthContext | null> {
  if (!token) return null
  const session = await loadSessionByToken(token)
  if (!session) return null

  const data = await withSystemScope(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: session.userId },
      include: {
        agencyMembership: true,
        clientMemberships: { include: { client: true } },
        agencyClientAssignments: { include: { client: true } },
      },
    })
    if (!user) return null
    if (user.status !== 'ACTIVE') return { disabled: true as const, user }

    const agencyRole = user.agencyMembership?.role ?? null
    const allClients = agencyRole === 'PLATFORM_SUPERADMIN' || agencyRole === 'AGENCY_ADMIN'
    const allClientRows = allClients
      ? await tx.client.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } })
      : []
    return { disabled: false as const, user, agencyRole, allClients, allClientRows }
  })

  if (!data) return null
  if (data.disabled) {
    // Un usuario desactivado pierde el acceso en el acto, aunque tenga cookie válida.
    await revokeSession(session.sessionId, 'user_disabled')
    return null
  }

  const { user, agencyRole, allClients, allClientRows } = data
  const side: 'AGENCY' | 'CLIENT' = agencyRole ? 'AGENCY' : 'CLIENT'

  const agencyCapabilities: ReadonlySet<Capability> = agencyRole
    ? toCapabilitySet(AGENCY_ROLE_CAPABILITIES[agencyRole] ?? [], user.agencyMembership?.extraCapabilities ?? [], 'AGENCY')
    : new Set<Capability>()

  const clients: ClientAccess[] = []
  if (side === 'AGENCY') {
    const rows = allClients ? allClientRows : user.agencyClientAssignments.map((a) => a.client)
    for (const client of rows) {
      clients.push({
        id: client.id,
        slug: client.slug,
        name: client.name,
        role: null,
        capabilities: agencyCapabilities,
        allowClientUserInvites: client.allowClientUserInvites,
        allowClientExports: client.allowClientExports,
        defaultCurrency: client.defaultCurrency,
        timezone: client.timezone,
      })
    }
  } else {
    for (const membership of user.clientMemberships) {
      if (membership.client.status !== 'ACTIVE') continue
      const caps = toCapabilitySet(
        CLIENT_ROLE_CAPABILITIES[membership.role] ?? [],
        membership.extraCapabilities,
        'CLIENT',
      )
      // `user.invite` sólo vale si la agencia habilitó esa capacidad para el cliente.
      if (!membership.client.allowClientUserInvites) caps.delete('user.invite')
      if (!membership.client.allowClientExports) caps.delete('export.create')
      clients.push({
        id: membership.client.id,
        slug: membership.client.slug,
        name: membership.client.name,
        role: membership.role,
        capabilities: caps,
        allowClientUserInvites: membership.client.allowClientUserInvites,
        allowClientExports: membership.client.allowClientExports,
        defaultCurrency: membership.client.defaultCurrency,
        timezone: membership.client.timezone,
      })
    }
  }

  const accessibleIds = clients.map((c) => c.id)
  const activeClientId =
    session.activeClientId && accessibleIds.includes(session.activeClientId)
      ? session.activeClientId
      : (accessibleIds[0] ?? null)

  const db: DbScope = {
    userId: user.id,
    scope: side === 'AGENCY' ? 'agency' : 'client',
    clientIds: accessibleIds,
    allClients,
  }

  return {
    sessionId: session.sessionId,
    csrfToken: deriveCsrfToken(session.token),
    user: { id: user.id, email: user.email, name: user.name, timezone: user.timezone, locale: user.locale },
    side,
    agencyRole,
    agencyCapabilities,
    clients,
    allClients,
    activeClientId,
    db,
    ip: options.ip ?? null,
    userAgent: options.userAgent ?? null,
    correlationId: options.correlationId ?? crypto.randomUUID(),
  }
}

// ── Guards ───────────────────────────────────────────────────────────────────

export function requireAuth(ctx: AuthContext | null): AuthContext {
  if (!ctx) throw new UnauthenticatedError()
  return ctx
}

/** Capacidades efectivas del usuario en un cliente concreto. */
export function capabilitiesFor(ctx: AuthContext, clientId: string | null): ReadonlySet<Capability> {
  if (clientId === null) return ctx.side === 'AGENCY' ? ctx.agencyCapabilities : new Set<Capability>()
  const access = ctx.clients.find((c) => c.id === clientId)
  if (!access) return new Set<Capability>()
  return access.capabilities
}

export function can(ctx: AuthContext, capability: Capability, clientId: string | null = null): boolean {
  return capabilitiesFor(ctx, clientId).has(capability)
}

/**
 * Exige una capacidad. Si el cliente ni siquiera está en alcance se responde 404
 * para no revelar que existe; si está en alcance pero falta la capacidad, 403.
 */
export function assertCan(ctx: AuthContext, capability: Capability, clientId: string | null = null): void {
  if (clientId !== null && !ctx.clients.some((c) => c.id === clientId)) {
    throw new NotFoundError()
  }
  if (!capabilitiesFor(ctx, clientId).has(capability)) {
    throw new ForbiddenError()
  }
}

/** Valida que un clientId recibido del navegador esté realmente en alcance. */
export function assertClientInScope(ctx: AuthContext, clientId: string): ClientAccess {
  const access = ctx.clients.find((c) => c.id === clientId)
  if (!access) throw new NotFoundError()
  return access
}

export const isAgency = (ctx: AuthContext): boolean => ctx.side === 'AGENCY'
export const isClientSide = (ctx: AuthContext): boolean => ctx.side === 'CLIENT'
