"use client"

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import { AUDIT_ACTIONS, auditActionLabel, entityTypeLabel } from '@/lib/domain/labels'

/* Las entidades que de verdad aparecen filtradas, no las dieciséis del modelo. */
const ENTITIES = [
  'User',
  'Session',
  'Invitation',
  'Client',
  'Campaign',
  'CampaignBrief',
  'Candidacy',
  'Influencer',
  'Comment',
  'ImportRun',
]

export function AuditFilters({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const t = useTranslations('filtros')
  const tEtiqueta = useTranslations('etiquetas')
  const router = useRouter()
  const params = useSearchParams()
  /*
   * Sin esto, tocar "Filtrar" no producía ningún cambio visible hasta que
   * volvía el servidor: la lista quedaba igual y no había forma de saber si el
   * clic se registró.
   */
  const [filtrando, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const next = new URLSearchParams()
    for (const key of ['accion', 'entidad', 'cliente', 'desde', 'hasta']) {
      const value = String(form.get(key) ?? '').trim()
      if (value) next.set(key, value)
    }
    startTransition(() => router.push(`/auditoria?${next.toString()}`))
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3" role="search">
      <div className="w-56">
        <label htmlFor="accion" className="mb-1 block text-xs font-medium text-ink-600">
          {t('accion')}
        </label>
        <Select id="accion" name="accion" defaultValue={params.get('accion') ?? ''}>
          <option value="">{t('todas')}</option>
          {AUDIT_ACTIONS.map((key) => (
            <option key={key} value={key}>
              {auditActionLabel(tEtiqueta, key)}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-48">
        <label htmlFor="entidad" className="mb-1 block text-xs font-medium text-ink-600">
          {t('entidad')}
        </label>
        <Select id="entidad" name="entidad" defaultValue={params.get('entidad') ?? ''}>
          <option value="">{t('todas')}</option>
          {ENTITIES.map((entity) => (
            <option key={entity} value={entity}>
              {entityTypeLabel(tEtiqueta, entity)}
            </option>
          ))}
        </Select>
      </div>
      {/*
        * Rango de fechas: es el filtro que más se pide en una auditoría y no
        * estaba, aunque el repositorio ya lo soportaba. Sin él hay que paginar
        * de a cincuenta hasta encontrar el día.
        */}
      <div className="w-36">
        <label htmlFor="desde" className="mb-1 block text-xs font-medium text-ink-600">
          {t('desde')}
        </label>
        <Input id="desde" name="desde" type="date" defaultValue={params.get('desde') ?? ''} />
      </div>
      <div className="w-36">
        <label htmlFor="hasta" className="mb-1 block text-xs font-medium text-ink-600">
          {t('hasta')}
        </label>
        <Input id="hasta" name="hasta" type="date" defaultValue={params.get('hasta') ?? ''} />
      </div>
      {clients.length > 1 ? (
        <div className="w-52">
          <label htmlFor="cliente" className="mb-1 block text-xs font-medium text-ink-600">
            {t('cliente')}
          </label>
          <Select id="cliente" name="cliente" defaultValue={params.get('cliente') ?? ''}>
            <option value="">{t('todos')}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {params.toString() ? (
        <Button type="button" variant="ghost" onClick={() => router.push('/auditoria')}>
          {t('limpiar')}
        </Button>
      ) : null}
      <Button type="submit" variant="secondary" disabled={filtrando}>
        {filtrando ? t('filtrando') : t('filtrar')}
      </Button>
    </form>
  )
}
