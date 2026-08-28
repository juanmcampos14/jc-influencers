import { PageSkeleton } from '@/components/ui/page-skeleton'

/*
 * El esqueleto tiene que decir lo mismo que la pantalla. Decía "Base de
 * influencers" cuando la página ya se llama "Influencers": el título cambiaba
 * al terminar de cargar y se leía como si hubiera navegado a otro lado.
 */
export default function Loading() {
  return (
    <PageSkeleton
      title="Influencers"
      description="La gente que ya incorporamos. Un influencer existe una sola vez y participa en varias campañas."
      stats={false}
    />
  )
}
