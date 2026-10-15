import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/app-shell'
import { PantallaCuenta } from '@/components/cuenta/pantalla-cuenta'
import { requireContext } from '@/lib/auth/current'

/**
 * El título de la pestaña también está traducido: se lee en el navegador, en
 * los favoritos y en el historial.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titulos')
  return { title: t('miCuenta') }
}
export const dynamic = 'force-dynamic'

export default async function CuentaPage() {
  const ctx = await requireContext()
  const t = await getTranslations('cuenta')
  return (
    <>
      <PageHeader
        title={t('titulo')}
        description={t('bajada')}
      />
      <PantallaCuenta ctx={ctx} />
    </>
  )
}
