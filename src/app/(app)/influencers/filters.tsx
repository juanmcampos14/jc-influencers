"use client"

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import { INFLUENCER_STATUS, opcionesDe, platformLabel, PLATFORM_VALUES } from '@/lib/domain/labels'

export function InfluencerFilters({
  niches,
  countries,
}: {
  niches: Array<{ key: string; label: string }>
  countries: string[]
}) {
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
    for (const key of ['q', 'pais', 'plataforma', 'nicho', 'desde', 'hasta', 'er', 'estado']) {
      const value = String(form.get(key) ?? '').trim()
      if (value) next.set(key, value)
    }
    startTransition(() => router.push(`/influencers?${next.toString()}`))
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-xl border border-ink-200 bg-surface p-4" role="search">
      <div className="min-w-52 flex-1">
        <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-600">
          {t('buscar')}
        </label>
        <Input id="q" name="q" defaultValue={params.get('q') ?? ''} placeholder={t('nombreOHandle')} />
      </div>
      <div className="w-36">
        <label htmlFor="pais" className="mb-1 block text-xs font-medium text-ink-600">
          {t('pais')}
        </label>
        <Select id="pais" name="pais" defaultValue={params.get('pais') ?? ''}>
          <option value="">{t('todos')}</option>
          {countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-36">
        <label htmlFor="plataforma" className="mb-1 block text-xs font-medium text-ink-600">
          {t('plataforma')}
        </label>
        <Select id="plataforma" name="plataforma" defaultValue={params.get('plataforma') ?? ''}>
          <option value="">{t('todas')}</option>
          {PLATFORM_VALUES.map((platform) => (
            <option key={platform} value={platform}>
              {platformLabel(tEtiqueta, platform)}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-44">
        <label htmlFor="nicho" className="mb-1 block text-xs font-medium text-ink-600">
          {t('nicho')}
        </label>
        <Select id="nicho" name="nicho" defaultValue={params.get('nicho') ?? ''}>
          <option value="">{t('todos')}</option>
          {niches.map((niche) => (
            <option key={niche.key} value={niche.key}>
              {niche.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-28">
        <label htmlFor="desde" className="mb-1 block text-xs font-medium text-ink-600">
          {t('segDesde')}
        </label>
        <Input id="desde" name="desde" type="number" min={0} defaultValue={params.get('desde') ?? ''} />
      </div>
      <div className="w-28">
        <label htmlFor="hasta" className="mb-1 block text-xs font-medium text-ink-600">
          {t('segHasta')}
        </label>
        <Input id="hasta" name="hasta" type="number" min={0} defaultValue={params.get('hasta') ?? ''} />
      </div>
      <div className="w-24">
        <label htmlFor="er" className="mb-1 block text-xs font-medium text-ink-600">
          {t('erMin')}
        </label>
        <Input id="er" name="er" type="number" step="0.1" min={0} defaultValue={params.get('er') ?? ''} />
      </div>
      <div className="w-36">
        <label htmlFor="estado" className="mb-1 block text-xs font-medium text-ink-600">
          {t('estado')}
        </label>
        <Select id="estado" name="estado" defaultValue={params.get('estado') ?? ''}>
          <option value="">{t('todos')}</option>
          {opcionesDe(INFLUENCER_STATUS, tEtiqueta).map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="secondary" disabled={filtrando}>
        {filtrando ? t('filtrando') : t('filtrar')}
      </Button>
    </form>
  )
}
