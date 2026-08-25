import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth/current'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Ingresar' }

export default async function LoginPage() {
  const ctx = await getAuthContext()
  if (ctx) redirect(ctx.side === 'AGENCY' ? '/panel' : '/portal')
  return <LoginForm />
}
