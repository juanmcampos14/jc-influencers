"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { INFLUENCER_STATUS, opcionesDe } from '@/lib/domain/labels'
import { updateInfluencerAction } from '../../actions/influencers'

export type FichaEditable = {
  id: string
  version: number
  displayName: string
  realName: string | null
  primaryHandle: string | null
  country: string | null
  city: string | null
  language: string | null
  bio: string | null
  status: string
  adultStatus: string
  representative: string | null
  internalNotes: string | null
  nicheKeys: string[]
}

/**
 * Editar la ficha de un influencer.
 *
 * La pantalla era de sólo lectura: la única acción era agregar un perfil
 * social. Como casi toda la base entra por importación de Excel, con datos
 * sucios, la ficha es exactamente el lugar donde se limpian, y no se podía.
 * Corregir un país mal cargado obligaba a borrar y volver a crear, perdiendo
 * el historial de métricas y las candidaturas.
 *
 * `BLOCKED` -- "con este no trabajamos más" -- es la información más cara de
 * las que no se podían registrar.
 */
export function EditarFicha({
  ficha,
  niches,
}: {
  ficha: FichaEditable
  niches: Array<{ key: string; label: string }>
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string[]>>({})
  const [pending, startTransition] = React.useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setErrors({})
    startTransition(async () => {
      const resultado = await updateInfluencerAction({
        influencerId: ficha.id,
        version: ficha.version,
        displayName: String(form.get('displayName') ?? ''),
        realName: String(form.get('realName') ?? '') || null,
        primaryHandle: String(form.get('primaryHandle') ?? '') || null,
        country: String(form.get('country') ?? '') || null,
        city: String(form.get('city') ?? '') || null,
        language: String(form.get('language') ?? '') || null,
        bio: String(form.get('bio') ?? '') || null,
        status: String(form.get('status') ?? ficha.status) as never,
        adultStatus: String(form.get('adultStatus') ?? ficha.adultStatus) as never,
        representative: String(form.get('representative') ?? '') || null,
        internalNotes: String(form.get('internalNotes') ?? '') || null,
        nicheKeys: form.getAll('nicheKeys').map(String),
      })
      if (!resultado.ok) {
        setErrors(resultado.fieldErrors ?? {})
        toast.error(resultado.message)
        return
      }
      toast.success('Ficha actualizada.')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Pencil className="size-4" aria-hidden="true" />
          Editar ficha
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Editar ${ficha.displayName}`}
        description="Los cambios quedan registrados en la auditoría con tu nombre."
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre visible" htmlFor="displayName" errors={errors.displayName} required>
              <Input id="displayName" name="displayName" defaultValue={ficha.displayName} required />
            </Field>
            <Field label="Nombre real" htmlFor="realName">
              <Input id="realName" name="realName" defaultValue={ficha.realName ?? ''} />
            </Field>
            <Field label="Handle principal" htmlFor="primaryHandle">
              <Input id="primaryHandle" name="primaryHandle" defaultValue={ficha.primaryHandle ?? ''} />
            </Field>
            <Field
              label="Estado"
              htmlFor="status"
              hint="«Bloqueado» deja constancia de que no se trabaja más con esta persona."
            >
              <Select id="status" name="status" defaultValue={ficha.status}>
                {opcionesDe(INFLUENCER_STATUS).map((opcion) => (
                  <option key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="País" htmlFor="country">
              <Input id="country" name="country" defaultValue={ficha.country ?? ''} />
            </Field>
            <Field label="Ciudad" htmlFor="city">
              <Input id="city" name="city" defaultValue={ficha.city ?? ''} />
            </Field>
            <Field label="Idioma" htmlFor="language">
              <Input id="language" name="language" defaultValue={ficha.language ?? ''} />
            </Field>
            <Field label="Mayoría de edad" htmlFor="adultStatus">
              <Select id="adultStatus" name="adultStatus" defaultValue={ficha.adultStatus}>
                <option value="NOT_CONFIRMED">Sin confirmar</option>
                <option value="CONFIRMED">Confirmada</option>
                <option value="NOT_APPLICABLE">No aplica</option>
              </Select>
            </Field>
            <Field label="Agencia o representante" htmlFor="representative" className="sm:col-span-2">
              <Input id="representative" name="representative" defaultValue={ficha.representative ?? ''} />
            </Field>
          </div>

          <Field label="Nichos" htmlFor="nicheKeys" hint="Podés elegir varios con Ctrl o Cmd.">
            <Select id="nicheKeys" name="nicheKeys" multiple size={6} defaultValue={ficha.nicheKeys} className="h-auto">
              {niches.map((niche) => (
                <option key={niche.key} value={niche.key}>
                  {niche.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Bio o descripción" htmlFor="bio">
            <Textarea id="bio" name="bio" defaultValue={ficha.bio ?? ''} rows={3} />
          </Field>

          <Field label="Notas internas" htmlFor="internalNotes" hint="Nunca las ve el cliente.">
            <Textarea id="internalNotes" name="internalNotes" defaultValue={ficha.internalNotes ?? ''} rows={3} />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
