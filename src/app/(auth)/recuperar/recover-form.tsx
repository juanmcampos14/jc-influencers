"use client"

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { requestResetAction } from '../actions'

export function RecoverForm() {
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    startTransition(async () => {
      await requestResetAction({ email: String(form.get('email') ?? '') })
      // El mensaje es siempre el mismo, exista o no la cuenta.
      setSent(true)
    })
  }

  return (
    <Card>
      <CardBody>
        <h1 className="mb-1 text-base font-semibold text-ink-900">Recuperar acceso</h1>
        {sent ? (
          <>
            <p className="mb-4 text-sm text-ink-600">
              Si ese email tiene una cuenta activa, te mandamos un enlace para definir una contraseña nueva. Revisá tu
              bandeja de entrada. El enlace vence en una hora.
            </p>
            <Link href="/login" className="text-sm text-brand-600 underline underline-offset-2">
              Volver a ingresar
            </Link>
          </>
        ) : (
          <>
            <p className="mb-5 text-sm text-ink-500">Te mandamos un enlace para definir una contraseña nueva.</p>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <Field label="Email" htmlFor="email" required>
                <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
              </Field>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Enviando…' : 'Enviar enlace'}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <Link href="/login" className="text-sm text-brand-600 underline underline-offset-2">
                Volver
              </Link>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}
