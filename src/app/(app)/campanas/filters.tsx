"use client"

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import { CAMPAIGN_STATUS_LABELS } from '@/components/status-badge'

export function CampaignFilters({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const router = useRouter()
  const params = useSearchParams()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const next = new URLSearchParams()
    for (const key of ['q', 'estado', 'cliente']) {
      const value = String(form.get(key) ?? '').trim()
      if (value) next.set(key, value)
    }
    router.push(`/campanas?${next.toString()}`)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3" role="search">
      <div className="min-w-52 flex-1">
        <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-600">
          Buscar
        </label>
        <Input id="q" name="q" defaultValue={params.get('q') ?? ''} placeholder="Nombre o descripción" />
      </div>
      <div className="w-44">
        <label htmlFor="estado" className="mb-1 block text-xs font-medium text-ink-600">
          Estado
        </label>
        <Select id="estado" name="estado" defaultValue={params.get('estado') ?? ''}>
          <option value="">Todos</option>
          {Object.entries(CAMPAIGN_STATUS_LABELS).map(([key, value]) => (
            <option key={key} value={key}>
              {value.label}
            </option>
          ))}
        </Select>
      </div>
      {clients.length > 1 ? (
        <div className="w-52">
          <label htmlFor="cliente" className="mb-1 block text-xs font-medium text-ink-600">
            Cliente
          </label>
          <Select id="cliente" name="cliente" defaultValue={params.get('cliente') ?? ''}>
            <option value="">Todos</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <Button type="submit" variant="secondary">
        Filtrar
      </Button>
    </form>
  )
}
