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
        title={t('desactivarTitulo', { nombre: name })}
        description={t('desactivarBajada')}
        confirmLabel={t('desactivar')}
        onConfirm={toggle}
        pending={pending}
      >
        <Button size="sm" variant="secondary" disabled={pending}>
          {t('desactivar')}
        </Button>
      </ConfirmButton>
    )
  }

  return (
    <Button size="sm" variant="secondary" onClick={toggle} disabled={pending}>
      {t('reactivar')}
    </Button>
  )
}
