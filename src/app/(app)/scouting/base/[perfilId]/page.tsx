import { permanentRedirect } from 'next/navigation'

/** La ficha de un perfil descubierto se mudó adentro de Influencers. */
export default async function FichaMudada({ params }: { params: Promise<{ perfilId: string }> }) {
  const { perfilId } = await params
  permanentRedirect(`/influencers/descubiertos/${perfilId}`)
}
