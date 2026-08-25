import { PageSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return <PageSkeleton title="Panel" description="Estado de las campañas activas y lo que está esperando una decisión." stats={true} />
}
