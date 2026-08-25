import { PageSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return <PageSkeleton title="Clientes" description="Cada cliente es un espacio aislado. Los usuarios del cliente sólo ven lo suyo." stats={false} />
}
