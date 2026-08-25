import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/app-shell'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { assertCan } from '@/lib/authz/context'
import { getBrand } from '@/lib/repos/brand'
import { getClient } from '@/lib/repos/clients'
import { scoutingProvider } from '@/lib/ports/scouting'
import { BrandStudio } from './brand-studio'

export const metadata: Metadata = { title: 'Identidad visual' }
export const dynamic = 'force-dynamic'

export default async function BrandPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params
  const ctx = await requireContext()

  const { client, brand } = await loadPage(async () => {
    assertCan(ctx, 'brand.manage', clientId)
    return { client: await getClient(ctx, clientId), brand: await getBrand(ctx, clientId) }
  })

  return (
    <>
      <PageHeader
        title={`Identidad visual · ${client.name}`}
        variant="nombre"
        description="Define cómo se ve el espacio de este cliente. Se aplica a su portal, no al panel interno de la agencia."
        breadcrumb={
          <span className="flex gap-1">
            <Link href="/clientes" className="hover:underline">
              Clientes
            </Link>
            <span>/</span>
            <Link href={`/clientes/${clientId}`} className="hover:underline">
              {client.name}
            </Link>
          </span>
        }
      />
      <div className="px-5 py-6 sm:px-8">
        <BrandStudio
          clientId={clientId}
          clientName={client.name}
          brand={brand}
          instagramAvailable={scoutingProvider().configured}
        />
      </div>
    </>
  )
}
