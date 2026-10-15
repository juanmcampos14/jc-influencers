"use client"

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm'
import { setUserStatusAction } from '../actions/users'

export function UserActions({ userId, name, active }: { userId: string; name: string; active: boolean }) {
  const t = useTranslations('usuarios')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function toggle() {
    startTransition(async () => {
      const result = await setUserStatusAction({ userId, active: !active })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(active ? t('usuarioDesactivado') : t('usuarioReactivado'))
      router.refresh()
    })
  }

  if (active) {
    return (
      <ConfirmButton
        title={`Desactivar a ${name}`}
        description="Pierde el acceso en el acto y se cierran todas sus sesiones abiertas. Su historial se conserva."
        confirmLabel={t('desactivar')}
        onConfirm={toggle}
        pending={pending}
      >
        <Button size="sm" variant="secondary" disabled={pending}>
          Desactivar
        </Button>
      </ConfirmButton>
    )
  }

  return (
    <Button size="sm" variant="secondary" onClick={toggle} disabled={pending}>
      Reactivar
    </Button>
  )
}
