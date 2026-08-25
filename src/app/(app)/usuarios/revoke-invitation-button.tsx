"use client"

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm'
import { revokeInvitationAction } from '../actions/users'

export function RevokeInvitationButton({ invitationId, email }: { invitationId: string; email: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function revoke() {
    startTransition(async () => {
      const result = await revokeInvitationAction({ invitationId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('Invitación revocada. El enlace deja de funcionar.')
      router.refresh()
    })
  }

  return (
    <ConfirmButton
      title="Revocar invitación"
      description={`El enlace enviado a ${email} deja de funcionar de inmediato.`}
      confirmLabel="Revocar"
      onConfirm={revoke}
      pending={pending}
    >
      <Button size="sm" variant="ghost" disabled={pending}>
        Revocar
      </Button>
    </ConfirmButton>
  )
}
