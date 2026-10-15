import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/app-shell'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Stat, StatStrip } from '@/components/ui/stat'
import { EmptyState } from '@/components/ui/states'
import { columnaFija, Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { can } from '@/lib/authz/context'
import { nombreDeRol } from '@/lib/authz/capabilities'
import { listInvitations, listUsers, resumenDeAccesos } from '@/lib/repos/users'
import { formatDate, formatDateTime } from '@/lib/util/format'
import { InviteDialog } from './invite-dialog'
import { UserActions } from './user-actions'
import { EditarAccesos } from './editar-accesos'
import { RevokeInvitationButton } from './revoke-invitation-button'

/**
 * El título de la pestaña también está traducido: se lee en el navegador, en
 * los favoritos y en el historial.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titulos')
  return { title: t('usuarios') }
}
export const dynamic = 'force-dynamic'

const INVITATION_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'Pendiente', tone: 'amber' },
  ACCEPTED: { label: 'Aceptada', tone: 'emerald' },
  REVOKED: { label: 'Revocada', tone: 'rose' },
  EXPIRED: { label: 'Vencida', tone: 'slate' },
}

export default async function UsersPage() {
  const ctx = await requireContext()
  const t = await getTranslations('usuarios')
  const tPermiso = await getTranslations('permisos')
  const idioma = await getLocale()
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
        title={t('tituloLargo')}
        description={t('bajada')}
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
          <Stat label={t('personasConAcceso')} value={resumen.activas} />
          <Stat label={t('desactivadas')} value={resumen.desactivadas} />
          <Stat label={t('invitacionesPendientes')} value={resumen.invitacionesPendientes} />
          <Stat
            label={t('vencenEstaSemana')}
            value={resumen.vencenPronto}
            tone="warn"
            hint={t('pistaVencen')}
          />
        </StatStrip>
        <Card>
          <CardHeader>
            <CardTitle>{t('personasConAcceso')}</CardTitle>
            {users.length < resumen.activas + resumen.desactivadas ? (
              <CardDescription>
                Se listan {users.length} de {resumen.activas + resumen.desactivadas}. Usá el buscador de tu navegador o
                pedí una exportación para ver el resto.
              </CardDescription>
            ) : null}
          </CardHeader>
          {users.length === 0 ? (
            <EmptyState
              title={t('sinUsuariosTitulo')}
              description={t('bajada')}
            />
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th className={columnaFija}>{t('persona')}</Th>
                    <Th>{t('rolDeAgencia')}</Th>
                    <Th>{t('clientes')}</Th>
                    <Th>{t('estado')}</Th>
                    <Th>{t('ultimoAcceso')}</Th>
                    {canManageMemberships ? (
                      <Th>
                        <span className="sr-only">{t('acciones')}</span>
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
                        {user.agencyRole ? nombreDeRol(tPermiso, user.agencyRole) : <span className="text-ink-400">—</span>}
                        {/*
                          * Un resumen, no la lista entera.
                          *
                          * Antes se imprimía un chip por cada permiso extra:
                          * nueve chips violetas en una fila hacían que la
                          * tabla dejara de escanearse, y encima se colaba una
                          * clave interna --"__client:cmt99g..."-- que no era
                          * un permiso. El detalle vive en Accesos, que es
                          * donde se decide; acá alcanza con saber que esta
                          * persona no tiene el rol tal cual viene.
                          */}
                        {user.agencyExtras.length + user.agencyQuitadas.length > 0 ? (
                          <p className="mt-1 text-xs text-ink-500">
                            {[
                              user.agencyExtras.length > 0 ? `+${user.agencyExtras.length} sumado${user.agencyExtras.length === 1 ? '' : 's'}` : null,
                              user.agencyQuitadas.length > 0 ? `−${user.agencyQuitadas.length} quitado${user.agencyQuitadas.length === 1 ? '' : 's'}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
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
                                {entry.clientName} · <span className="text-ink-500">{nombreDeRol(tPermiso, entry.role)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Td>
                      <Td>
                        {user.status === 'ACTIVE' ? (
                          <Badge tone="emerald" dot>{t('activo')}</Badge>
                        ) : (
                          <Badge tone="rose" dot>{t('desactivado')}</Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-ink-600">
                        {formatDateTime(user.lastLoginAt, ctx.user.timezone, idioma)}
                      </Td>
                      {canManageMemberships ? (
                        <Td>
                          {user.id === ctx.user.id ? (
                            <Badge tone="slate">{t('sosVos')}</Badge>
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
              <CardTitle>{t('invitaciones')}</CardTitle>
              <p className="text-xs text-ink-500">
                Cada invitación tiene un token único, de un solo uso y con vencimiento a 7 días.
              </p>
            </CardHeader>
            {invitations.length === 0 ? (
              <EmptyState title={t('sinInvitacionesTitulo')} description={t('sinInvitacionesBajada')} />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>{t('email')}</Th>
                      <Th>{t('destino')}</Th>
                      <Th>{t('estado')}</Th>
                      <Th>{t('vence')}</Th>
                      <Th>
                        <span className="sr-only">{t('acciones')}</span>
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
                              ? t('destinoAgencia', { rol: nombreDeRol(tPermiso, invitation.agencyRole) })
                              : `${invitation.clientName ?? '—'} · ${
                                  invitation.clientRole ? nombreDeRol(tPermiso, invitation.clientRole) : ''
                                }`}
                          </Td>
                          <Td>
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </Td>
                          <Td className="whitespace-nowrap text-xs text-ink-600">
                            {formatDate(invitation.expiresAt, ctx.user.timezone, idioma)}
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
