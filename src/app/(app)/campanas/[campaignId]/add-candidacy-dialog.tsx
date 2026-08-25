"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/field'
import { formatFollowers } from '@/lib/util/format'
import { createCandidacyAction } from '../../actions/candidacies'
import { searchInfluencersForCampaign } from './search-action'

type Result = { id: string; displayName: string; handle: string | null; followers: number | null; country: string | null }

export function AddCandidacyDialog({
  campaignId,
  clusters,
}: {
  campaignId: string
  clusters: Array<{ id: string; label: string }>
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<Result[]>([])
  const [clusterId, setClusterId] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchInfluencersForCampaign({ campaignId, query })
        if (result.ok) setResults(result.data)
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [open, query, campaignId])

  function add(influencerId: string) {
    startTransition(async () => {
      const result = await createCandidacyAction({
        campaignId,
        influencerId,
        clusterId: clusterId || null,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('Influencer agregado a la campaña.')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Agregar influencer</Button>
      </DialogTrigger>
      <DialogContent title="Agregar influencer a la campaña" description="Buscá en la base global de la agencia.">
        <div className="space-y-4">
          <Field label="Buscar" htmlFor="query">
            <Input
              id="query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre o @handle"
              autoFocus
            />
          </Field>
          {clusters.length > 0 ? (
            <Field label="Cluster" htmlFor="clusterId">
              <Select id="clusterId" value={clusterId} onChange={(event) => setClusterId(event.target.value)}>
                <option value="">Sin cluster</option>
                {clusters.map((cluster) => (
                  <option key={cluster.id} value={cluster.id}>
                    {cluster.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <div className="max-h-72 overflow-y-auto rounded-lg border border-ink-200">
            {query.trim().length < 2 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">Escribí al menos dos caracteres.</p>
            ) : results.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">
                {pending ? 'Buscando…' : 'No hay resultados. Podés crear el influencer desde la sección Influencers.'}
              </p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {results.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">{item.displayName}</p>
                      <p className="truncate text-xs text-ink-500">
                        {item.handle ? `@${item.handle}` : 'sin handle'} · {formatFollowers(item.followers)} ·{' '}
                        {item.country ?? '—'}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => add(item.id)} disabled={pending}>
                      Agregar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cerrar
              </Button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
