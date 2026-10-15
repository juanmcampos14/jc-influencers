import { getTranslations } from 'next-intl/server'
import { PageSkeleton } from '@/components/ui/page-skeleton'

/*
 * El esqueleto tiene que decir lo mismo que la pantalla. Decía "Base de
 * influencers" cuando la página ya se llama "Influencers": el título cambiaba
 * al terminar de cargar y se leía como si hubiera navegado a otro lado.
 */
export default async function Loading() {
  const t = await getTranslations('influencers')
  return <PageSkeleton title={t('titulo')} description={t('bajada')} stats={false} />
}
