"use client"

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Field, Select, Textarea } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/states'
import { formatDateTime } from '@/lib/util/format'
import type { CommentDto } from '@/lib/domain/dto'
import { createCommentAction } from '../../actions/comments'

/* Tono acá; el nombre y la ayuda, en `visibilidad<CLAVE>` de las traducciones. */
const VISIBILITY_TONES: Record<string, string> = {
  INTERNAL: 'slate',
  CLIENT_VISIBLE: 'blue',
  CLIENT_AUTHORED: 'emerald',
  BUDGET_PRIVATE: 'violet',
}

export function ActivityPanel({
  campaignId,
  candidacyId,
  comments,
  canWriteInternal,
  canWriteClientVisible,
  canWriteBudget,
  side,
  timezone,
}: {
  campaignId?: string
  candidacyId?: string
  comments: CommentDto[]
  canWriteInternal: boolean
  canWriteClientVisible: boolean
  canWriteBudget: boolean
  side: 'AGENCY' | 'CLIENT'
  timezone: string
}) {
  const t = useTranslations('campanas')
  const idioma = useLocale()
  const router = useRouter()
  const [body, setBody] = React.useState('')
  const [visibility, setVisibility] = React.useState(
    side === 'CLIENT' ? 'CLIENT_AUTHORED' : canWriteInternal ? 'INTERNAL' : 'CLIENT_VISIBLE',
  )
  const [pending, startTransition] = React.useTransition()

  const options = React.useMemo(() => {
    if (side === 'CLIENT') return [{ value: 'CLIENT_AUTHORED', label: t('opcionCliente') }]
    const list: Array<{ value: string; label: string }> = []
    if (canWriteInternal) list.push({ value: 'INTERNAL', label: t('opcionInterna') })
    if (canWriteClientVisible) list.push({ value: 'CLIENT_VISIBLE', label: t('opcionVisible') })
    if (canWriteBudget) list.push({ value: 'BUDGET_PRIVATE', label: t('opcionPresupuesto') })
    return list
  }, [side, canWriteInternal, canWriteClientVisible, canWriteBudget, t])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!body.trim()) return
    startTransition(async () => {
      const result = await createCommentAction({
        campaignId: candidacyId ? null : (campaignId ?? null),
        candidacyId: candidacyId ?? null,
        body,
        visibility: visibility as never,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setBody('')
      toast.success(t('comentarioPublicado'))
      router.refresh()
    })
  }

  const ayudaDeVisibilidad =
    visibility in VISIBILITY_TONES ? t(`visibilidad${visibility}Ayuda`) : undefined

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{t('conversacion')}</CardTitle>
        </CardHeader>
        {comments.length === 0 ? (
          <EmptyState title={t('sinComentariosTitulo')} description={t('sinComentariosBajada')} />
        ) : (
          <ul className="divide-y divide-ink-100">
            {comments.map((comment) => {
              const tone = VISIBILITY_TONES[comment.visibility]
              return (
                <li key={comment.id} className="px-5 py-3.5">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink-900">{comment.authorName ?? t('sistema')}</span>
                    <Badge tone={tone ?? 'slate'}>
                      {tone ? t(`visibilidad${comment.visibility}`) : comment.visibility}
                    </Badge>
                    <span className="text-xs text-ink-500">{formatDateTime(comment.createdAt, timezone, idioma)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-ink-700">{comment.body}</p>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('escribir')}</CardTitle>
        </CardHeader>
        <CardBody>
          {options.length === 0 ? (
            <p className="text-sm text-ink-500">{t('soloLectura')}</p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              {options.length > 1 ? (
                <Field label={t('campoTipo')} htmlFor="visibility" hint={ayudaDeVisibilidad}>
                  <Select id="visibility" value={visibility} onChange={(event) => setVisibility(event.target.value)}>
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <p className="text-xs text-ink-500">{ayudaDeVisibilidad}</p>
              )}
              <Field label={t('campoComentario')} htmlFor="body" required>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={5000}
                  rows={5}
                  required
                />
              </Field>
              <Button type="submit" disabled={pending || !body.trim()}>
                {pending ? t('publicando') : t('publicar')}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
