import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { RecoverForm } from './recover-form'

/**
 * El título de la pestaña también está traducido: se lee en el navegador, en
 * los favoritos y en el historial.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titulos')
  return { title: t('recuperarAcceso') }
}

export default function RecoverPage() {
  return <RecoverForm />
}
