"use client"

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Checkbox, Field, Input } from '@/components/ui/field'
import { addProfileAction } from '../../actions/influencers'

export function AddProfileDialog({ influencerId }: { influencerId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const num = (key: string) => {
      const value = String(form.get(key) ?? '').trim()
      return value ? Number(value) : null
    }
    setErrors({})
    startTransition(async () => {
      const result = await addProfileAction({
        influencerId,
        url: String(form.get('url') ?? ''),
        followers: num('followers'),
        followersRaw: String(form.get('followersRaw') ?? '') || null,
        engagementRate: num('engagementRate'),
        avgViews: num('avgViews'),
        audienceLocalPercent: num('audienceLocalPercent'),
        metricSource: String(form.get('metricSource') ?? '') || null,
        metricSourceUrl: String(form.get('metricSourceUrl') ?? '') || null,
        isPrimary: form.get('isPrimary') === 'on',
      })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }
      toast.success('Perfil guardado. Se registró un snapshot con la fecha de hoy.')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Cargar métricas</Button>
      </DialogTrigger>
      <DialogContent
        title="Perfil social y métricas"
        description="Si el perfil ya existe se actualiza y queda un snapshot con la fecha y la fuente."
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="URL del perfil" htmlFor="url" errors={errors.url} required>
            <Input id="url" name="url" required autoFocus maxLength={500} placeholder="https://www.instagram.com/…" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Seguidores" htmlFor="followers">
              <Input id="followers" name="followers" type="number" min={0} />
            </Field>
            <Field label="Valor original" htmlFor="followersRaw" hint='Cómo venía escrito, p. ej. "31,6k".'>
              <Input id="followersRaw" name="followersRaw" maxLength={60} />
            </Field>
            <Field label="Engagement rate (%)" htmlFor="engagementRate">
              <Input id="engagementRate" name="engagementRate" type="number" step="0.01" min={0} max={100} />
            </Field>
            <Field label="Views promedio" htmlFor="avgViews">
              <Input id="avgViews" name="avgViews" type="number" min={0} />
            </Field>
            <Field label="% audiencia local" htmlFor="audienceLocalPercent">
              <Input id="audienceLocalPercent" name="audienceLocalPercent" type="number" step="0.1" min={0} max={100} />
            </Field>
            <Field label="Fuente" htmlFor="metricSource" hint="De dónde salió el dato.">
              <Input id="metricSource" name="metricSource" maxLength={200} />
            </Field>
          </div>
          <Field label="URL de la fuente" htmlFor="metricSourceUrl" errors={errors.metricSourceUrl}>
            <Input id="metricSourceUrl" name="metricSourceUrl" type="url" maxLength={500} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <Checkbox name="isPrimary" />
            Marcar como perfil principal
          </label>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
