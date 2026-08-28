import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Stat, StatStrip } from '@/components/ui/stat'
import { EmptyState } from '@/components/ui/states'
import { columnaFija, Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { can } from '@/lib/authz/context'
import { AGENCY_ROLE_LABELS, CLIENT_ROLE_LABELS, capabilityLabel } from '@/lib/authz/capabilities'
import { listInvitations, listUsers, resumenDeAccesos } from '@/lib/repos/users'
import { formatDate, formatDateTime } from '@/lib/util/format'
import { InviteDialog } from './invite-dialog'
import { UserActions } from './user-actions'
import { EditarAccesos } from './editar-accesos'
import { RevokeInvitationButton } from './revoke-invitation-button'

export const metadata: Metadata = { title: 'Usuarios' }
export const dynamic = 'force-dynamic'

const INVITATION_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'Pendiente', tone: 'amber' },
  ACCEPTED: { label: 'Aceptada', tone: 'emerald' },
  REVOKED: { label: 'Revocada', tone: 'rose' },
  EXPIRED: { label: 'Vencida', tone: 'slate' },
}

export default async function UsersPage() {
  const ctx = await requireContext()
  const canInvite = can(ctx, 'user.invite', null) || ctx.clients.some((client) => can(ctx, 'user.invite', client.id))
  const canManageMemberships = ctx.allClients && can(ctx, 'membership.manage', null)

  const [users, invitations, resumen] = await loadPage(() =>
    Promise.all([
      listUsers(ctx, null),
      canInvite ? listInvitations(ctx, null) : Promise.resolve([]),
      // Contadas en la base: las listas están acotadas y sumarlas mentiría.
      resumenDeAccesos(ctx),
    ]),
  )

  return (
    <>
      <PageHeader
        title="Usuarios y accesos"
        description="No hay registro público: el acceso se habilita por invitación."
        actions={
          canInvite ? (
            <InviteDialog
              clients={ctx.clients.map((client) => ({
                id: client.id,
                name: client.name,
                allowClientUserInvites: client.allowClientUserInvites,
              }))}
              canInviteAgency={ctx.allClients}
              isSuperadmin={ctx.agencyRole === 'PLATFORM_SUPERADMIN'}
            />
          ) : null
        }
      />

      <div className="space-y-6 px-5 py-6 sm:px-8">
        <StatStrip>
          <Stat label="Personas con acceso" value={resumen.activas} />
          <Stat label="Desactivadas" value={resumen.desactivadas} />
          <Stat label="Invitaciones pendientes" value={resumen.invitacionesPendientes} />
          <Stat
            label="Vencen esta semana"
            value={resumen.vencenPronto}
            tone="warn"
            hint="Después hay que volver a invitar"
          />
        </StatStrip>
        <Card>
          <CardHeader>
            <CardTitle>Personas con acceso</CardTitle>
            {users.length < resumen.activas + resumen.desactivadas ? (
              <CardDescription>
                Se listan {users.length} de {resumen.activas + resumen.desactivadas}. Usá el buscador de tu navegador o
                pedí una exportación para ver el resto.
              </CardDescription>
            ) : null}
          </CardHeader>
          {users.length === 0 ? (
            <EmptyState
              title="Sin usuarios"
              description="El acceso se habilita por invitación: no hay registro público."
            />
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th className={columnaFija}>Persona</Th>
                    <Th>Rol de agencia</Th>
                    <Th>Clientes</Th>
                    <Th>Estado</Th>
                    <Th>Último acceso</Th>
                    {canManageMemberships ? (
                      <Th>
                        <span className="sr-only">Acciones</span>
                      </Th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <Tr key={user.id}>
                      <Td className={columnaFija}>
                        <p className="font-medium text-ink-900">{user.name}</p>
                        <p className="text-xs text-ink-500">{user.email}</p>
                      </Td>
                      <Td className="text-sm">
                        {user.agencyRole ? AGENCY_ROLE_LABELS[user.agencyRole] : <span className="text-ink-400">—</span>}
                        {user.agencyExtras.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {user.agencyExtras.map((extra) => (
                              <Badge key={extra} tone="violet">
                                {capabilityLabel(extra)}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </Td>
                      <Td className="text-xs">
                        {user.agencyRole ? (
                          user.agencyClients.length > 0 ? (
                            <span>{user.agencyClients.map((entry) => entry.clientName).join(', ')}</span>
                          ) : (
                            <span className="text-ink-500">
                              {user.agencyRole === 'AGENCY_ADMIN' || user.agencyRole === 'PLATFORM_SUPERADMIN'
                                ? 'Todos'
                                : 'Sin asignar'}
                            </span>
                          )
                        ) : (
                          <ul className="space-y-0.5">
                            {user.clients.map((entry) => (
                              <li key={entry.clientId}>
                                {entry.clientName} · <span className="text-ink-500">{CLIENT_ROLE_LABELS[entry.role]}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Td>
                      <Td>
                        {user.status === 'ACTIVE' ? (
                          <Badge tone="emerald" dot>Activo</Badge>
                        ) : (
                          <Badge tone="rose" dot>Desactivado</Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-ink-600">
                        {formatDateTime(user.lastLoginAt, ctx.user.timezone)}
                      </Td>
                      {canManageMemberships ? (
                        <Td>
                          {user.id === ctx.user.id ? (
                            <Badge tone="slate">Sos vos</Badge>
                          ) : (
                            <div className="flex items-center gap-1">
                              <EditarAccesos
                                acceso={{
                                  userId: user.id,
                                  name: user.name,
                                  agencyRole: user.agencyRole ?? null,
                                  agencyExtras: user.agencyExtras,
                                  agencyQuitadas: user.agencyQuitadas,
                                  agencyClientIds: user.agencyClients.map((entry) => entry.clientId),
                                  clientMemberships: user.clients.map((entry) => ({
                                    clientId: entry.clientId,
                                    clientName: entry.clientName,
                                    role: entry.role,
                                    extras: entry.extras ?? [],
                                    quitadas: entry.quitadas ?? [],
                                  })),
                                }}
                                clients={ctx.clients.map((c) => ({ id: c.id, name: c.name }))}
                              />
                              <UserActions userId={user.id} name={user.name} active={user.status === 'ACTIVE'} />
                            </div>
                          )}
                        </Td>
                      ) : null}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>

        {canInvite ? (
          <Card>
            <CardHeader>
              <CardTitle>Invitaciones</CardTitle>
              <p className="text-xs text-ink-500">
                Cada invitación tiene un token único, de un solo uso y con vencimiento a 7 días.
              </p>
            </CardHeader>
            {invitations.length === 0 ? (
              <EmptyState title="Sin invitaciones" description="Todavía no enviaste ninguna." />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Email</Th>
                      <Th>Destino</Th>
                      <Th>Estado</Th>
                      <Th>Vence</Th>
                      <Th>
                        <span className="sr-only">Acciones</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((invitation) => {
                      const status = INVITATION_STATUS[invitation.status] ?? { label: invitation.status, tone: 'slate' }
                      return (
                        <Tr key={invitation.id}>
                          <Td>
                            <p className="text-sm text-ink-900">{invitation.email}</p>
                            <p className="text-xs text-ink-500">{invitation.name}</p>
                          </Td>
                          <Td className="text-xs">
                            {invitation.agencyRole
                              ? `Agencia · ${AGENCY_ROLE_LABELS[invitation.agencyRole]}`
                              : `${invitation.clientName ?? '—'} · ${invitation.clientRole ? CLIENT_ROLE_LABELS[invitation.clientRole] : ''}`}
                          </Td>
                          <Td>
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </Td>
                          <Td className="whitespace-nowrap text-xs text-ink-600">
                            {formatDate(invitation.expiresAt, ctx.user.timezone)}
                          </Td>
                          <Td>
                            {invitation.status === 'PENDING' ? (
                              <RevokeInvitationButton invitationId={invitation.id} email={invitation.email} />
                            ) : null}
                          </Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
        ) : null}
      </div>
    </>
  )
}
