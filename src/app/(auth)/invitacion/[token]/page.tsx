import type { Metadata } from 'next'
import { Card, CardBody } from '@/components/ui/card'
import { inspectInvitation } from '@/lib/auth/flows'
import { AcceptForm } from './accept-form'

export const metadata: Metadata = { title: 'Aceptar invitación' }

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invitation = await inspectInvitation(token)

  if (!invitation) {
    return (
      <Card>
        <CardBody>
          <h1 className="mb-2 text-base font-semibold text-ink-900">Esta invitación no está disponible</h1>
          <p className="text-sm text-ink-600">
            El enlace no es válido, ya se usó o venció. Pedile a la agencia que te mande uno nuevo.
          </p>
        </CardBody>
      </Card>
    )
  }

  return <AcceptForm token={token} invitation={invitation} />
}
