"use client"

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm'
import { dismissDuplicateAction } from '../../actions/influencers'

export function DismissButton({ duplicateId }: { duplicateId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function dismiss() {
    startTransition(async () => {
      const result = await dismissDuplicateAction({ duplicateId, notes: 'Revisado: no son la misma persona.' })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('Marcado como revisado.')
      router.refresh()
    })
  }

  return (
    <ConfirmButton
      title="Marcar como revisado"
      description="Confirmás que no son la misma persona. El par deja de aparecer en la lista, pero queda registrado."
      confirmLabel="Sí, no son duplicados"
      tone="primary"
      onConfirm={dismiss}
      pending={pending}
    >
      <Button size="sm" variant="secondary" disabled={pending}>
        No son duplicados
      </Button>
    </ConfirmButton>
  )
}
