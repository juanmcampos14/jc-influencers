"use client"

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { ErrorState } from '@/components/ui/states'
import { PasswordRules } from '@/components/password-rules'
import { acceptInvitationAction } from '../../actions'

type Invitation = { name: string; email: string; kind: 'AGENCY' | 'CLIENT'; clientName: string | null; roleLabel: string }

export function AcceptForm({ token, invitation }: { token: string; invitation: Invitation }) {
  const router = useRouter()
  const [name, setName] = useState(invitation.name)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFieldErrors([])
    startTransition(async () => {
      const result = await acceptInvitationAction({ token, name, password })
      if (!result.ok) {
        setFieldErrors(result.fieldErrors?.password ?? [])
        if (!result.fieldErrors?.password) setError(result.message)
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
        <h1 className="mb-1 text-base font-semibold text-ink-900">Activá tu cuenta</h1>
        <p className="mb-5 text-sm text-ink-500">
          Invitación para <strong className="text-ink-800">{invitation.email}</strong>
          {invitation.clientName ? (
            <>
              {' '}
              en <strong className="text-ink-800">{invitation.clientName}</strong>
            </>
          ) : (
            ' como usuario de la agencia'
          )}
          .
        </p>
        {error ? (
          <div className="mb-4">
            <ErrorState title={error} />
          </div>
        ) : null}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Tu nombre" htmlFor="name" required>
            <Input id="name" value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
          </Field>
          <Field label="Contraseña" htmlFor="password" errors={fieldErrors} required>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          <PasswordRules value={password} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Activando…' : 'Activar mi cuenta'}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}
