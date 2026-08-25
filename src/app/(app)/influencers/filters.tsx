"use client"

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'

const PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'LINKTREE', 'WEBSITE', 'X', 'TWITCH']
const STATUSES = [
  { value: 'NEW', label: 'Nuevo' },
  { value: 'ACTIVE', label: 'Activo' },
  { value: 'BACKLOG', label: 'Backlog' },
  { value: 'BLOCKED', label: 'Bloqueado' },
  { value: 'ARCHIVED', label: 'Archivado' },
]

export function InfluencerFilters({
  niches,
  countries,
}: {
  niches: Array<{ key: string; label: string }>
  countries: string[]
}) {
  const router = useRouter()
  const params = useSearchParams()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const next = new URLSearchParams()
    for (const key of ['q', 'pais', 'plataforma', 'nicho', 'desde', 'hasta', 'er', 'estado']) {
      const value = String(form.get(key) ?? '').trim()
      if (value) next.set(key, value)
    }
    router.push(`/influencers?${next.toString()}`)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-xl border border-ink-200 bg-white p-4" role="search">
      <div className="min-w-52 flex-1">
        <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-600">
          Buscar
        </label>
        <Input id="q" name="q" defaultValue={params.get('q') ?? ''} placeholder="Nombre o @handle" />
      </div>
      <div className="w-36">
        <label htmlFor="pais" className="mb-1 block text-xs font-medium text-ink-600">
          País
        </label>
        <Select id="pais" name="pais" defaultValue={params.get('pais') ?? ''}>
          <option value="">Todos</option>
          {countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-36">
        <label htmlFor="plataforma" className="mb-1 block text-xs font-medium text-ink-600">
          Plataforma
        </label>
        <Select id="plataforma" name="plataforma" defaultValue={params.get('plataforma') ?? ''}>
          <option value="">Todas</option>
          {PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-44">
        <label htmlFor="nicho" className="mb-1 block text-xs font-medium text-ink-600">
          Nicho
        </label>
        <Select id="nicho" name="nicho" defaultValue={params.get('nicho') ?? ''}>
          <option value="">Todos</option>
          {niches.map((niche) => (
            <option key={niche.key} value={niche.key}>
              {niche.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-28">
        <label htmlFor="desde" className="mb-1 block text-xs font-medium text-ink-600">
          Seg. desde
        </label>
        <Input id="desde" name="desde" type="number" min={0} defaultValue={params.get('desde') ?? ''} />
      </div>
      <div className="w-28">
        <label htmlFor="hasta" className="mb-1 block text-xs font-medium text-ink-600">
          Seg. hasta
        </label>
        <Input id="hasta" name="hasta" type="number" min={0} defaultValue={params.get('hasta') ?? ''} />
      </div>
      <div className="w-24">
        <label htmlFor="er" className="mb-1 block text-xs font-medium text-ink-600">
          ER mín. %
        </label>
        <Input id="er" name="er" type="number" step="0.1" min={0} defaultValue={params.get('er') ?? ''} />
      </div>
      <div className="w-36">
        <label htmlFor="estado" className="mb-1 block text-xs font-medium text-ink-600">
          Estado
        </label>
        <Select id="estado" name="estado" defaultValue={params.get('estado') ?? ''}>
          <option value="">Todos</option>
          {STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="secondary">
        Filtrar
      </Button>
    </form>
  )
}
