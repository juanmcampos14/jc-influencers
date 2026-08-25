"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/states'
import { formatNumber } from '@/lib/util/format'
import type { BriefDto } from '@/lib/repos/campaigns'
import { saveBriefAction } from '../../actions/campaigns'

const PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'X', 'TWITCH', 'LINKEDIN', 'FACEBOOK']

type ClusterDraft = { key: string; label: string; emoji: string; targetPercent: number }

export function BriefPanel({
  campaignId,
  brief,
  canEdit,
  canSeeInternal,
  clusterUsage,
  totalCandidaturas,
}: {
  campaignId: string
  brief: BriefDto | null
  canEdit: boolean
  canSeeInternal: boolean
  /** Cuántas candidaturas hay en cada cluster. Indexado por id del cluster. */
  clusterUsage: Record<string, number>
  /** Total de candidaturas de la campaña, para poder calcular el porcentaje real. */
  totalCandidaturas: number
}) {
  const router = useRouter()
  const [editing, setEditing] = React.useState(brief === null && canEdit)
  const [clusters, setClusters] = React.useState<ClusterDraft[]>(
    () =>
      brief?.clusters.map((cluster) => ({
        key: cluster.key,
        label: cluster.label,
        emoji: cluster.emoji ?? '',
        targetPercent: cluster.targetPercent,
      })) ?? [],
  )
  const [errors, setErrors] = React.useState<Record<string, string[]>>({})
  const [pending, startTransition] = React.useTransition()

  const totalPercent = clusters.reduce((sum, cluster) => sum + (Number(cluster.targetPercent) || 0), 0)

  if (!brief && !editing) {
    return (
      <Card>
        <EmptyState
          title="Esta campaña todavía no tiene brief"
          description="El brief define país, rango de seguidores, engagement, plataformas, nichos y la distribución del squad."
          action={canEdit ? <Button onClick={() => setEditing(true)}>Cargar brief</Button> : undefined}
        />
      </Card>
    )
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const num = (key: string) => {
      const value = String(form.get(key) ?? '').trim()
      return value ? Number(value) : null
    }
    setErrors({})
    startTransition(async () => {
      const result = await saveBriefAction({
        campaignId,
        version: brief?.version,
        country: String(form.get('country') ?? '') || null,
        language: String(form.get('language') ?? '') || null,
        followersMin: num('followersMin'),
        followersMax: num('followersMax'),
        engagementRateMin: num('engagementRateMin'),
        audienceAgeMin: num('audienceAgeMin'),
        audienceAgeMax: num('audienceAgeMax'),
        audienceGeoPredominance: String(form.get('audienceGeoPredominance') ?? '') || null,
        audienceGeoMinPercent: num('audienceGeoMinPercent'),
        platforms: form.getAll('platforms').map(String),
        idealProfile: String(form.get('idealProfile') ?? '') || null,
        contentIdeas: String(form.get('contentIdeas') ?? '') || null,
        realProductUses: String(form.get('realProductUses') ?? '') || null,
        inclusionCriteria: String(form.get('inclusionCriteria') ?? '') || null,
        exclusionCriteria: String(form.get('exclusionCriteria') ?? '') || null,
        ...(canSeeInternal ? { internalNotes: String(form.get('internalNotes') ?? '') || null } : {}),
        clusters: clusters
          .filter((cluster) => cluster.label.trim())
          .map((cluster) => ({
            key: cluster.key || cluster.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50),
            label: cluster.label.trim(),
            emoji: cluster.emoji || null,
            targetPercent: Number(cluster.targetPercent) || 0,
          })),
      })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }
      toast.success('Brief guardado.')
      setEditing(false)
      router.refresh()
    })
  }

  if (!editing && brief) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Criterios de selección</CardTitle>
            {canEdit ? (
              <div className="pt-1">
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                  Editar brief
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Definition label="País" value={brief.country} />
              <Definition label="Idioma" value={brief.language} />
              <Definition
                label="Rango de seguidores"
                value={
                  brief.followersMin || brief.followersMax
                    ? `${formatNumber(brief.followersMin)} – ${formatNumber(brief.followersMax)}`
                    : null
                }
              />
              <Definition
                label="Engagement rate mínimo"
                value={brief.engagementRateMin != null ? `${brief.engagementRateMin}%` : null}
              />
              <Definition
                label="Edad de audiencia"
                value={
                  brief.audienceAgeMin || brief.audienceAgeMax
                    ? `${brief.audienceAgeMin ?? '?'} – ${brief.audienceAgeMax ?? '?'} años`
                    : null
                }
              />
              <Definition
                label="Predominancia geográfica"
                value={
                  brief.audienceGeoPredominance
                    ? `${brief.audienceGeoPredominance}${brief.audienceGeoMinPercent ? ` (mín. ${brief.audienceGeoMinPercent}%)` : ''}`
                    : null
                }
              />
            </dl>

            {brief.platforms.length > 0 ? (
              <div className="mt-4">
                <p className="mb-1 text-xs font-medium text-ink-500">Plataformas</p>
                <div className="flex flex-wrap gap-1">
                  {brief.platforms.map((platform) => (
                    <Badge key={platform} tone="slate">
                      {platform}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <TextBlock title="Perfil ideal" value={brief.idealProfile} />
            <TextBlock title="Ideas de contenido" value={brief.contentIdeas} />
            <TextBlock title="Usos reales del producto" value={brief.realProductUses} />
            <TextBlock title="Criterios de inclusión" value={brief.inclusionCriteria} />
            <TextBlock title="Criterios de exclusión" value={brief.exclusionCriteria} />
            {canSeeInternal && brief.internalNotes ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
                  Notas internas · no salen al cliente
                </p>
                <p className="whitespace-pre-wrap text-sm text-amber-900">{brief.internalNotes}</p>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Distribución del squad</CardTitle>
              <p className="text-xs text-ink-500">
                Lo que buscás contra lo que hay. Configurable por campaña, no son valores fijos del sistema.
              </p>
            </CardHeader>
            <CardBody>
              {brief.clusters.length === 0 ? (
                <p className="text-sm text-ink-500">Sin clusters definidos.</p>
              ) : (
                <ul className="space-y-3">
                  {brief.clusters.map((cluster) => {
                    const cuantos = clusterUsage[cluster.id] ?? 0
                    const real = totalCandidaturas > 0 ? Math.round((cuantos / totalCandidaturas) * 100) : null
                    return (
                      <li key={cluster.id}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                          <span className="text-ink-800">
                            {cluster.emoji ? `${cluster.emoji} ` : ''}
                            {cluster.label}
                          </span>
                          <span className="whitespace-nowrap tabular-nums text-ink-700">
                            {/* El número real primero: es el que responde "¿cómo vamos?" */}
                            {real === null ? (
                              <span className="text-ink-500">sin perfiles todavía</span>
                            ) : (
                              <>
                                <span className="font-semibold text-ink-950">{real}%</span>
                                <span className="text-ink-500"> de {cluster.targetPercent}% buscado</span>
                              </>
                            )}
                          </span>
                        </div>
                        {/*
                          * Dos barras superpuestas: la clara es lo buscado, la
                          * oscura lo que hay. Antes había una sola, dibujada con
                          * el deseo, y se leía como si fuera la realidad.
                          */}
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink-100">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-ink-200"
                            style={{ width: `${Math.min(100, cluster.targetPercent)}%` }}
                          />
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-ink-900"
                            style={{ width: `${Math.min(100, real ?? 0)}%` }}
                          />
                        </div>
                        <p className="mt-0.5 text-[11px] text-ink-500">
                          {cuantos === 1 ? '1 perfil' : `${cuantos} perfiles`}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          {brief.niches.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Nichos</CardTitle>
              </CardHeader>
              <CardBody>
                <ul className="space-y-2">
                  {brief.niches.map((niche) => (
                    <li key={niche.id} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className={niche.mode === 'EXCLUDED' ? 'text-rose-700 line-through' : 'text-ink-800'}>
                          {niche.label}
                        </span>
                        <span className="text-amber-600" aria-label={`Prioridad ${niche.priority} de 5`}>
                          {'★'.repeat(niche.priority)}
                        </span>
                      </div>
                      {niche.idealProfile ? <p className="text-xs text-ink-500">{niche.idealProfile}</p> : null}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {brief.keywords.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Palabras clave</CardTitle>
              </CardHeader>
              <CardBody className="space-y-3">
                {Object.entries(
                  brief.keywords.reduce<Record<string, string[]>>((acc, keyword) => {
                    acc[keyword.category] = [...(acc[keyword.category] ?? []), keyword.term]
                    return acc
                  }, {}),
                ).map(([category, terms]) => (
                  <div key={category}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">{category}</p>
                    <div className="flex flex-wrap gap-1">
                      {terms.map((term) => (
                        <Badge key={term} tone="slate">
                          {term}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{brief ? 'Editar brief' : 'Cargar brief'}</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="País" htmlFor="country">
              <Input id="country" name="country" defaultValue={brief?.country ?? ''} maxLength={60} />
            </Field>
            <Field label="Idioma" htmlFor="language">
              <Input id="language" name="language" defaultValue={brief?.language ?? ''} maxLength={40} />
            </Field>
            <Field label="ER mínimo (%)" htmlFor="engagementRateMin">
              <Input
                id="engagementRateMin"
                name="engagementRateMin"
                type="number"
                step="0.1"
                min={0}
                max={100}
                defaultValue={brief?.engagementRateMin ?? ''}
              />
            </Field>
            <Field label="Seguidores desde" htmlFor="followersMin">
              <Input id="followersMin" name="followersMin" type="number" min={0} defaultValue={brief?.followersMin ?? ''} />
            </Field>
            <Field label="Seguidores hasta" htmlFor="followersMax" errors={errors.followersMax}>
              <Input id="followersMax" name="followersMax" type="number" min={0} defaultValue={brief?.followersMax ?? ''} />
            </Field>
            <Field label="Plataformas" htmlFor="platforms" hint="Ctrl o Cmd para varias.">
              <Select
                id="platforms"
                name="platforms"
                multiple
                size={4}
                className="h-auto"
                defaultValue={brief?.platforms ?? []}
              >
                {PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Edad audiencia desde" htmlFor="audienceAgeMin">
              <Input id="audienceAgeMin" name="audienceAgeMin" type="number" min={0} max={120} defaultValue={brief?.audienceAgeMin ?? ''} />
            </Field>
            <Field label="Edad audiencia hasta" htmlFor="audienceAgeMax">
              <Input id="audienceAgeMax" name="audienceAgeMax" type="number" min={0} max={120} defaultValue={brief?.audienceAgeMax ?? ''} />
            </Field>
            <Field label="Audiencia predominante" htmlFor="audienceGeoPredominance">
              <Input
                id="audienceGeoPredominance"
                name="audienceGeoPredominance"
                defaultValue={brief?.audienceGeoPredominance ?? ''}
                maxLength={120}
              />
            </Field>
            <Field label="% mínimo de esa audiencia" htmlFor="audienceGeoMinPercent">
              <Input
                id="audienceGeoMinPercent"
                name="audienceGeoMinPercent"
                type="number"
                min={0}
                max={100}
                defaultValue={brief?.audienceGeoMinPercent ?? ''}
              />
            </Field>
          </div>

          <Field label="Perfil ideal" htmlFor="idealProfile">
            <Textarea id="idealProfile" name="idealProfile" rows={4} defaultValue={brief?.idealProfile ?? ''} />
          </Field>
          <Field label="Ideas de contenido" htmlFor="contentIdeas">
            <Textarea id="contentIdeas" name="contentIdeas" rows={4} defaultValue={brief?.contentIdeas ?? ''} />
          </Field>
          <Field label="Usos reales del producto" htmlFor="realProductUses">
            <Textarea id="realProductUses" name="realProductUses" rows={3} defaultValue={brief?.realProductUses ?? ''} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Criterios de inclusión" htmlFor="inclusionCriteria">
              <Textarea id="inclusionCriteria" name="inclusionCriteria" rows={4} defaultValue={brief?.inclusionCriteria ?? ''} />
            </Field>
            <Field label="Criterios de exclusión" htmlFor="exclusionCriteria">
              <Textarea id="exclusionCriteria" name="exclusionCriteria" rows={4} defaultValue={brief?.exclusionCriteria ?? ''} />
            </Field>
          </div>
          {canSeeInternal ? (
            <Field label="Notas internas" htmlFor="internalNotes" hint="Sólo agencia. Nunca sale al cliente.">
              <Textarea id="internalNotes" name="internalNotes" rows={3} defaultValue={brief?.internalNotes ?? ''} />
            </Field>
          ) : null}

          <fieldset className="rounded-lg border border-ink-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Distribución del squad
            </legend>
            <div className="space-y-2">
              {clusters.map((cluster, index) => (
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <div className="w-14">
                    <label className="mb-1 block text-xs text-ink-600" htmlFor={`emoji-${index}`}>
                      Emoji
                    </label>
                    <Input
                      id={`emoji-${index}`}
                      value={cluster.emoji}
                      maxLength={4}
                      onChange={(event) =>
                        setClusters((current) =>
                          current.map((item, i) => (i === index ? { ...item, emoji: event.target.value } : item)),
                        )
                      }
                    />
                  </div>
                  <div className="min-w-44 flex-1">
                    <label className="mb-1 block text-xs text-ink-600" htmlFor={`label-${index}`}>
                      Cluster
                    </label>
                    <Input
                      id={`label-${index}`}
                      value={cluster.label}
                      onChange={(event) =>
                        setClusters((current) =>
                          current.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)),
                        )
                      }
                    />
                  </div>
                  <div className="w-24">
                    <label className="mb-1 block text-xs text-ink-600" htmlFor={`percent-${index}`}>
                      % objetivo
                    </label>
                    <Input
                      id={`percent-${index}`}
                      type="number"
                      min={0}
                      max={100}
                      value={cluster.targetPercent}
                      onChange={(event) =>
                        setClusters((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, targetPercent: Number(event.target.value) } : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setClusters((current) => current.filter((_, i) => i !== index))}
                  >
                    Quitar
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setClusters((current) => [...current, { key: '', label: '', emoji: '', targetPercent: 0 }])}
              >
                Agregar cluster
              </Button>
              <span className={totalPercent > 100 ? 'text-sm font-medium text-rose-600' : 'text-sm text-ink-500'}>
                Suma: {totalPercent}%
              </span>
            </div>
            {errors.clusters ? (
              <p role="alert" className="mt-2 text-xs font-medium text-rose-600">
                {errors.clusters.join(' ')}
              </p>
            ) : null}
          </fieldset>

          <div className="flex gap-2">
            <Button type="submit" disabled={pending || totalPercent > 100}>
              {pending ? 'Guardando…' : 'Guardar brief'}
            </Button>
            {brief ? (
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

function Definition({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="text-sm text-ink-800">{value ?? '—'}</dd>
    </div>
  )
}

function TextBlock({ title, value }: { title: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="mt-4">
      <p className="mb-1 text-xs font-medium text-ink-500">{title}</p>
      <p className="whitespace-pre-wrap text-sm text-ink-700">{value}</p>
    </div>
  )
}
