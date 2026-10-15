import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/app-shell'
import { PantallaCuenta } from '@/components/cuenta/pantalla-cuenta'
import { requireContext } from '@/lib/auth/current'

export const metadata: Metadata = { title: 'Mi cuenta' }
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
