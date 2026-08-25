"use client"

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'

const ENTITIES = ['User', 'Session', 'Invitation', 'Client', 'Campaign', 'CampaignBrief', 'Candidacy', 'Influencer', 'Comment', 'ImportRun']

export function AuditFilters({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const router = useRouter()
  const params = useSearchParams()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const next = new URLSearchParams()
    for (const key of ['accion', 'entidad', 'cliente']) {
      const value = String(form.get(key) ?? '').trim()
      if (value) next.set(key, value)
    }
    router.push(`/auditoria?${next.toString()}`)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3" role="search">
      <div className="w-56">
        <label htmlFor="accion" className="mb-1 block text-xs font-medium text-ink-600">
          Acción contiene
        </label>
        <Input id="accion" name="accion" defaultValue={params.get('accion') ?? ''} placeholder="candidacy.status" />
      </div>
      <div className="w-48">
        <label htmlFor="entidad" className="mb-1 block text-xs font-medium text-ink-600">
          Entidad
        </label>
        <Select id="entidad" name="entidad" defaultValue={params.get('entidad') ?? ''}>
          <option value="">Todas</option>
          {ENTITIES.map((entity) => (
            <option key={entity} value={entity}>
              {entity}
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
