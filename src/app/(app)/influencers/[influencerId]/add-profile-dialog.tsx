"use client"

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Checkbox, Field, Input } from '@/components/ui/field'
import { addProfileAction } from '../../actions/influencers'

export function AddProfileDialog({ influencerId }: { influencerId: string }) {
  const t = useTranslations('influencers')
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
      toast.success(t('perfilGuardado'))
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{t('cargarMetricas')}</Button>
      </DialogTrigger>
      <DialogContent
        title={t('metricasTitulo')}
        description={t('metricasBajada')}
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label={t('campoUrl')} htmlFor="url" errors={errors.url} required>
            <Input id="url" name="url" required autoFocus maxLength={500} placeholder="https://www.instagram.com/…" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('campoSeguidores')} htmlFor="followers">
              <Input id="followers" name="followers" type="number" min={0} />
            </Field>
            <Field label={t('campoValorOriginal')} htmlFor="followersRaw" hint={t('valorOriginalAyuda')}>
              <Input id="followersRaw" name="followersRaw" maxLength={60} />
            </Field>
            <Field label={t('campoEr')} htmlFor="engagementRate">
              <Input id="engagementRate" name="engagementRate" type="number" step="0.01" min={0} max={100} />
            </Field>
            <Field label={t('campoViews')} htmlFor="avgViews">
              <Input id="avgViews" name="avgViews" type="number" min={0} />
            </Field>
            <Field label={t('campoAudienciaLocal')} htmlFor="audienceLocalPercent">
              <Input id="audienceLocalPercent" name="audienceLocalPercent" type="number" step="0.1" min={0} max={100} />
            </Field>
            <Field label={t('campoFuente')} htmlFor="metricSource" hint={t('fuenteAyuda')}>
              <Input id="metricSource" name="metricSource" maxLength={200} />
            </Field>
          </div>
          <Field label={t('campoUrlFuente')} htmlFor="metricSourceUrl" errors={errors.metricSourceUrl}>
            <Input id="metricSourceUrl" name="metricSourceUrl" type="url" maxLength={500} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <Checkbox name="isPrimary" />
            {t('marcarPrincipal')}
          </label>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t('cancelar')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? t('guardando') : t('guardar')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
