"use client"

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('clientes')
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
      toast.success(t('permisosActualizados'))
      router.refresh()
    })
  }

  const dirty = invites !== allowClientUserInvites || exports !== allowClientExports

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm text-ink-700">
        <Checkbox checked={invites} onChange={(event) => setInvites(event.target.checked)} className="mt-0.5" />
        <span>
          {t('permisoInvitar')}
          <span className="block text-xs text-ink-500">{t('permisoInvitarAyuda')}</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-ink-700">
        <Checkbox checked={exports} onChange={(event) => setExports(event.target.checked)} className="mt-0.5" />
        <span>
          {t('permisoExportar')}
          <span className="block text-xs text-ink-500">{t('permisoExportarAyuda')}</span>
        </span>
      </label>
      <Button size="sm" onClick={save} disabled={!dirty || pending}>
        {pending ? t('guardando') : t('guardarCambios')}
      </Button>
    </div>
  )
}
