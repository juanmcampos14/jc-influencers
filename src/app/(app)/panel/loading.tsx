import { getTranslations } from 'next-intl/server'
import { PageSkeleton } from '@/components/ui/page-skeleton'

export default async function Loading() {
  const [tNav, t] = await Promise.all([getTranslations('navegacion'), getTranslations('panel')])
  return <PageSkeleton title={tNav('panel')} description={t('bajada')} stats={true} />
}
