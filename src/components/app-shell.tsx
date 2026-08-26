"use client"

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  BarChart3,
  Building2,
  Check,
  ChevronsUpDown,
  ClipboardList,
  FileUp,
  LayoutDashboard,
  LogOut,
  Menu,
  Megaphone,
  Radar,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/util/format'
import { switchClientAction } from '@/app/(app)/actions/session'
import { logoutAction } from '@/app/(app)/actions/session'

/** Nombres de ícono admitidos. El layout es un componente de servidor y no puede pasar componentes. */
export type NavIcon =
  | 'panel'
  | 'clientes'
  | 'campanas'
  | 'influencers'
  | 'scouting'
  | 'importacion'
  | 'usuarios'
  | 'auditoria'

const ICONOS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  panel: LayoutDashboard,
  clientes: Building2,
  campanas: Megaphone,
  influencers: Users,
  scouting: Radar,
  importacion: FileUp,
  usuarios: ShieldCheck,
  auditoria: ClipboardList,
}

export type NavItem = { href: string; label: string; badge?: number; icon?: NavIcon }
export type ShellClient = { id: string; name: string }

/** Iniciales para el avatar de quien está usando la aplicación. */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const primera = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''
  return (primera + ultima).toUpperCase()
}

export function AppShell({
  nav,
  clients,
  activeClientId,
  verTodos = false,
  user,
  roleLabel,
  sideLabel,
  brandName,
  logoUrl,
  logoNeedsBackdrop = false,
  accountHref,
  children,
}: {
  nav: NavItem[]
  clients: ShellClient[]
  activeClientId: string | null
  /** Quien ve todos los clientes puede elegir el conjunto como espacio de trabajo. */
  verTodos?: boolean
  user: { name: string; email: string }
  roleLabel: string
  sideLabel: string
  /** Nombre de la marca del espacio actual. Reemplaza al de JC en el portal. */
  brandName?: string | null
  logoUrl?: string | null
  /**
   * Un logo de trazo claro desaparece sobre un panel claro. Cuando pasa, se lo
   * muestra sobre un fondo del color de la marca para que siempre se vea.
   */
  logoNeedsBackdrop?: boolean
  /** Adónde lleva "Mi cuenta". Cada lado tiene la suya, con su propio shell. */
  accountHref: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [switching, startSwitch] = React.useTransition()
  const active = clients.find((client) => client.id === activeClientId)

  // Escape cierra el menú: se abre a pantalla completa y quedarse sin salida
  // con el teclado no es aceptable.
  React.useEffect(() => {
    if (!open) return
    const alPresionar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [open])

  function switchTo(clientId: string | null) {
    startSwitch(async () => {
      await switchClientAction({ clientId })
      router.refresh()
    })
  }

  /*
   * El logo del cliente es lo primero que mira quien entra a su espacio, así
   * que manda: va centrado y al doble de alto que el lockup de JC, que es una
   * firma y no un encabezado.
   */
  const marca = logoUrl ? (
    <span className={cn('inline-flex items-center rounded-lg', logoNeedsBackdrop && 'bg-white/10 px-3 py-2')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt={brandName ?? ''} className="max-h-16 max-w-[176px] object-contain" />
    </span>
  ) : brandName ? (
    <span className="titulo-display text-lg text-nav-text-strong">{brandName}</span>
  ) : (
    <span className="inline-flex items-baseline gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/jc-monograma.png" alt="JC" className="h-5 w-auto" />
      <span className="titulo-display text-[15px] leading-none text-nav-text-strong">Influencers</span>
    </span>
  )

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/*
        * Pegado arriba: sin esto, para cambiar de sección desde el medio de una
        * tabla de doscientas filas había que subir hasta el principio.
        */}
      <header className="zona-oscura sticky top-0 z-40 flex items-center justify-between bg-nav px-4 py-3 lg:hidden">
        {marca}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-md p-2 text-nav-text hover:bg-nav-2 hover:text-nav-text-strong"
          aria-expanded={open}
          aria-controls="nav-principal"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>

      <nav
        id="nav-principal"
        className={cn(
          'zona-oscura flex w-full shrink-0 flex-col bg-nav lg:w-[248px] lg:sticky lg:top-0 lg:h-screen',
          open ? 'block' : 'hidden lg:flex',
        )}
        aria-label="Navegación principal"
      >
        <div className={cn('hidden px-5 pb-4 pt-5 lg:block', logoUrl && 'text-center')}>
          {marca}
          <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-nav-text-2">{sideLabel}</p>
        </div>

        {clients.length > 0 ? (
          <div className="px-3 pb-3 pt-3 lg:pt-0">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-nav-text-2">
              Espacio de trabajo
            </p>
            {clients.length === 1 && !verTodos ? (
              <p className="rounded-lg bg-nav-2 px-3 py-2 text-sm font-medium text-nav-text-strong">
                {active?.name ?? clients[0]?.name}
              </p>
            ) : (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  className="flex w-full items-center justify-between gap-2 rounded-lg bg-nav-2 px-3 py-2 text-sm font-medium text-nav-text-strong hover:bg-nav-active disabled:opacity-60"
                  disabled={switching}
                >
                  <span className="truncate">{active?.name ?? (verTodos ? 'Todos los clientes' : 'Elegí un cliente')}</span>
                  <ChevronsUpDown className="size-3.5 shrink-0 text-nav-text" aria-hidden="true" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="z-50 max-h-80 w-64 overflow-y-auto rounded-xl border border-ink-200 bg-surface p-1 shadow-xl"
                    align="start"
                    sideOffset={6}
                  >
                    {verTodos ? (
                      <>
                        {/*
                          * "Todos" es una opción explícita, no el estado por
                          * defecto disfrazado. Antes la barra nombraba un
                          * cliente y las pantallas mostraban el conjunto: la
                          * promesa de que los datos no se mezclan se rompía en
                          * la primera pantalla.
                          */}
                        <DropdownMenu.Item
                          onSelect={() => switchTo(null)}
                          className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-800 outline-none data-[highlighted]:bg-ink-100"
                        >
                          <span className="truncate">Todos los clientes</span>
                          {activeClientId === null ? <Check className="size-4 text-ink-900" /> : null}
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator className="my-1 h-px bg-ink-200" />
                      </>
                    ) : null}
                    {clients.map((client) => (
                      <DropdownMenu.Item
                        key={client.id}
                        onSelect={() => switchTo(client.id)}
                        className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-800 outline-none data-[highlighted]:bg-ink-100"
                      >
                        <span className="truncate">{client.name}</span>
                        {client.id === activeClientId ? <Check className="size-4 text-ink-900" /> : null}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
            <p className="mt-1.5 px-2 text-[11px] leading-snug text-nav-text-2">
              Se trabaja en un cliente por vez. Los datos nunca se mezclan.
            </p>
          </div>
        ) : null}

        <ul className="space-y-0.5 px-3 pb-3">
          {nav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icono = item.icon ? ICONOS[item.icon] : BarChart3
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-nav-active font-semibold text-nav-active-text'
                      : 'text-nav-text hover:bg-nav-2 hover:text-nav-text-strong',
                  )}
                >
                  {/* La marca activa no es sólo el color: también esta barra. */}
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-nav-active-text"
                    />
                  ) : null}
                  <Icono className="size-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span className="rounded-full bg-nav-active-text px-1.5 py-px text-[11px] font-bold text-nav">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="mt-auto border-t border-nav-border p-3">
          {brandName && logoUrl ? (
            <p className="mb-2 px-2 text-[11px] text-nav-text-2">Espacio gestionado por JC Influencers</p>
          ) : null}
          {/*
            * El email va siempre, no sólo cuando falta el rol: quien tiene dos
            * cuentas en el mismo producto no puede distinguirlas por el nombre,
            * que es el mismo en las dos. El rol pasa a una tercera línea.
            */}
          <div className="flex items-center gap-2.5 px-2 py-1">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-nav-2 text-[11px] font-bold text-nav-text-strong">
              {iniciales(user.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-nav-text-strong">{user.name}</span>
              <span className="block truncate text-[11px] text-nav-text-2" title={user.email}>
                {user.email}
              </span>
              {roleLabel ? (
                <span className="block truncate text-[11px] text-nav-text-2">{roleLabel}</span>
              ) : null}
            </span>
          </div>
          <Link
            href={accountHref}
            onClick={() => setOpen(false)}
            className={cn(
              'mt-1.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-nav-text hover:bg-nav-2 hover:text-nav-text-strong',
              pathname === accountHref && 'bg-nav-2 text-nav-text-strong',
            )}
          >
            <Settings className="size-4" aria-hidden="true" />
            Mi cuenta
          </Link>
          <form action={logoutAction} className="mt-0.5">
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-nav-text hover:bg-nav-2 hover:text-nav-text-strong"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Cerrar sesión
            </button>
          </form>
        </div>
      </nav>

      <main id="contenido" className="min-w-0 flex-1 bg-ink-50">
        {children}
      </main>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  badge,
  variant = 'seccion',
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  breadcrumb?: React.ReactNode
  /** Estado del objeto, al lado del título. Entre los botones parecía un botón. */
  badge?: React.ReactNode
  /**
   * `seccion` es para los títulos fijos del producto (Campañas, Clientes) y va
   * en condensada mayúscula. `nombre` es para lo que escribió el usuario -- una
   * campaña, un cliente, un influencer -- y respeta cómo lo tipeó: gritarlo en
   * mayúsculas borra su decisión y no entra en un teléfono.
   */
  variant?: 'seccion' | 'nombre'
}) {
  /*
   * `data-encabezado` existe para que el espacio del cliente pueda pintarlo con
   * SU color sin que este componente sepa que existe el concepto de marca. La
   * regla vive en `.zona-marca`, que envuelve sólo al portal: en el panel
   * interno de la agencia el encabezado sigue siendo neutro, porque ahí se
   * trabaja sobre varios clientes a la vez y teñirlo mentiría.
   */
  return (
    <div data-encabezado className="border-b border-ink-200 bg-surface px-5 py-5 sm:px-8">
      {breadcrumb ? <div className="mb-2 text-xs text-ink-500">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
          <h1
            className={
              variant === 'seccion'
                ? 'titulo-display text-[26px] text-ink-950 sm:text-[30px]'
                : 'text-xl font-semibold tracking-tight text-ink-950 sm:text-2xl'
            }
          >
            {title}
          </h1>
          {badge}
          </div>
          {description ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
