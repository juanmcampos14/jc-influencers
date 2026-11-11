"use client"

import * as React from 'react'
import { Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm'
import { eliminarCampanaAction } from '../../actions/campaigns'

/**
 * Eliminar una campaña, de verdad.
 *
 * Archivar resuelve casi todo --no aparece, el cliente no la ve-- y es
 * reversible. Esto es lo otro: una campaña creada por error, una prueba, un
 * duplicado. En la base todo cuelga en cascada, así que el botón tiene que
 * decir QUÉ se lleva puesto, con números, antes y no después.
 *
 * Cuando hay pagos o entregas registradas el servidor se niega, y acá ni
 * siquiera se ofrece: para eso está archivar.
 */
export function EliminarCampana({
  campaignId,
  loQueSePierde,
}: {
  campaignId: string
  loQueSePierde: { nombre: string; candidaturas: number; enlacesMedidos: number; sePuedeEliminar: boolean }
}) {
  const t = useTranslations('campanas')
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  if (!loQueSePierde.sePuedeEliminar) return null

  return (
    <ConfirmButton
      title={t('eliminarTitulo', { nombre: loQueSePierde.nombre })}
      description={t('eliminarBajada', {
        candidaturas: loQueSePierde.candidaturas,
        enlaces: loQueSePierde.enlacesMedidos,
      })}
      confirmLabel={t('eliminarConfirmar')}
      tone="danger"
      pending={pending}
      onConfirm={() =>
        startTransition(async () => {
          const result = await eliminarCampanaAction({ campaignId })
          if (!result.ok) {
            toast.error(result.message)
            return
          }
          toast.success(t('eliminada', { nombre: result.data.nombre }))
          router.push('/campanas')
        })
      }
    >
      <Button type="button" variant="ghost" size="sm" disabled={pending}>
        <Trash2 className="size-4" aria-hidden="true" />
        {t('eliminar')}
      </Button>
    </ConfirmButton>
  )
}
