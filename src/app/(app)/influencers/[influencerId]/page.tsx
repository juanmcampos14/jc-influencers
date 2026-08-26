import type * as React from 'react'
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

const ADULT_LABELS: Record<string, string> = {
  CONFIRMED: 'Mayoría de edad confirmada',
  NOT_CONFIRMED: 'Mayoría de edad sin confirmar',
  NOT_APPLICABLE: 'No aplica',
}

export default async function InfluencerDetailPage({ params }: { params: Promise<{ influencerId: string }> }) {
  const { influencerId } = await params
  const ctx = await requireContext()

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
            Influencers
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
            <p className="font-medium">Posibles duplicados sin resolver</p>
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
            <p className="mt-1 text-xs">Nunca se fusionan automáticamente: la decisión es de una persona.</p>
          </InfoNote>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Perfiles sociales</CardTitle>
              </CardHeader>
              {influencer.profiles.length === 0 ? (
                <CardBody>
                  <p className="text-sm text-ink-500">Todavía no hay perfiles cargados.</p>
                </CardBody>
              ) : (
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Plataforma</Th>
                        <Th>Perfil</Th>
                        <Th className="text-right">Seguidores</Th>
                        <Th className="text-right">ER</Th>
                        <Th className="text-right">Views prom.</Th>
                        <Th className="text-right">% audiencia local</Th>
                        <Th>Fuente y fecha</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {influencer.profiles.map((profile) => (
                        <Tr key={profile.id}>
                          <Td>
                            <Badge tone="slate">{profile.platform}</Badge>
                            {profile.isPrimary ? <Badge tone="blue" className="ml-1">principal</Badge> : null}
                          </Td>
                          <Td className="text-xs">
                            <ExternalLink href={profile.url}>
                              {profile.handle ? `@${profile.handle}` : profile.url}
                            </ExternalLink>
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatFollowers(profile.followers)}
                            {profile.followersRaw ? (
                              <span className="block text-[11px] text-ink-400" title="Valor tal cual venía del origen">
                                origen: {profile.followersRaw}
                              </span>
                            ) : null}
                            {profile.followersUnparsed ? (
                              <span className="block text-[11px] font-medium text-amber-700">sin normalizar</span>
                            ) : null}
                          </Td>
                          <Td className="text-right tabular-nums">{formatPercent(profile.engagementRate)}</Td>
                          <Td className="text-right tabular-nums">
                            {profile.avgViews === null ? '—' : formatFollowers(profile.avgViews)}
                          </Td>
                          <Td className="text-right tabular-nums">{formatPercent(profile.audienceLocalPercent)}</Td>
                          <Td className="text-xs">
                            <p className="text-ink-700">{profile.metricSource ?? 'sin fuente'}</p>
                            <p className={profile.stale ? 'font-medium text-amber-700' : 'text-ink-500'}>
                              {profile.measuredAt ? formatDate(profile.measuredAt, ctx.user.timezone) : 'sin fecha'}
                              {profile.stale ? ' · desactualizado' : ''}
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
                <CardTitle>Historial en campañas</CardTitle>
              </CardHeader>
              {influencer.campaigns.length === 0 ? (
                <CardBody>
                  <p className="text-sm text-ink-500">Todavía no participó en ninguna campaña.</p>
                </CardBody>
              ) : (
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Campaña</Th>
                        <Th>Cliente</Th>
                        <Th>Estado</Th>
                        <Th>Aprobación</Th>
                        <Th>Actualizado</Th>
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
                          <Td className="text-xs text-ink-600">{formatDate(row.updatedAt, ctx.user.timezone)}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Historial de métricas</CardTitle>
                <p className="text-xs text-ink-500">
                  Las métricas nunca se pisan: cada lectura queda con su fuente y su fecha.
                </p>
              </CardHeader>
              {influencer.history.length === 0 ? (
                <CardBody>
                  <p className="text-sm text-ink-500">Sin lecturas registradas.</p>
                </CardBody>
              ) : (
                <TableWrap className="max-h-96">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Fecha</Th>
                        <Th>Plataforma</Th>
                        <Th className="text-right">Seguidores</Th>
                        <Th className="text-right">ER</Th>
                        <Th>Fuente</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {influencer.history.map((row, index) => (
                        <Tr key={`${row.profileId}-${index}`}>
                          <Td className="whitespace-nowrap text-xs">{formatDateTime(row.capturedAt, ctx.user.timezone)}</Td>
                          <Td className="text-xs">{row.platform}</Td>
                          <Td className="text-right tabular-nums">{formatFollowers(row.followers)}</Td>
                          <Td className="text-right tabular-nums">{formatPercent(row.engagementRate)}</Td>
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
                <CardTitle>Ficha</CardTitle>
              </CardHeader>
              <CardBody>
                <dl className="space-y-2 text-sm">
                  <Row label="Nombre real" value={influencer.realName} />
                  <Row label="Handle" value={influencer.primaryHandle ? `@${influencer.primaryHandle}` : null} />
                  <Row label="País" value={influencer.country} />
                  <Row label="Ciudad" value={influencer.city} />
                  <Row label="Idioma" value={influencer.language} />
                  <Row label="Representante" value={influencer.representative} />
                  <Row label="Estado" value={<InfluencerStatusBadge status={influencer.status} />} />
                  <Row label="Edad" value={ADULT_LABELS[influencer.adultStatus] ?? influencer.adultStatus} />
                </dl>
                {influencer.niches.length > 0 ? (
                  <div className="mt-3">
                    <p className="mb-1 text-xs text-ink-500">Nichos</p>
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
                    <p className="mb-1 text-xs text-ink-500">Tags</p>
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
                  <CardTitle>Contacto</CardTitle>
                  <p className="text-xs text-ink-500">Acceso restringido y auditado.</p>
                </CardHeader>
                <CardBody>
                  <dl className="space-y-2 text-sm">
                    <Row label="Email" value={influencer.contact.email} />
                    <Row label="Teléfono" value={influencer.contact.phone} />
                    <Row label="Base legal declarada" value={influencer.contact.legalBasis} />
                    <Row label="Notas" value={influencer.contact.notes} />
                  </dl>
                </CardBody>
              </Card>
            ) : null}

            {influencer.internalNotes ? (
              <Card>
                <CardHeader>
                  <CardTitle>Notas internas</CardTitle>
                  <p className="text-xs text-ink-500">Sólo agencia.</p>
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
