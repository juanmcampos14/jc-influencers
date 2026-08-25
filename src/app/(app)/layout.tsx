import { redirect } from 'next/navigation'
import { AppShell, type NavItem } from '@/components/app-shell'
import { getAuthContext } from '@/lib/auth/current'
import { AGENCY_ROLE_LABELS } from '@/lib/authz/capabilities'
import { can } from '@/lib/authz/context'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')
  // El panel interno es sólo para la agencia. Un usuario de cliente va al portal.
  if (ctx.side !== 'AGENCY') redirect('/portal')

  const clientId = ctx.activeClientId
  const nav: NavItem[] = [{ href: '/panel', label: 'Panel' }]
  if (can(ctx, 'client.view', clientId)) nav.push({ href: '/clientes', label: 'Clientes' })
  if (can(ctx, 'campaign.view', clientId)) nav.push({ href: '/campanas', label: 'Campañas' })
  if (can(ctx, 'influencer.view', clientId)) nav.push({ href: '/influencers', label: 'Influencers' })
  if (can(ctx, 'import.run', clientId)) nav.push({ href: '/importacion', label: 'Importación' })
  if (can(ctx, 'membership.manage', null) || can(ctx, 'user.invite', null)) {
    nav.push({ href: '/usuarios', label: 'Usuarios' })
  }
  if (can(ctx, 'audit.view', clientId)) nav.push({ href: '/auditoria', label: 'Auditoría' })

  return (
    <AppShell
      nav={nav}
      clients={ctx.clients.map((client) => ({ id: client.id, name: client.name }))}
      activeClientId={ctx.activeClientId}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      roleLabel={ctx.agencyRole ? AGENCY_ROLE_LABELS[ctx.agencyRole] : ''}
      sideLabel="Panel de agencia"
    >
      {children}
    </AppShell>
  )
}
