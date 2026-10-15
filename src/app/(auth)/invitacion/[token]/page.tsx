import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Card, CardBody } from '@/components/ui/card'
import { inspectInvitation } from '@/lib/auth/flows'
import { AcceptForm } from './accept-form'

/**
 * El título de la pestaña también está traducido: se lee en el navegador, en
 * los favoritos y en el historial.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titulos')
  return { title: t('aceptarInvitacion') }
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invitation = await inspectInvitation(token)
  const t = await getTranslations('ingreso')

  if (!invitation) {
    return (
      <Card>
        <CardBody>
          <h1 className="mb-2 text-base font-semibold text-ink-900">{t('invitacionNoDisponibleTitulo')}</h1>
          <p className="text-sm text-ink-600">{t('invitacionNoDisponibleBajada')}</p>
        </CardBody>
      </Card>
    )
  }

  return <AcceptForm token={token} invitation={invitation} />
}
