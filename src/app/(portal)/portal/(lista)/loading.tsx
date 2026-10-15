import { getTranslations } from 'next-intl/server'
import { PageSkeleton } from '@/components/ui/page-skeleton'

/*
 * El esqueleto también se traduce. Si no, quien abre la plataforma en inglés ve
 * un título en español por un segundo y después cambia: se lee como si hubiera
 * navegado a otro lado.
 */
export default async function Loading() {
  const t = await getTranslations('portal')
  return <PageSkeleton title={t('misCampanas')} />
}
