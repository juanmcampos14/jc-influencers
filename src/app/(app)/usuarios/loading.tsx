import { getTranslations } from 'next-intl/server'
import { PageSkeleton } from '@/components/ui/page-skeleton'

export default async function Loading() {
  const t = await getTranslations('usuarios')
  return <PageSkeleton title={t('tituloLargo')} stats={false} />
}
