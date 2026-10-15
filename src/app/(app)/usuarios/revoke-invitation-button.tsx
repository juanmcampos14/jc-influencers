"use client"

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm'
import { revokeInvitationAction } from '../actions/users'

export function RevokeInvitationButton({ invitationId, email }: { invitationId: string; email: string }) {
  const t = useTranslations('usuarios')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function revoke() {
    startTransition(async () => {
      const result = await revokeInvitationAction({ invitationId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(t('invitacionRevocada'))
      router.refresh()
    })
  }

  return (
    <ConfirmButton
      title={t('revocarInvitacion')}
      description={`El enlace enviado a ${email} deja de funcionar de inmediato.`}
      confirmLabel={t('revocar')}
      onConfirm={revoke}
      pending={pending}
    >
      <Button size="sm" variant="ghost" disabled={pending}>
        Revocar
      </Button>
    </ConfirmButton>
  )
}
