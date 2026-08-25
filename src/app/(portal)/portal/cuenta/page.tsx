import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell'
import { PantallaCuenta } from '@/components/cuenta/pantalla-cuenta'
import { requireContext } from '@/lib/auth/current'

export const metadata: Metadata = { title: 'Mi cuenta' }
export const dynamic = 'force-dynamic'

export default async function CuentaPortalPage() {
  const ctx = await requireContext()
  return (
    <>
      <PageHeader
        title="Mi cuenta"
        description="Con qué email entrás, qué ves, y cómo cambiar tu contraseña."
      />
      <PantallaCuenta ctx={ctx} />
    </>
  )
}
