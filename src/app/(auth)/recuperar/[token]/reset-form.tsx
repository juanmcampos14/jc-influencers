"use client"

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { ErrorState } from '@/components/ui/states'
import { PasswordRules } from '@/components/password-rules'
import { completeResetAction } from '../../actions'

export function ResetForm({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [password, setPassword] = useState('')
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFieldErrors([])
    startTransition(async () => {
      const result = await completeResetAction({ token, password })
      if (!result.ok) {
        setFieldErrors(result.fieldErrors?.password ?? [])
        if (!result.fieldErrors?.password) setError(result.message)
        return
      }
      if (!result.data.ok) {
        setError(result.data.message ?? 'El enlace no es válido.')
        return
      }
      setDone(true)
      setTimeout(() => router.replace('/login'), 1200)
    })
  }

  if (done) {
    return (
      <Card>
        <CardBody>
          <h1 className="mb-2 text-base font-semibold text-ink-900">Contraseña actualizada</h1>
          <p className="text-sm text-ink-600">
            Ya podés ingresar con tu contraseña nueva. Cerramos todas las sesiones abiertas por seguridad.
          </p>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardBody>
        <h1 className="mb-1 text-base font-semibold text-ink-900">Definí tu contraseña</h1>
        <p className="mb-5 text-sm text-ink-500">Este enlace se puede usar una sola vez.</p>
        {error ? (
          <div className="mb-4">
            <ErrorState title={error} />
          </div>
        ) : null}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Contraseña nueva" htmlFor="password" errors={fieldErrors} required>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoFocus
            />
          </Field>
          <PasswordRules value={password} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </form>
        <div className="mt-4 text-center">
          <Link href="/login" className="text-sm text-brand-600 underline underline-offset-2">
            Volver
          </Link>
        </div>
      </CardBody>
    </Card>
  )
}
