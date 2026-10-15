import { redirect } from 'next/navigation'
import { AppShell, type NavItem } from '@/components/app-shell'
import { getAuthContext } from '@/lib/auth/current'
import { getTranslations } from 'next-intl/server'
import { nombreDeRol } from '@/lib/authz/capabilities'
import { can } from '@/lib/authz/context'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')
  const [t, tPermiso] = await Promise.all([getTranslations('navegacion'), getTranslations('permisos')])
  /*
   * El panel interno es sólo para la agencia. Un usuario de cliente va al
   * portal -- y en vista previa el contexto ES de cliente, así que quien esté
   * mirando con los ojos del cliente también termina ahí. Es exactamente lo
   * que tiene que pasar: la vista previa no es media vista previa.
   */
  if (ctx.side !== 'AGENCY') redirect('/portal')

  const clientId = ctx.activeClientId
  const nav: NavItem[] = [{ href: '/panel', labelKey: 'panel', icon: 'panel' }]
  if (can(ctx, 'client.view', clientId)) nav.push({ href: '/clientes', labelKey: 'clientes', icon: 'clientes' })
  if (can(ctx, 'campaign.view', clientId)) nav.push({ href: '/campanas', labelKey: 'campanas', icon: 'campanas' })
  /*
   * Scouting dejó de ser una sección propia: ahora es un lugar dentro de
   * Influencers. La entrada aparece con cualquiera de las dos capacidades,
   * porque los permisos son independientes y quien sólo puede buscar seguiría
   * teniendo a dónde entrar.
   */
  const puedeVerInfluencers =
    can(ctx, 'influencer.view', clientId) || ctx.clients.some((client) => can(ctx, 'scouting.run', client.id))
  if (puedeVerInfluencers) nav.push({ href: '/influencers', labelKey: 'influencers', icon: 'influencers' })
  if (can(ctx, 'import.run', clientId)) nav.push({ href: '/importacion', labelKey: 'importacion', icon: 'importacion' })
  if (can(ctx, 'membership.manage', null) || can(ctx, 'user.invite', null)) {
    nav.push({ href: '/usuarios', labelKey: 'usuarios', icon: 'usuarios' })
  }
  if (can(ctx, 'audit.view', clientId)) nav.push({ href: '/auditoria', labelKey: 'auditoria', icon: 'auditoria' })

  return (
    <AppShell
      nav={nav}
      clients={ctx.clients.map((client) => ({ id: client.id, name: client.name }))}
      activeClientId={ctx.activeClientId}
      verTodos={ctx.allClients}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      roleLabel={ctx.agencyRole ? nombreDeRol(tPermiso, ctx.agencyRole) : ''}
      sideLabel={t('panelDeAgencia')}
      accountHref="/cuenta"
    >
      {children}
    </AppShell>
  )
}
