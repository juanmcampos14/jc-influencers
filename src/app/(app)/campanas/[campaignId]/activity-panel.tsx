"use client"

import * as React from 'react'
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

const VISIBILITY_LABELS: Record<string, { label: string; tone: string; hint: string }> = {
  INTERNAL: { label: 'Nota interna', tone: 'slate', hint: 'Sólo la agencia. Nunca sale al cliente.' },
  CLIENT_VISIBLE: { label: 'Visible para el cliente', tone: 'blue', hint: 'El cliente lo ve en su portal.' },
  CLIENT_AUTHORED: { label: 'Escrito por el cliente', tone: 'emerald', hint: 'Feedback del cliente.' },
  BUDGET_PRIVATE: { label: 'Privado de presupuesto', tone: 'violet', hint: 'Sólo con permiso de presupuesto.' },
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
  const router = useRouter()
  const [body, setBody] = React.useState('')
  const [visibility, setVisibility] = React.useState(
    side === 'CLIENT' ? 'CLIENT_AUTHORED' : canWriteInternal ? 'INTERNAL' : 'CLIENT_VISIBLE',
  )
  const [pending, startTransition] = React.useTransition()

  const options = React.useMemo(() => {
    if (side === 'CLIENT') return [{ value: 'CLIENT_AUTHORED', label: 'Feedback para la agencia' }]
    const list: Array<{ value: string; label: string }> = []
    if (canWriteInternal) list.push({ value: 'INTERNAL', label: 'Nota interna (no la ve el cliente)' })
    if (canWriteClientVisible) list.push({ value: 'CLIENT_VISIBLE', label: 'Comentario visible para el cliente' })
    if (canWriteBudget) list.push({ value: 'BUDGET_PRIVATE', label: 'Observación privada de presupuesto' })
    return list
  }, [side, canWriteInternal, canWriteClientVisible, canWriteBudget])

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
      toast.success('Comentario publicado.')
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Conversación</CardTitle>
        </CardHeader>
        {comments.length === 0 ? (
          <EmptyState title="Todavía no hay comentarios" description="Escribí el primero desde el panel de la derecha." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {comments.map((comment) => {
              const meta = VISIBILITY_LABELS[comment.visibility] ?? { label: comment.visibility, tone: 'slate', hint: '' }
              return (
                <li key={comment.id} className="px-5 py-3.5">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink-900">{comment.authorName ?? 'Sistema'}</span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className="text-xs text-ink-500">{formatDateTime(comment.createdAt, timezone)}</span>
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
          <CardTitle>Escribir</CardTitle>
        </CardHeader>
        <CardBody>
          {options.length === 0 ? (
            <p className="text-sm text-ink-500">Tu rol es de sólo lectura.</p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              {options.length > 1 ? (
                <Field label="Tipo" htmlFor="visibility" hint={VISIBILITY_LABELS[visibility]?.hint}>
                  <Select id="visibility" value={visibility} onChange={(event) => setVisibility(event.target.value)}>
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <p className="text-xs text-ink-500">{VISIBILITY_LABELS[visibility]?.hint}</p>
              )}
              <Field label="Comentario" htmlFor="body" required>
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
                {pending ? 'Publicando…' : 'Publicar'}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
