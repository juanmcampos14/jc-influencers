import { redirect } from 'next/navigation'
import { AppShell, type NavItem } from '@/components/app-shell'
import { ThemeScope } from '@/components/theme-scope'
import { getAuthContext } from '@/lib/auth/current'
import { CLIENT_ROLE_LABELS } from '@/lib/authz/capabilities'
import { getActiveTheme } from '@/lib/repos/brand'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')

  const activeClient = ctx.clients.find((client) => client.id === ctx.activeClientId)
  const nav: NavItem[] = [{ href: '/portal', label: 'Mis campañas', icon: 'campanas' }]

  // El espacio de cada cliente se ve con su identidad. Si no tiene una aprobada,
  // se usa el tema neutro de JC.
  const theme = await getActiveTheme(ctx, ctx.activeClientId)

  return (
    <ThemeScope theme={theme} className="zona-marca">
      <AppShell
        nav={nav}
        clients={ctx.clients.map((client) => ({ id: client.id, name: client.name }))}
        activeClientId={ctx.activeClientId}
        user={{ name: ctx.user.name, email: ctx.user.email }}
        roleLabel={activeClient?.role ? CLIENT_ROLE_LABELS[activeClient.role] : ctx.side === 'AGENCY' ? 'Agencia' : ''}
        sideLabel="Portal del cliente"
        accountHref="/portal/cuenta"
        muralUrl={theme.muralUrl}
        brandName={activeClient?.name ?? null}
        logoUrl={theme.logoUrl}
        logoNeedsBackdrop={theme.logoUrl !== null && !theme.logoIsDark && theme.mode === 'LIGHT'}
      >
        {children}
      </AppShell>
    </ThemeScope>
  )
}
