import type * as React from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/app-shell'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { InfoNote } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { ApprovalBadge, ExternalLink, StatusBadge, InfluencerStatusBadge } from '@/components/status-badge'
import { requireContext } from '@/lib/auth/current'
import { can } from '@/lib/authz/context'
import { NotFoundError } from '@/lib/authz/errors'
import { getInfluencer } from '@/lib/repos/influencers'
import { scoped } from '@/lib/repos/base'
import { listCampaigns } from '@/lib/repos/campaigns'
import { EditarFicha } from './editar-ficha'
import { AgregarACampana } from './agregar-a-campana'
import { formatDate, formatDateTime, formatFollowers, formatPercent } from '@/lib/util/format'
import { AddProfileDialog } from './add-profile-dialog'

export const metadata: Metadata = { title: 'Influencer' }
export const dynamic = 'force-dynamic'

/* El texto vive en las traducciones; acá queda sólo el conjunto conocido. */
const ADULT_VALUES = ['CONFIRMED', 'NOT_CONFIRMED', 'NOT_APPLICABLE']

export default async function InfluencerDetailPage({ params }: { params: Promise<{ influencerId: string }> }) {
  const { influencerId } = await params
  const ctx = await requireContext()
  const t = await getTranslations('influencers')
  const idioma = await getLocale()

  let influencer
  try {
    influencer = await getInfluencer(ctx, influencerId)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const canManage = can(ctx, 'influencer.manage', null)

  // El catálogo de nichos, para poder editarlos. El DTO trae las etiquetas, no
  // las claves, así que se traducen contra el catálogo -- que es donde las
  // etiquetas son únicas.
  const niches = canManage
    ? await scoped(ctx, (tx) => tx.niche.findMany({ where: { active: true }, orderBy: { order: 'asc' } }))
    : []
  const clavesDeNicho = niches.filter((n) => influencer.niches.includes(n.label)).map((n) => n.key)

  // Campañas abiertas donde este usuario puede sumar gente.
  const campanas = canManage
    ? await listCampaigns(ctx, { status: ['DRAFT', 'BRIEFING', 'SCOUTING', 'PROPOSAL'] as never }, { pageSize: 50 })
    : null
  const campanasElegibles = (campanas?.items ?? [])
    .filter((campana) => can(ctx, 'candidate.manage', campana.clientId))
    .map((campana) => ({ id: campana.id, name: campana.name, clientName: campana.clientName }))
  const openDuplicates = influencer.duplicates.filter((duplicate) => duplicate.status === 'OPEN')

  return (
    <>
      <PageHeader
        title={influencer.displayName}
        variant="nombre"
        description={influencer.bio ?? undefined}
        breadcrumb={
          <Link href="/influencers" className="hover:underline">
            {t('titulo')}
          </Link>
        }
        actions={
          canManage ? (
            <>
              <EditarFicha
                ficha={{
                  id: influencer.id,
                  version: influencer.version,
                  displayName: influencer.displayName,
                  realName: influencer.realName ?? null,
                  primaryHandle: influencer.primaryHandle ?? null,
                  country: influencer.country ?? null,
                  city: influencer.city ?? null,
                  language: influencer.language ?? null,
                  bio: influencer.bio ?? null,
                  status: influencer.status,
                  adultStatus: influencer.adultStatus,
                  representative: influencer.representative ?? null,
                  internalNotes: influencer.internalNotes ?? null,
                  nicheKeys: clavesDeNicho,
                }}
                niches={niches.map((n) => ({ key: n.key, label: n.label }))}
              />
              <AgregarACampana
                influencerId={influencer.id}
                nombre={influencer.displayName}
                campanas={campanasElegibles}
              />
              <AddProfileDialog influencerId={influencer.id} />
            </>
          ) : null
        }
      />

      <div className="space-y-6 px-5 py-6 sm:px-8">
        {openDuplicates.length > 0 ? (
          <InfoNote>
            <p className="font-medium">{t('posiblesDuplicados')}</p>
            <ul className="mt-1 space-y-0.5">
              {openDuplicates.map((duplicate) => (
                <li key={duplicate.id}>
                  <Link href={`/influencers/${duplicate.otherId}`} className="underline underline-offset-2">
                    {duplicate.otherName}
                  </Link>
                  {' — '}
                  {duplicate.reason}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs">{t('nuncaSeFusionan')}</p>
          </InfoNote>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('perfilesSociales')}</CardTitle>
              </CardHeader>
              {influencer.profiles.length === 0 ? (
                <CardBody>
                  <p className="text-sm text-ink-500">{t('sinPerfilesCargados')}</p>
                </CardBody>
              ) : (
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>{t('colPlataforma')}</Th>
                        <Th>{t('colPerfil')}</Th>
                        <Th className="text-right">{t('colSeguidores')}</Th>
                        <Th className="text-right">{t('colEr')}</Th>
                        <Th className="text-right">{t('colViewsProm')}</Th>
                        <Th className="text-right">{t('colAudienciaLocal')}</Th>
                        <Th>{t('colFuenteYFecha')}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {influencer.profiles.map((profile) => (
                        <Tr key={profile.id}>
                          <Td>
                            <Badge tone="slate">{profile.platform}</Badge>
                            {profile.isPrimary ? <Badge tone="blue" className="ml-1">{t('principal')}</Badge> : null}
                          </Td>
                          <Td className="text-xs">
                            <ExternalLink href={profile.url}>
                              {profile.handle ? `@${profile.handle}` : profile.url}
                            </ExternalLink>
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatFollowers(profile.followers, idioma)}
                            {profile.followersRaw ? (
                              <span className="block text-[11px] text-ink-400" title={t('valorDelOrigen')}>
                                {t('origenValor', { valor: profile.followersRaw })}
                              </span>
                            ) : null}
                            {profile.followersUnparsed ? (
                              <span className="block text-[11px] font-medium text-amber-700">{t('sinNormalizar')}</span>
                            ) : null}
                          </Td>
                          <Td className="text-right tabular-nums">{formatPercent(profile.engagementRate, idioma)}</Td>
                          <Td className="text-right tabular-nums">
                            {profile.avgViews === null ? '—' : formatFollowers(profile.avgViews, idioma)}
                          </Td>
                          <Td className="text-right tabular-nums">{formatPercent(profile.audienceLocalPercent, idioma)}</Td>
                          <Td className="text-xs">
                            <p className="text-ink-700">{profile.metricSource ?? t('sinFuente')}</p>
                            <p className={profile.stale ? 'font-medium text-amber-700' : 'text-ink-500'}>
                              {profile.measuredAt ? formatDate(profile.measuredAt, ctx.user.timezone, idioma) : t('sinFecha')}
                              {profile.stale ? ` · ${t('desactualizado')}` : ''}
                            </p>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('historialEnCampanas')}</CardTitle>
              </CardHeader>
              {influencer.campaigns.length === 0 ? (
                <CardBody>
                  <p className="text-sm text-ink-500">{t('sinCampanas')}</p>
                </CardBody>
              ) : (
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>{t('colCampana')}</Th>
                        <Th>{t('colCliente')}</Th>
                        <Th>{t('colEstado')}</Th>
                        <Th>{t('colAprobacion')}</Th>
                        <Th>{t('colActualizado')}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {influencer.campaigns.map((row) => (
                        <Tr key={row.candidacyId}>
                          <Td>
                            <Link href={`/campanas/${row.campaignId}`} className="font-medium underline-offset-4 hover:underline">
                              {row.campaignName}
                            </Link>
                          </Td>
                          <Td className="text-ink-600">{row.clientName}</Td>
                          <Td>
                            <StatusBadge statusKey={row.statusKey} />
                          </Td>
                          <Td>
                            <ApprovalBadge approval={row.clientApproval} />
                          </Td>
                          <Td className="text-xs text-ink-600">{formatDate(row.updatedAt, ctx.user.timezone, idioma)}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('historialDeMetricas')}</CardTitle>
                <p className="text-xs text-ink-500">{t('metricasNoSePisan')}</p>
              </CardHeader>
              {influencer.history.length === 0 ? (
                <CardBody>
                  <p className="text-sm text-ink-500">{t('sinLecturas')}</p>
                </CardBody>
              ) : (
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>{t('colFecha')}</Th>
                        <Th>{t('colPlataforma')}</Th>
                        <Th className="text-right">{t('colSeguidores')}</Th>
                        <Th className="text-right">{t('colEr')}</Th>
                        <Th>{t('colFuente')}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {influencer.history.map((row, index) => (
                        <Tr key={`${row.profileId}-${index}`}>
                          <Td className="whitespace-nowrap text-xs">{formatDateTime(row.capturedAt, ctx.user.timezone, idioma)}</Td>
                          <Td className="text-xs">{row.platform}</Td>
                          <Td className="text-right tabular-nums">{formatFollowers(row.followers, idioma)}</Td>
                          <Td className="text-right tabular-nums">{formatPercent(row.engagementRate, idioma)}</Td>
                          <Td className="text-xs text-ink-600">{row.source ?? '—'}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('ficha')}</CardTitle>
              </CardHeader>
              <CardBody>
                <dl className="space-y-2 text-sm">
                  <Row label={t('campoNombreReal')} value={influencer.realName} />
                  <Row label={t('campoHandleCorto')} value={influencer.primaryHandle ? `@${influencer.primaryHandle}` : null} />
                  <Row label={t('campoPais')} value={influencer.country} />
                  <Row label={t('campoCiudad')} value={influencer.city} />
                  <Row label={t('campoIdioma')} value={influencer.language} />
                  <Row label={t('campoRepresentanteCorto')} value={influencer.representative} />
                  <Row label={t('colEstado')} value={<InfluencerStatusBadge status={influencer.status} />} />
                  <Row
                    label={t('campoEdad')}
                    value={
                      ADULT_VALUES.includes(influencer.adultStatus)
                        ? t(`edad${influencer.adultStatus}`)
                        : influencer.adultStatus
                    }
                  />
                </dl>
                {influencer.niches.length > 0 ? (
                  <div className="mt-3">
                    <p className="mb-1 text-xs text-ink-500">{t('colNichos')}</p>
                    <div className="flex flex-wrap gap-1">
                      {influencer.niches.map((niche) => (
                        <Badge key={niche} tone="slate">
                          {niche}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {influencer.tags.length > 0 ? (
                  <div className="mt-3">
                    <p className="mb-1 text-xs text-ink-500">{t('tags')}</p>
                    <div className="flex flex-wrap gap-1">
                      {influencer.tags.map((tag) => (
                        <Badge key={tag} tone="blue">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardBody>
            </Card>

            {influencer.contact ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t('contacto')}</CardTitle>
                  <p className="text-xs text-ink-500">{t('contactoAyuda')}</p>
                </CardHeader>
                <CardBody>
                  <dl className="space-y-2 text-sm">
                    <Row label={t('campoEmail')} value={influencer.contact.email} />
                    <Row label={t('campoTelefono')} value={influencer.contact.phone} />
                    <Row label={t('campoBaseLegal')} value={influencer.contact.legalBasis} />
                    <Row label={t('campoNotas')} value={influencer.contact.notes} />
                  </dl>
                </CardBody>
              </Card>
            ) : null}

            {influencer.internalNotes ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t('notasInternas')}</CardTitle>
                  <p className="text-xs text-ink-500">{t('soloAgencia')}</p>
                </CardHeader>
                <CardBody>
                  <p className="whitespace-pre-wrap text-sm text-ink-700">{influencer.internalNotes}</p>
                </CardBody>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="text-right text-ink-800">{value ?? '—'}</dd>
    </div>
  )
}
