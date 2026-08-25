"use client"

import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { ErrorState } from '@/components/ui/states'
import { changePasswordAction } from '@/app/(app)/actions/account'

const REGLAS = [
  'Al menos 12 caracteres.',
  'Una minúscula, una mayúscula y un número.',
]

export function CambiarClave() {
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
        setMensaje('No se pudo cambiar la contraseña. Reintentá en un momento.')
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
        cerradas > 0
          ? `Contraseña cambiada. Se cerraron ${cerradas} ${cerradas === 1 ? 'sesión' : 'sesiones'} en otros dispositivos.`
          : 'Contraseña cambiada.',
      )
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cambiar la contraseña</CardTitle>
        <p className="text-xs text-ink-500">
          Pedimos la actual porque tener la sesión abierta no prueba quién está frente a la pantalla ahora. Al
          cambiarla se cierran las sesiones abiertas en otros dispositivos; ésta sigue.
        </p>
      </CardHeader>
      <CardBody>
        <form ref={formRef} action={enviar} className="max-w-md space-y-4">
          <Field label="Contraseña actual" htmlFor="currentPassword" errors={errores.currentPassword} required>
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
            label="Contraseña nueva"
            htmlFor="newPassword"
            hint={REGLAS.join(' ')}
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

          <Field label="Repetir la nueva" htmlFor="confirmPassword" errors={errores.confirmPassword} required>
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
            {pending ? 'Guardando…' : 'Cambiar contraseña'}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}
