"use client"

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
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
  const t = useTranslations('campanas')
  const idioma = useLocale()
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
          title={t('sinBriefTitulo')}
          description={t('sinBriefBajada')}
          action={canEdit ? <Button onClick={() => setEditing(true)}>{t('cargarBrief')}</Button> : undefined}
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
      toast.success(t('briefGuardado'))
      setEditing(false)
      router.refresh()
    })
  }

  if (!editing && brief) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('criterios')}</CardTitle>
            {canEdit ? (
              <div className="pt-1">
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                  {t('editarBrief')}
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Definition label={t('briefPais')} value={brief.country} />
              <Definition label={t('briefIdioma')} value={brief.language} />
              <Definition
                label={t('briefRangoSeguidores')}
                value={
                  brief.followersMin || brief.followersMax
                    ? `${formatNumber(brief.followersMin, idioma)} – ${formatNumber(brief.followersMax, idioma)}`
                    : null
                }
              />
              <Definition
                label={t('briefErMinimo')}
                value={brief.engagementRateMin != null ? `${brief.engagementRateMin}%` : null}
              />
              <Definition
                label={t('briefEdadAudiencia')}
                value={
                  brief.audienceAgeMin || brief.audienceAgeMax
                    ? t('briefAnios', { desde: brief.audienceAgeMin ?? '?', hasta: brief.audienceAgeMax ?? '?' })
                    : null
                }
              />
              <Definition
                label={t('briefGeo')}
                value={
                  brief.audienceGeoPredominance
                    ? `${brief.audienceGeoPredominance}${
                        brief.audienceGeoMinPercent
                          ? t('briefGeoMinimo', { pct: brief.audienceGeoMinPercent })
                          : ''
                      }`
                    : null
                }
              />
            </dl>

            {brief.platforms.length > 0 ? (
              <div className="mt-4">
                <p className="mb-1 text-xs font-medium text-ink-500">{t('briefPlataformas')}</p>
                <div className="flex flex-wrap gap-1">
                  {brief.platforms.map((platform) => (
                    <Badge key={platform} tone="slate">
                      {platform}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <TextBlock title={t('briefPerfilIdeal')} value={brief.idealProfile} />
            <TextBlock title={t('briefIdeas')} value={brief.contentIdeas} />
            <TextBlock title={t('briefUsos')} value={brief.realProductUses} />
            <TextBlock title={t('briefInclusion')} value={brief.inclusionCriteria} />
            <TextBlock title={t('briefExclusion')} value={brief.exclusionCriteria} />
            {canSeeInternal && brief.internalNotes ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
                  {t('briefNotasInternas')}
                </p>
                <p className="whitespace-pre-wrap text-sm text-amber-900">{brief.internalNotes}</p>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('squad')}</CardTitle>
              <p className="text-xs text-ink-500">{t('squadBajada')}</p>
            </CardHeader>
            <CardBody>
              {brief.clusters.length === 0 ? (
                <p className="text-sm text-ink-500">{t('sinClusters')}</p>
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
                              <span className="text-ink-500">{t('sinPerfilesTodavia')}</span>
                            ) : (
                              <>
                                <span className="font-semibold text-ink-950">{real}%</span>
                                <span className="text-ink-500">
                                  {t('deBuscado', { pct: cluster.targetPercent })}
                                </span>
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
                          {t('perfilesCantidad', { cantidad: cuantos })}
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
                <CardTitle>{t('nichos')}</CardTitle>
              </CardHeader>
              <CardBody>
                <ul className="space-y-2">
                  {brief.niches.map((niche) => (
                    <li key={niche.id} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className={niche.mode === 'EXCLUDED' ? 'text-rose-700 line-through' : 'text-ink-800'}>
                          {niche.label}
                        </span>
                        <span className="text-amber-600" aria-label={t('prioridadDeCinco', { valor: niche.priority })}>
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
                <CardTitle>{t('palabrasClave')}</CardTitle>
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
        <CardTitle>{brief ? t('editarBrief') : t('cargarBrief')}</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('briefPais')} htmlFor="country">
              <Input id="country" name="country" defaultValue={brief?.country ?? ''} maxLength={60} />
            </Field>
            <Field label={t('briefIdioma')} htmlFor="language">
              <Input id="language" name="language" defaultValue={brief?.language ?? ''} maxLength={40} />
            </Field>
            <Field label={t('campoErMinimoBrief')} htmlFor="engagementRateMin">
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
            <Field label={t('campoSegDesde')} htmlFor="followersMin">
              <Input id="followersMin" name="followersMin" type="number" min={0} defaultValue={brief?.followersMin ?? ''} />
            </Field>
            <Field label={t('campoSegHasta')} htmlFor="followersMax" errors={errors.followersMax}>
              <Input id="followersMax" name="followersMax" type="number" min={0} defaultValue={brief?.followersMax ?? ''} />
            </Field>
            <Field label={t('briefPlataformas')} htmlFor="platforms" hint={t('plataformasAyuda')}>
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
            <Field label={t('campoEdadDesde')} htmlFor="audienceAgeMin">
              <Input id="audienceAgeMin" name="audienceAgeMin" type="number" min={0} max={120} defaultValue={brief?.audienceAgeMin ?? ''} />
            </Field>
            <Field label={t('campoEdadHasta')} htmlFor="audienceAgeMax">
              <Input id="audienceAgeMax" name="audienceAgeMax" type="number" min={0} max={120} defaultValue={brief?.audienceAgeMax ?? ''} />
            </Field>
            <Field label={t('campoAudienciaPredominante')} htmlFor="audienceGeoPredominance">
              <Input
                id="audienceGeoPredominance"
                name="audienceGeoPredominance"
                defaultValue={brief?.audienceGeoPredominance ?? ''}
                maxLength={120}
              />
            </Field>
            <Field label={t('campoGeoMinimo')} htmlFor="audienceGeoMinPercent">
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

          <Field label={t('briefPerfilIdeal')} htmlFor="idealProfile">
            <Textarea id="idealProfile" name="idealProfile" rows={4} defaultValue={brief?.idealProfile ?? ''} />
          </Field>
          <Field label={t('briefIdeas')} htmlFor="contentIdeas">
            <Textarea id="contentIdeas" name="contentIdeas" rows={4} defaultValue={brief?.contentIdeas ?? ''} />
          </Field>
          <Field label={t('briefUsos')} htmlFor="realProductUses">
            <Textarea id="realProductUses" name="realProductUses" rows={3} defaultValue={brief?.realProductUses ?? ''} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('briefInclusion')} htmlFor="inclusionCriteria">
              <Textarea id="inclusionCriteria" name="inclusionCriteria" rows={4} defaultValue={brief?.inclusionCriteria ?? ''} />
            </Field>
            <Field label={t('briefExclusion')} htmlFor="exclusionCriteria">
              <Textarea id="exclusionCriteria" name="exclusionCriteria" rows={4} defaultValue={brief?.exclusionCriteria ?? ''} />
            </Field>
          </div>
          {canSeeInternal ? (
            <Field label={t('campoNotasInternas')} htmlFor="internalNotes" hint={t('notasInternasAyuda')}>
              <Textarea id="internalNotes" name="internalNotes" rows={3} defaultValue={brief?.internalNotes ?? ''} />
            </Field>
          ) : null}

          <fieldset className="rounded-lg border border-ink-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
              {t('squad')}
            </legend>
            <div className="space-y-2">
              {clusters.map((cluster, index) => (
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <div className="w-14">
                    <label className="mb-1 block text-xs text-ink-600" htmlFor={`emoji-${index}`}>
                      {t('campoEmoji')}
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
                      {t('campoClusterLabel')}
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
                      {t('campoObjetivoPct')}
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
                    {t('quitar')}
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
                {t('agregarCluster')}
              </Button>
              <span className={totalPercent > 100 ? 'text-sm font-medium text-rose-600' : 'text-sm text-ink-500'}>
                {t('sumaPct', { pct: totalPercent })}
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
              {pending ? t('guardando') : t('guardarBrief')}
            </Button>
            {brief ? (
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                {t('cancelar')}
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
