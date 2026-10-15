import { NextIntlClientProvider } from 'next-intl'
import { redirect } from 'next/navigation'
import { getMessages, getTranslations } from 'next-intl/server'
import { AppShell, type NavItem } from '@/components/app-shell'
import { ThemeScope } from '@/components/theme-scope'
import { BarraDeVistaPrevia } from '@/components/barra-vista-previa'
import { getAuthContext } from '@/lib/auth/current'
import { nombreDeRol } from '@/lib/authz/capabilities'
import { getActiveTheme } from '@/lib/repos/brand'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')
  const t = await getTranslations('portal')
  const tPermiso = await getTranslations('permisos')

  const activeClient = ctx.clients.find((client) => client.id === ctx.activeClientId)
  const nav: NavItem[] = [{ href: '/portal', labelKey: 'misCampanas', icon: 'campanas' }]

  // El espacio de cada cliente se ve con su identidad. Si no tiene una aprobada,
  // se usa el tema neutro de JC.
  const theme = await getActiveTheme(ctx, ctx.activeClientId)

  /* Con sesión de cliente ya puesta, viaja el catálogo entero. */
  const mensajes = await getMessages()

  return (
    <NextIntlClientProvider messages={mensajes}>
      <ThemeScope theme={theme} className="zona-marca">
        {/*
          * Dentro del ThemeScope a propósito: la barra tiene que verse sobre el
          * espacio del cliente, con su tema puesto, porque eso es lo que se está
          * mirando.
          */}
        {ctx.preview ? <BarraDeVistaPrevia nombreDelCliente={ctx.preview.nombreDelCliente} /> : null}
        <AppShell
          nav={nav}
          clients={ctx.clients.map((client) => ({ id: client.id, name: client.name }))}
          activeClientId={ctx.activeClientId}
          user={{ name: ctx.user.name, email: ctx.user.email }}
          roleLabel={
            activeClient?.role ? nombreDeRol(tPermiso, activeClient.role) : ctx.side === 'AGENCY' ? t('agencia') : ''
          }
          sideLabel={t('portalDelCliente')}
          accountHref="/portal/cuenta"
          muralUrl={theme.muralUrl}
          fondoUrl={theme.fondoUrl}
          fondoOpacidad={theme.fondoOpacidad}
          brandName={activeClient?.name ?? null}
          logoUrl={theme.logoUrl}
          logoNeedsBackdrop={theme.logoUrl !== null && !theme.logoIsDark && theme.mode === 'LIGHT'}
        >
          {children}
        </AppShell>
      </ThemeScope>
    </NextIntlClientProvider>
  )
}
