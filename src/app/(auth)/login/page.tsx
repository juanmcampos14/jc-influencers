import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth/current'
import { LoginForm } from './login-form'

/**
 * El título de la pestaña también está traducido: se lee en el navegador, en
 * los favoritos y en el historial.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titulos')
  return { title: t('ingresar') }
}

export default async function LoginPage() {
  const ctx = await getAuthContext()
  if (ctx) redirect(ctx.side === 'AGENCY' ? '/panel' : '/portal')
  return <LoginForm />
}
