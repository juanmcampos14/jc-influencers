import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { ExternalLink } from '@/components/status-badge'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { can } from '@/lib/authz/context'
import { searchInfluencers } from '@/lib/repos/influencers'
import { scoped } from '@/lib/repos/base'
import { formatFollowers, formatPercent } from '@/lib/util/format'
import { InfluencerFilters } from './filters'
import { NewInfluencerDialog } from './new-influencer-dialog'

export const metadata: Metadata = { title: 'Influencers' }
export const dynamic = 'force-dynamic'

type SearchParams = {
  q?: string
  pais?: string
  plataforma?: string
  nicho?: string
  desde?: string
  hasta?: string
  er?: string
  estado?: string
  pagina?: string
}

export default async function InfluencersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const ctx = await requireContext()

  // Un usuario sin acceso a la base global recibe 404, no una pantalla vacía.
  const { niches, countries, page } = await loadPage(async () => {
    const [nicheRows, countryRows] = await Promise.all([
      scoped(ctx, (tx) => tx.niche.findMany({ where: { active: true }, orderBy: { order: 'asc' } })),
      scoped(ctx, (tx) =>
        tx.influencer.findMany({
          where: { country: { not: null } },
          select: { country: true },
          distinct: ['country'],
          orderBy: { country: 'asc' },
          take: 60,
        }),
      ),
    ])
    const results = await searchInfluencers(
      ctx,
      {
        search: params.q?.trim() || null,
        countries: params.pais ? [params.pais] : null,
        platforms: params.plataforma ? [params.plataforma as never] : null,
        nicheKeys: params.nicho ? [params.nicho] : null,
        minFollowers: params.desde ? Number(params.desde) : null,
        maxFollowers: params.hasta ? Number(params.hasta) : null,
        minEngagement: params.er ? Number(params.er) : null,
        statuses: params.estado ? [params.estado as never] : null,
      },
      { page: Number(params.pagina ?? 1) || 1, pageSize: 30 },
    )
    return { niches: nicheRows, countries: countryRows, page: results }
  })

  const canManage = can(ctx, 'influencer.manage', null)
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => Boolean(value)) as [string, string][])

  return (
    <>
      <PageHeader
        title="Base de influencers"
        description="Base única de la agencia. Un influencer existe una sola vez y participa en varias campañas."
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href="/influencers/duplicados">Posibles duplicados</Link>
            </Button>
            {canManage ? <NewInfluencerDialog niches={niches.map((n) => ({ key: n.key, label: n.label }))} /> : null}
          </>
        }
      />
      <div className="space-y-4 px-5 py-6 sm:px-8">
        <InfluencerFilters
          niches={niches.map((n) => ({ key: n.key, label: n.label }))}
          countries={countries.map((c) => c.country).filter((c): c is string => Boolean(c))}
        />

        <Card>
          {page.items.length === 0 ? (
            <EmptyState
              title="No hay influencers que coincidan"
              description="Probá con menos filtros, o importá el Excel de scouting desde Importación."
            />
          ) : (
            <>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Creador</Th>
                      <Th>País</Th>
                      <Th>Nichos</Th>
                      <Th>Perfiles</Th>
                      <Th className="text-right">Seguidores</Th>
                      <Th className="text-right">ER</Th>
                      <Th>Estado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((influencer) => {
                      const main = influencer.profiles[0]
                      return (
                        <Tr key={influencer.id}>
                          <Td>
                            <Link
                              href={`/influencers/${influencer.id}`}
                              className="font-medium text-ink-900 hover:text-brand-700"
                            >
                              {influencer.displayName}
                            </Link>
                            {influencer.primaryHandle ? (
                              <p className="text-xs text-ink-500">@{influencer.primaryHandle}</p>
                            ) : null}
                          </Td>
                          <Td className="text-sm">{influencer.country ?? '—'}</Td>
                          <Td>
                            <div className="flex flex-wrap gap-1">
                              {influencer.niches.slice(0, 3).map((niche) => (
                                <Badge key={niche} tone="slate">
                                  {niche}
                                </Badge>
                              ))}
                            </div>
                          </Td>
                          <Td className="text-xs">
                            <div className="flex flex-wrap gap-2">
                              {influencer.profiles.slice(0, 3).map((profile) => (
                                <ExternalLink key={profile.id} href={profile.url}>
                                  {profile.platform.toLowerCase()}
                                </ExternalLink>
                              ))}
                              {influencer.profiles.length === 0 ? <span className="text-ink-400">sin perfil</span> : null}
                            </div>
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatFollowers(main?.followers)}
                            {main?.stale ? <span className="block text-[11px] text-amber-700">dato viejo</span> : null}
                          </Td>
                          <Td className="text-right tabular-nums">{formatPercent(main?.engagementRate)}</Td>
                          <Td>
                            <Badge tone={influencer.status === 'ACTIVE' ? 'emerald' : 'slate'}>{influencer.status}</Badge>
                          </Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Table>
              </TableWrap>
              <div className="flex items-center justify-between border-t border-ink-200 px-5 py-3 text-sm">
                <p className="text-ink-500">
                  {page.total} influencers · página {page.page} de {page.pageCount}
                </p>
                <div className="flex gap-2">
                  {page.page > 1 ? (
                    <Link
                      href={`/influencers?${new URLSearchParams({ ...Object.fromEntries(query), pagina: String(page.page - 1) })}`}
                      className="rounded-md border border-ink-300 px-3 py-1.5 hover:bg-ink-100"
                    >
                      Anterior
                    </Link>
                  ) : null}
                  {page.page < page.pageCount ? (
                    <Link
                      href={`/influencers?${new URLSearchParams({ ...Object.fromEntries(query), pagina: String(page.page + 1) })}`}
                      className="rounded-md border border-ink-300 px-3 py-1.5 hover:bg-ink-100"
                    >
                      Siguiente
                    </Link>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  )
}
