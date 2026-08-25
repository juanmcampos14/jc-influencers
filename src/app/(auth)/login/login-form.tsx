"use client"

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { ErrorState } from '@/components/ui/states'
import { loginAction } from '../actions'

export function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await loginAction({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (!result.data.ok) {
        setError(result.data.message)
        return
      }
      router.replace('/')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardBody>
        <h1 className="mb-1 text-base font-semibold text-ink-900">Ingresar</h1>
        <p className="mb-5 text-sm text-ink-500">Usá el email con el que te dieron acceso.</p>

        {error ? (
          <div className="mb-4">
            <ErrorState title={error} />
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="email" required>
            <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
          </Field>
          <Field label="Contraseña" htmlFor="password" required>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/recuperar" className="text-sm text-ink-700 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-900">
            No puedo entrar
          </Link>
        </div>
      </CardBody>
    </Card>
  )
}
