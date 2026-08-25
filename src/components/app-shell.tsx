"use client"

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown, LogOut, Menu, X } from 'lucide-react'
import { cn } from '@/lib/util/format'
import { switchClientAction } from '@/app/(app)/actions/session'
import { logoutAction } from '@/app/(app)/actions/session'

export type NavItem = { href: string; label: string; badge?: number }
export type ShellClient = { id: string; name: string }

export function AppShell({
  nav,
  clients,
  activeClientId,
  user,
  roleLabel,
  sideLabel,
  children,
}: {
  nav: NavItem[]
  clients: ShellClient[]
  activeClientId: string | null
  user: { name: string; email: string }
  roleLabel: string
  sideLabel: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [switching, startSwitch] = React.useTransition()
  const active = clients.find((client) => client.id === activeClientId)

  function switchTo(clientId: string) {
    startSwitch(async () => {
      await switchClientAction({ clientId })
      router.refresh()
    })
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <header className="flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3 lg:hidden">
        <span className="text-sm font-semibold text-ink-900">JC Influencers</span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-md p-2 text-ink-700 hover:bg-ink-100"
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
          'w-full shrink-0 border-b border-ink-200 bg-white lg:w-64 lg:border-b-0 lg:border-r',
          open ? 'block' : 'hidden lg:block',
        )}
        aria-label="Navegación principal"
      >
        <div className="hidden px-5 py-4 lg:block">
          <p className="text-sm font-semibold tracking-tight text-ink-900">JC Influencers</p>
          <p className="text-xs text-ink-500">{sideLabel}</p>
        </div>

        {clients.length > 0 ? (
          <div className="border-y border-ink-200 px-3 py-3">
            <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              Espacio de trabajo
            </p>
            {clients.length === 1 ? (
              <p className="px-2 text-sm font-medium text-ink-800">{active?.name ?? clients[0]?.name}</p>
            ) : (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-ink-300 px-3 py-2 text-sm text-ink-800 hover:bg-ink-50 disabled:opacity-60"
                  disabled={switching}
                >
                  <span className="truncate">{active?.name ?? 'Elegí un cliente'}</span>
                  <ChevronDown className="size-4 shrink-0 text-ink-500" aria-hidden="true" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="z-50 max-h-80 w-64 overflow-y-auto rounded-lg border border-ink-200 bg-white p-1 shadow-lg"
                    align="start"
                    sideOffset={4}
                  >
                    {clients.map((client) => (
                      <DropdownMenu.Item
                        key={client.id}
                        onSelect={() => switchTo(client.id)}
                        className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-ink-800 outline-none data-[highlighted]:bg-ink-100"
                      >
                        <span className="truncate">{client.name}</span>
                        {client.id === activeClientId ? <Check className="size-4 text-brand-600" /> : null}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
            <p className="mt-1.5 px-2 text-[11px] text-ink-400">
              Se trabaja en un cliente por vez. Los datos nunca se mezclan.
            </p>
          </div>
        ) : null}

        <ul className="space-y-0.5 p-3">
          {nav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm',
                    isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-700 hover:bg-ink-100',
                  )}
                >
                  <span>{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="mt-auto border-t border-ink-200 p-3">
          <p className="truncate px-2 text-sm font-medium text-ink-800">{user.name}</p>
          <p className="truncate px-2 text-xs text-ink-500">{user.email}</p>
          <p className="mt-0.5 truncate px-2 text-xs text-ink-400">{roleLabel}</p>
          <form action={logoutAction} className="mt-2">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-ink-100"
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
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  breadcrumb?: React.ReactNode
}) {
  return (
    <div className="border-b border-ink-200 bg-white px-5 py-5 sm:px-8">
      {breadcrumb ? <div className="mb-2 text-xs text-ink-500">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h1>
          {description ? <p className="mt-0.5 max-w-2xl text-sm text-ink-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
