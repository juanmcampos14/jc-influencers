"use client"

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { entrarEnVistaPreviaAction } from '../../actions/vista-previa'

/**
 * Entrar a ver el espacio con los ojos del cliente.
 *
 * Existe porque hasta ahora la única forma de saber qué ve el cliente era
 * abrir el portal como agencia -- y eso mostraba de más: los perfiles que
 * todavía no se le compartieron aparecían igual. Una vista previa que muestra
 * de más es peor que no tener ninguna, porque confirma algo falso.
 */
export function VerComoElCliente({ clientId, nombre }: { clientId: string; nombre: string }) {
  const t = useTranslations('clientes')
  const router = useRouter()
  const [pendiente, startTransition] = React.useTransition()

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pendiente}
      onClick={() =>
        startTransition(async () => {
          const resultado = await entrarEnVistaPreviaAction({ clientId }).catch(() => null)
          if (!resultado?.ok) {
            toast.error(resultado && !resultado.ok ? resultado.message : t('noSeAbrioVistaPrevia'))
            return
          }
          router.push('/portal')
        })
      }
    >
      <Eye className="size-4" aria-hidden="true" />
      {pendiente ? t('abriendo') : t('verComo', { nombre })}
    </Button>
  )
}
