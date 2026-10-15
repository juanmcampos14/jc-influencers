"use client"

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import { useTranslations } from 'next-intl'
import { CAMPAIGN_STATUS_VALUES, campaignStatusLabel } from '@/components/status-badge'

export function CampaignFilters({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const t = useTranslations('filtros')
  const tEtiqueta = useTranslations('etiquetas')
  const tCampana = useTranslations('campanas')
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
    for (const key of ['q', 'estado', 'cliente']) {
      const value = String(form.get(key) ?? '').trim()
      if (value) next.set(key, value)
    }
    startTransition(() => router.push(`/campanas?${next.toString()}`))
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3" role="search">
      <div className="min-w-52 flex-1">
        <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-600">
          {t('buscar')}
        </label>
        <Input id="q" name="q" defaultValue={params.get('q') ?? ''} placeholder={tCampana('filtroBuscarPista')} />
      </div>
      <div className="w-44">
        <label htmlFor="estado" className="mb-1 block text-xs font-medium text-ink-600">
          {t('estado')}
        </label>
        <Select id="estado" name="estado" defaultValue={params.get('estado') ?? ''}>
          <option value="">{t('todos')}</option>
          {CAMPAIGN_STATUS_VALUES.map((key) => (
            <option key={key} value={key}>
              {campaignStatusLabel(tEtiqueta, key)}
            </option>
          ))}
        </Select>
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
      <Button type="submit" variant="secondary" disabled={filtrando}>
        {filtrando ? t('filtrando') : t('filtrar')}
      </Button>
    </form>
  )
}
