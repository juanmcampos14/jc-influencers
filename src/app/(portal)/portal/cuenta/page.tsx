import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/app-shell'
import { PantallaCuenta } from '@/components/cuenta/pantalla-cuenta'
import { requireContext } from '@/lib/auth/current'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('portal')
  return { title: t('miCuenta') }
}
export const dynamic = 'force-dynamic'

export default async function CuentaPortalPage() {
  const ctx = await requireContext()
  const t = await getTranslations('portal')
  return (
    <>
      <PageHeader
        title={t('miCuenta')}
        description={t('bajadaCuenta')}
      />
      <PantallaCuenta ctx={ctx} />
    </>
  )
}
