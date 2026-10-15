import { getTranslations } from 'next-intl/server'
import { PageSkeleton } from '@/components/ui/page-skeleton'

export default async function Loading() {
  const t = await getTranslations('auditoria')
  return <PageSkeleton title={t('titulo')} stats={false} />
}
