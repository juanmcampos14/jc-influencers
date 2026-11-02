"use client"

import * as React from 'react'
import { useTranslations } from 'next-intl'
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
  /**
   * El contacto llega sólo si esta persona lo puede ver.
   *
   * `null` significa "no tenés permiso", no "está vacío": en ese caso los
   * campos no se dibujan y la acción tampoco los manda, así que un guardado no
   * puede borrar un teléfono que quien edita nunca vio.
   */
  contacto: { phone: string | null; email: string | null; notes: string | null; legalBasis: string | null } | null
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
  const t = useTranslations('influencers')
  const tEtiqueta = useTranslations('etiquetas')
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
        ...(ficha.contacto
          ? {
              contactPhone: String(form.get('contactPhone') ?? '') || null,
              contactEmail: String(form.get('contactEmail') ?? '') || null,
              contactNotes: String(form.get('contactNotes') ?? '') || null,
              contactLegalBasis: String(form.get('contactLegalBasis') ?? '') || null,
            }
          : {}),
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
      toast.success(t('fichaActualizada'))
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Pencil className="size-4" aria-hidden="true" />
          {t('editarFicha')}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Editar ${ficha.displayName}`}
        description={t('editarBajada')}
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('campoNombreVisible')} htmlFor="displayName" errors={errors.displayName} required>
              <Input id="displayName" name="displayName" defaultValue={ficha.displayName} required />
            </Field>
            <Field label={t('campoNombreReal')} htmlFor="realName">
              <Input id="realName" name="realName" defaultValue={ficha.realName ?? ''} />
            </Field>
            <Field label={t('campoHandle')} htmlFor="primaryHandle">
              <Input id="primaryHandle" name="primaryHandle" defaultValue={ficha.primaryHandle ?? ''} />
            </Field>
            <Field
              label={t('colEstado')}
              htmlFor="status"
              hint="«Bloqueado» deja constancia de que no se trabaja más con esta persona."
            >
              <Select id="status" name="status" defaultValue={ficha.status}>
                {opcionesDe(INFLUENCER_STATUS, tEtiqueta).map((opcion) => (
                  <option key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('campoPais')} htmlFor="country">
              <Input id="country" name="country" defaultValue={ficha.country ?? ''} />
            </Field>
            <Field label={t('campoCiudad')} htmlFor="city">
              <Input id="city" name="city" defaultValue={ficha.city ?? ''} />
            </Field>
            <Field label={t('campoIdioma')} htmlFor="language">
              <Input id="language" name="language" defaultValue={ficha.language ?? ''} />
            </Field>
            <Field label={t('campoMayoriaDeEdad')} htmlFor="adultStatus">
              <Select id="adultStatus" name="adultStatus" defaultValue={ficha.adultStatus}>
                <option value="NOT_CONFIRMED">{t('mayoriaSinConfirmar')}</option>
                <option value="CONFIRMED">{t('mayoriaConfirmada')}</option>
                <option value="NOT_APPLICABLE">{t('mayoriaNoAplica')}</option>
              </Select>
            </Field>
            <Field label={t('campoRepresentante')} htmlFor="representative" className="sm:col-span-2">
              <Input id="representative" name="representative" defaultValue={ficha.representative ?? ''} />
            </Field>
          </div>

          <Field label={t('campoNichos')} htmlFor="nicheKeys" hint={t('nichosAyudaLarga')}>
            <Select id="nicheKeys" name="nicheKeys" multiple size={6} defaultValue={ficha.nicheKeys} className="h-auto">
              {niches.map((niche) => (
                <option key={niche.key} value={niche.key}>
                  {niche.label}
                </option>
              ))}
            </Select>
          </Field>

          {ficha.contacto ? (
            <fieldset className="space-y-3 rounded-lg border border-ink-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
                {t('datosDeContacto')}
              </legend>
              <p className="text-xs text-ink-500">{t('datosDeContactoAyuda')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('campoTelefonoContacto')} htmlFor="contactPhone" hint={t('telefonoAyuda')}>
                  <Input
                    id="contactPhone"
                    name="contactPhone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    defaultValue={ficha.contacto.phone ?? ''}
                    placeholder="+34 612 345 678"
                  />
                </Field>
                <Field label={t('campoEmailContacto')} htmlFor="contactEmail" errors={errors.contactEmail}>
                  <Input
                    id="contactEmail"
                    name="contactEmail"
                    type="email"
                    autoComplete="email"
                    defaultValue={ficha.contacto.email ?? ''}
                  />
                </Field>
              </div>
              <Field label={t('campoBaseLegalContacto')} htmlFor="contactLegalBasis" hint={t('baseLegalAyuda')}>
                <Input
                  id="contactLegalBasis"
                  name="contactLegalBasis"
                  defaultValue={ficha.contacto.legalBasis ?? ''}
                  maxLength={400}
                />
              </Field>
              <Field label={t('campoNotasContacto')} htmlFor="contactNotes">
                <Textarea id="contactNotes" name="contactNotes" rows={2} defaultValue={ficha.contacto.notes ?? ''} />
              </Field>
            </fieldset>
          ) : null}

          <Field label={t('campoBio')} htmlFor="bio">
            <Textarea id="bio" name="bio" defaultValue={ficha.bio ?? ''} rows={3} />
          </Field>

          <Field label={t('notasInternas')} htmlFor="internalNotes" hint={t('notasInternasAyuda')}>
            <Textarea id="internalNotes" name="internalNotes" defaultValue={ficha.internalNotes ?? ''} rows={3} />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t('cancelar')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? t('guardando') : t('guardarCambios')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
