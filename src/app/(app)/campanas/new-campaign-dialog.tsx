"use client"

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { useTranslations } from 'next-intl'
import { CAMPAIGN_STATUS_VALUES, campaignStatusLabel } from '@/components/status-badge'
import { MARKET_SEED } from '@/lib/domain/statuses'
import { createCampaignAction } from '../actions/campaigns'

const PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'X', 'TWITCH', 'LINKEDIN', 'FACEBOOK']

export function NewCampaignDialog({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const t = useTranslations('campanas')
  const tEtiqueta = useTranslations('etiquetas')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setErrors({})
    const budget = String(form.get('budgetEstimated') ?? '').trim()
    const cache = String(form.get('budgetCache') ?? '').trim()

    startTransition(async () => {
      const result = await createCampaignAction({
        clientId: String(form.get('clientId') ?? ''),
        name: String(form.get('name') ?? ''),
        description: String(form.get('description') ?? '') || null,
        objective: String(form.get('objective') ?? '') || null,
        status: (String(form.get('status') ?? 'DRAFT') || 'DRAFT') as never,
        countries: form.getAll('countries').map(String),
        platforms: form.getAll('platforms').map(String),
        startDate: String(form.get('startDate') ?? '') || null,
        endDate: String(form.get('endDate') ?? '') || null,
        currency: String(form.get('currency') ?? 'USD'),
        budgetEstimated: budget ? Number(budget) : null,
        budgetCache: cache ? Number(cache) : null,
      })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }
      toast.success(t('creada'))
      setOpen(false)
      router.push(`/campanas/${result.data.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{t('nueva')}</Button>
      </DialogTrigger>
      <DialogContent title={t('nueva')}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label={t('campoCliente')} htmlFor="clientId" required>
            <Select id="clientId" name="clientId" required>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('campoNombre')} htmlFor="name" errors={errors.name} required>
            <Input id="name" name="name" required autoFocus maxLength={160} />
          </Field>
          <Field label={t('campoObjetivo')} htmlFor="objective">
            <Input id="objective" name="objective" maxLength={2000} />
          </Field>
          <Field label={t('campoDescripcion')} htmlFor="description">
            <Textarea id="description" name="description" maxLength={4000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('colEstado')} htmlFor="status">
              <Select id="status" name="status" defaultValue="BRIEFING">
                {CAMPAIGN_STATUS_VALUES.map((key) => (
                  <option key={key} value={key}>
                    {campaignStatusLabel(tEtiqueta, key)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('campoMoneda')} htmlFor="currency">
              <Select id="currency" name="currency" defaultValue="USD">
                {['USD', 'ARS', 'EUR', 'BRL', 'MXN', 'COP', 'CLP'].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('campoDesde')} htmlFor="startDate">
              <Input id="startDate" name="startDate" type="date" />
            </Field>
            <Field label={t('campoHasta')} htmlFor="endDate" errors={errors.endDate}>
              <Input id="endDate" name="endDate" type="date" />
            </Field>
            <Field label={t('campoPresupuesto')} htmlFor="budgetEstimated">
              <Input id="budgetEstimated" name="budgetEstimated" type="number" min={0} step="0.01" />
            </Field>
            <Field label={t('campoCache')} htmlFor="budgetCache">
              <Input id="budgetCache" name="budgetCache" type="number" min={0} step="0.01" />
            </Field>
            <Field label={t('campoPaises')} htmlFor="countries" hint={t('paisesAyuda')}>
              <Select id="countries" name="countries" multiple size={4} className="h-auto">
                {MARKET_SEED.map((market) => (
                  <option key={market} value={market}>
                    {market}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('campoPlataformas')} htmlFor="platforms" hint={t('plataformasAyuda')}>
              <Select id="platforms" name="platforms" multiple size={4} className="h-auto">
                {PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t('cancelar')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? t('creando') : t('crear')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
