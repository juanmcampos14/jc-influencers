import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ResetForm } from './reset-form'

/**
 * El título de la pestaña también está traducido: se lee en el navegador, en
 * los favoritos y en el historial.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titulos')
  return { title: t('nuevaClave') }
}

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ResetForm token={token} />
}
