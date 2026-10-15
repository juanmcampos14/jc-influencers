"use client"

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { requestResetAction } from '../actions'

export function RecoverForm() {
  const t = useTranslations('ingreso')
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
        <h1 className="mb-1 text-base font-semibold text-ink-900">{t('recuperarTitulo')}</h1>
        {sent ? (
          <>
            <p className="mb-4 text-sm text-ink-600">{t('recuperarEnviado')}</p>
            <Link href="/login" className="text-sm text-ink-700 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-900">
              {t('volverAIngresar')}
            </Link>
          </>
        ) : (
          <>
            <p className="mb-5 text-sm text-ink-500">{t('recuperarBajada')}</p>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <Field label={t('campoEmail')} htmlFor="email" required>
                <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
              </Field>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? t('enviando') : t('enviarEnlace')}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <Link href="/login" className="text-sm text-ink-700 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-900">
                {t('volver')}
              </Link>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}
