"use client"

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { MARKET_SEED } from '@/lib/domain/statuses'
import { createInfluencerAction } from '../actions/influencers'
import { addProfileAction } from '../actions/influencers'

export function NewInfluencerDialog({ niches }: { niches: Array<{ key: string; label: string }> }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setErrors({})
    startTransition(async () => {
      const created = await createInfluencerAction({
        displayName: String(form.get('displayName') ?? ''),
        realName: String(form.get('realName') ?? '') || null,
        primaryHandle: String(form.get('primaryHandle') ?? '') || null,
        country: String(form.get('country') ?? '') || null,
        city: String(form.get('city') ?? '') || null,
        language: String(form.get('language') ?? '') || null,
        bio: String(form.get('bio') ?? '') || null,
        status: 'NEW',
        adultStatus: String(form.get('adultStatus') ?? 'NOT_CONFIRMED') as never,
        representative: String(form.get('representative') ?? '') || null,
        nicheKeys: form.getAll('nicheKeys').map(String),
      })
      if (!created.ok) {
        setErrors(created.fieldErrors ?? {})
        toast.error(created.message)
        return
      }
      const url = String(form.get('profileUrl') ?? '').trim()
      if (url) {
        const profile = await addProfileAction({ influencerId: created.data.id, url, isPrimary: true })
        if (!profile.ok) toast.warning(`Se creó el influencer pero el perfil no: ${profile.message}`)
      }
      toast.success('Influencer creado.')
      setOpen(false)
      router.push(`/influencers/${created.data.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Nuevo influencer</Button>
      </DialogTrigger>
      <DialogContent title="Nuevo influencer" description="Se agrega a la base global de la agencia.">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre visible" htmlFor="displayName" errors={errors.displayName} required>
              <Input id="displayName" name="displayName" required autoFocus maxLength={160} />
            </Field>
            <Field label="Nombre real" htmlFor="realName">
              <Input id="realName" name="realName" maxLength={160} />
            </Field>
            <Field label="Handle principal" htmlFor="primaryHandle">
              <Input id="primaryHandle" name="primaryHandle" maxLength={80} placeholder="sin arroba" />
            </Field>
            <Field label="País" htmlFor="country">
              <Select id="country" name="country" defaultValue="ARG">
                <option value="">Sin definir</option>
                {MARKET_SEED.map((market) => (
                  <option key={market} value={market}>
                    {market}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ciudad" htmlFor="city">
              <Input id="city" name="city" maxLength={80} />
            </Field>
            <Field label="Idioma" htmlFor="language">
              <Input id="language" name="language" maxLength={40} defaultValue="es" />
            </Field>
            <Field label="Mayoría de edad" htmlFor="adultStatus">
              <Select id="adultStatus" name="adultStatus" defaultValue="NOT_CONFIRMED">
                <option value="CONFIRMED">Confirmada</option>
                <option value="NOT_CONFIRMED">No confirmada</option>
                <option value="NOT_APPLICABLE">No aplica</option>
              </Select>
            </Field>
            <Field label="Agencia o representante" htmlFor="representative">
              <Input id="representative" name="representative" maxLength={160} />
            </Field>
          </div>
          <Field label="URL del perfil principal" htmlFor="profileUrl" hint="Instagram, TikTok, YouTube, Linktree…">
            <Input id="profileUrl" name="profileUrl" type="url" maxLength={500} />
          </Field>
          <Field label="Nichos" htmlFor="nicheKeys" hint="Ctrl o Cmd para varios.">
            <Select id="nicheKeys" name="nicheKeys" multiple size={5} className="h-auto">
              {niches.map((niche) => (
                <option key={niche.key} value={niche.key}>
                  {niche.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bio o descripción" htmlFor="bio">
            <Textarea id="bio" name="bio" maxLength={4000} />
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Creando…' : 'Crear influencer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
