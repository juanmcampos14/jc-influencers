import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { can } from '@/lib/authz/context'
import { AGENCY_ROLE_LABELS, CLIENT_ROLE_LABELS } from '@/lib/authz/capabilities'
import { listInvitations, listUsers } from '@/lib/repos/users'
import { formatDate, formatDateTime } from '@/lib/util/format'
import { InviteDialog } from './invite-dialog'
import { UserActions } from './user-actions'
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

  const [users, invitations] = await loadPage(() =>
    Promise.all([
    listUsers(ctx, null),
      canInvite ? listInvitations(ctx, null) : Promise.resolve([]),
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
        <Card>
          <CardHeader>
            <CardTitle>Personas con acceso</CardTitle>
          </CardHeader>
          {users.length === 0 ? (
            <EmptyState title="Sin usuarios" description="Invitá a la primera persona." />
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Persona</Th>
                    <Th>Rol de agencia</Th>
                    <Th>Clientes</Th>
                    <Th>Estado</Th>
                    <Th>Último acceso</Th>
                    {canManageMemberships ? <Th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <Tr key={user.id}>
                      <Td>
                        <p className="font-medium text-ink-900">{user.name}</p>
                        <p className="text-xs text-ink-500">{user.email}</p>
                      </Td>
                      <Td className="text-sm">
                        {user.agencyRole ? AGENCY_ROLE_LABELS[user.agencyRole] : <span className="text-ink-400">—</span>}
                        {user.agencyExtras.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {user.agencyExtras.map((extra) => (
                              <Badge key={extra} tone="violet">
                                {extra}
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
                          <Badge tone="emerald">Activo</Badge>
                        ) : (
                          <Badge tone="rose">Desactivado</Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-ink-600">
                        {formatDateTime(user.lastLoginAt, ctx.user.timezone)}
                      </Td>
                      {canManageMemberships ? (
                        <Td>
                          {user.id === ctx.user.id ? (
                            <span className="text-xs text-ink-400">vos</span>
                          ) : (
                            <UserActions userId={user.id} name={user.name} active={user.status === 'ACTIVE'} />
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
                      <Th />
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
