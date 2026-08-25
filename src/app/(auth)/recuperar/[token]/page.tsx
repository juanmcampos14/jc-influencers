import type { Metadata } from 'next'
import { ResetForm } from './reset-form'

export const metadata: Metadata = { title: 'Nueva contraseña' }

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ResetForm token={token} />
}
