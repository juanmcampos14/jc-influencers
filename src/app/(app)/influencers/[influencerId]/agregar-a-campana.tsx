"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Field, Select } from '@/components/ui/field'
import { addToCampaignAction } from '../../actions/candidacies'

/**
 * Sumar este influencer a una campaña, desde su propia ficha.
 *
 * Es la continuación de lo que ya hace la lista: mirás a alguien en detalle,
 * decidís que sirve, y la acción está donde estás parado en vez de obligarte a
 * volver a la lista y buscarlo de nuevo.
 */
export function AgregarACampana({
  influencerId,
  nombre,
  campanas,
}: {
  influencerId: string
  nombre: string
  campanas: Array<{ id: string; name: string; clientName: string }>
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [campana, setCampana] = React.useState(campanas[0]?.id ?? '')
  const [pendiente, startTransition] = React.useTransition()

  if (campanas.length === 0) return null

  function agregar() {
    const elegida = campanas.find((c) => c.id === campana)
    if (!elegida) return
    startTransition(async () => {
      const resultado = await addToCampaignAction({ campaignId: campana, influencerIds: [influencerId] })
      if (!resultado.ok) {
        toast.error(resultado.message)
        return
      }
      // Que ya estuviera no es un error, pero tampoco es lo mismo que agregarlo.
      if (resultado.data.alreadyThere > 0) toast.info(`${nombre} ya estaba en ${elegida.name}.`)
      else toast.success(`${nombre} agregado a ${elegida.name}.`)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Plus className="size-4" aria-hidden="true" />
          Agregar a campaña
        </Button>
      </DialogTrigger>
      <DialogContent title={`Agregar a ${nombre}`} description="Entra como propuesto, sin que el cliente lo vea todavía.">
        <div className="space-y-4">
          <Field label="Campaña" htmlFor="campana">
            <Select id="campana" value={campana} onChange={(event) => setCampana(event.target.value)}>
              {campanas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.clientName}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={agregar} disabled={pendiente || !campana}>
              {pendiente ? 'Agregando…' : 'Agregar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
