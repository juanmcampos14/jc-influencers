"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Select } from '@/components/ui/field'
import { CampaignStatusBadge, CAMPAIGN_STATUS_LABELS } from '@/components/status-badge'
import { cn } from '@/lib/util/format'
import { changeCampaignStatusAction } from '../../actions/campaigns'

/**
 * El estado de la campaña, editable desde su propia pantalla.
 *
 * Antes era un badge de sólo lectura: el estado se elegía una vez, en el alta,
 * y quedaba congelado ahí para siempre. Como la lista de campañas se ordena por
 * estado, toda campaña envejecía marcada como "Brief" y la lista dejaba de
 * decir la verdad.
 *
 * Se aplica en el momento y el aviso ofrece deshacer, igual que el estado de
 * una candidatura. Si otra persona la movió mientras tanto, el servidor lo
 * detecta por versión y acá se vuelve a lo que había.
 */
export function EstadoDeCampana({
  campaignId,
  status,
  version,
  puedeEditar,
}: {
  campaignId: string
  status: string
  version: number
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [optimista, setOptimista] = React.useState<string | null>(null)
  const [guardando, setGuardando] = React.useState(false)
  const [, startTransition] = React.useTransition()

  const actual = optimista ?? status

  if (!puedeEditar) return <CampaignStatusBadge status={actual} />

  function cambiar(nuevo: string, anterior: string) {
    setOptimista(nuevo)
    setGuardando(true)
    startTransition(async () => {
      const resultado = await changeCampaignStatusAction({
        campaignId,
        version,
        status: nuevo as never,
      })
      setGuardando(false)
      if (!resultado.ok) {
        setOptimista(anterior)
        toast.error(resultado.message)
        return
      }
      toast.success(`Campaña en ${CAMPAIGN_STATUS_LABELS[nuevo]?.label ?? nuevo}.`, {
        action: { label: 'Deshacer', onClick: () => cambiar(anterior, nuevo) },
      })
      router.refresh()
    })
  }

  return (
    <span className="inline-flex items-center gap-2">
      <CampaignStatusBadge status={actual} />
      <Select
        aria-label="Estado de la campaña"
        value={actual}
        onChange={(event) => cambiar(event.target.value, actual)}
        disabled={guardando}
        className={cn('h-8 w-40 text-xs', guardando && 'opacity-60')}
      >
        {Object.entries(CAMPAIGN_STATUS_LABELS).map(([key, value]) => (
          <option key={key} value={key}>
            {value.label}
          </option>
        ))}
      </Select>
    </span>
  )
}
