"use client"

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { ErrorState } from '@/components/ui/states'
import { changePasswordAction } from '@/app/(app)/actions/account'

export function CambiarClave() {
  const t = useTranslations('cuenta')
  const [errores, setErrores] = React.useState<Record<string, string[]>>({})
  const [mensaje, setMensaje] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const formRef = React.useRef<HTMLFormElement>(null)

  function enviar(formData: FormData) {
    setErrores({})
    setMensaje(null)
    startTransition(async () => {
      const result = await changePasswordAction({
        currentPassword: String(formData.get('currentPassword') ?? ''),
        newPassword: String(formData.get('newPassword') ?? ''),
        confirmPassword: String(formData.get('confirmPassword') ?? ''),
      }).catch(() => null)

      if (!result) {
        setMensaje(t('noSeCambio'))
        return
      }
      if (!result.ok) {
        setErrores(result.fieldErrors ?? {})
        setMensaje(result.message)
        return
      }

      formRef.current?.reset()
      const cerradas = result.data.otrasSesionesCerradas
      toast.success(
        cerradas > 0 ? t('claveCambiadaConSesiones', { cantidad: cerradas }) : t('claveCambiada'),
      )
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cambiarLaClave')}</CardTitle>
        <p className="text-xs text-ink-500">{t('cambiarLaClaveAyuda')}</p>
      </CardHeader>
      <CardBody>
        <form ref={formRef} action={enviar} className="max-w-md space-y-4">
          <Field label={t('campoClaveActual')} htmlFor="currentPassword" errors={errores.currentPassword} required>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={Boolean(errores.currentPassword)}
            />
          </Field>

          <Field
            label={t('campoClaveNueva')}
            htmlFor="newPassword"
            hint={t('reglas')}
            errors={errores.newPassword}
            required
          >
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={Boolean(errores.newPassword)}
            />
          </Field>

          <Field label={t('campoRepetir')} htmlFor="confirmPassword" errors={errores.confirmPassword} required>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={Boolean(errores.confirmPassword)}
            />
          </Field>

          {mensaje ? <ErrorState title={mensaje} /> : null}

          <Button type="submit" disabled={pending}>
            {pending ? t('guardando') : t('cambiarClave')}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}
