"use client"

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/field'
import { updateClientAction } from '../../actions/clients'

export function ClientSettingsForm({
  clientId,
  version,
  name,
  allowClientUserInvites,
  allowClientExports,
}: {
  clientId: string
  version: number
  name: string
  allowClientUserInvites: boolean
  allowClientExports: boolean
}) {
  const router = useRouter()
  const [invites, setInvites] = useState(allowClientUserInvites)
  const [exports, setExports] = useState(allowClientExports)
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const result = await updateClientAction({
        clientId,
        version,
        name,
        allowClientUserInvites: invites,
        allowClientExports: exports,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('Permisos actualizados.')
      router.refresh()
    })
  }

  const dirty = invites !== allowClientUserInvites || exports !== allowClientExports

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm text-ink-700">
        <Checkbox checked={invites} onChange={(event) => setInvites(event.target.checked)} className="mt-0.5" />
        <span>
          El administrador del cliente puede invitar compañeros de su empresa
          <span className="block text-xs text-ink-500">Nunca puede otorgar roles internos de la agencia.</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-ink-700">
        <Checkbox checked={exports} onChange={(event) => setExports(event.target.checked)} className="mt-0.5" />
        <span>
          Puede descargar exportaciones
          <span className="block text-xs text-ink-500">
            La exportación sólo incluye los campos que su rol puede ver.
          </span>
        </span>
      </label>
      <Button size="sm" onClick={save} disabled={!dirty || pending}>
        {pending ? 'Guardando…' : 'Guardar cambios'}
      </Button>
    </div>
  )
}
