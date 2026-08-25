"use client"

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field'
import { MARKET_SEED } from '@/lib/domain/statuses'
import { createClientAction } from '../actions/clients'

export function NewClientDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setErrors({})
    startTransition(async () => {
      const result = await createClientAction({
        name: String(form.get('name') ?? ''),
        legalName: String(form.get('legalName') ?? '') || null,
        country: String(form.get('country') ?? '') || null,
        markets: form.getAll('markets').map(String),
        description: String(form.get('description') ?? '') || null,
        defaultCurrency: String(form.get('currency') ?? 'USD'),
        allowClientUserInvites: form.get('allowClientUserInvites') === 'on',
        allowClientExports: form.get('allowClientExports') === 'on',
      })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }
      /*
       * Se va derecho a cargar la identidad visual.
       *
       * Antes el diálogo se cerraba y volvías a la lista, y el acceso para
       * darle su diseño estaba al fondo de la ficha del cliente, a dos mil
       * píxeles de scroll. El momento de definir cómo se ve el espacio de un
       * cliente es justo cuando lo creás, no un día que te acordás.
       */
      toast.success('Cliente creado. Ahora dale su identidad visual.')
      setOpen(false)
      router.push(`/clientes/${result.data.id}/marca`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Nuevo cliente</Button>
      </DialogTrigger>
      <DialogContent title="Nuevo cliente" description="Se crea un espacio aislado con sus propias campañas y usuarios.">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Nombre" htmlFor="name" errors={errors.name} required>
            <Input id="name" name="name" required autoFocus maxLength={120} />
          </Field>
          <Field label="Razón social" htmlFor="legalName" errors={errors.legalName}>
            <Input id="legalName" name="legalName" maxLength={200} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
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
            <Field label="Moneda por defecto" htmlFor="currency">
              <Select id="currency" name="currency" defaultValue="USD">
                {['USD', 'ARS', 'EUR', 'BRL', 'MXN', 'COP', 'CLP'].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Mercados" htmlFor="markets" hint="Podés elegir varios con Ctrl o Cmd.">
            <Select id="markets" name="markets" multiple size={5} className="h-auto">
              {MARKET_SEED.map((market) => (
                <option key={market} value={market}>
                  {market}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Descripción" htmlFor="description">
            <Textarea id="description" name="description" maxLength={2000} />
          </Field>
          <fieldset className="space-y-2 rounded-lg border border-ink-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Qué puede hacer el cliente
            </legend>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <Checkbox name="allowClientUserInvites" />
              Su administrador puede invitar compañeros de su empresa
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <Checkbox name="allowClientExports" defaultChecked />
              Puede descargar exportaciones
            </label>
          </fieldset>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Creando…' : 'Crear cliente'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
