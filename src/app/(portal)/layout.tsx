import { redirect } from 'next/navigation'
import { AppShell, type NavItem } from '@/components/app-shell'
import { getAuthContext } from '@/lib/auth/current'
import { CLIENT_ROLE_LABELS } from '@/lib/authz/capabilities'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')

  const activeRole = ctx.clients.find((client) => client.id === ctx.activeClientId)?.role
  const nav: NavItem[] = [{ href: '/portal', label: 'Mis campañas' }]

  return (
    <AppShell
      nav={nav}
      clients={ctx.clients.map((client) => ({ id: client.id, name: client.name }))}
      activeClientId={ctx.activeClientId}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      roleLabel={activeRole ? CLIENT_ROLE_LABELS[activeRole] : ctx.side === 'AGENCY' ? 'Agencia' : ''}
      sideLabel="Portal del cliente"
    >
      {children}
    </AppShell>
  )
}
