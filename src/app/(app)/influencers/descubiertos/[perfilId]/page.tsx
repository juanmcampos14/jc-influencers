import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/app-shell'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { EmptyState, InfoNote } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { requireContext } from '@/lib/auth/current'
import { loadPage } from '@/lib/actions/page-guard'
import { NotFoundError } from '@/lib/authz/errors'
import { fichaDeBase } from '@/lib/repos/base-conocimiento'
import { formatDate, formatPercent, intlDe } from '@/lib/util/format'
import { platformLabel } from '@/lib/domain/labels'
import { NavDeInfluencers } from '../../sub-nav'

/**
 * El título de la pestaña también está traducido: se lee en el navegador, en
 * los favoritos y en el historial.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('titulos')
  return { title: t('perfilEnLaBase') }
}
export const dynamic = 'force-dynamic'

/*
 * La ficha muestra el número EXACTO de seguidores, no el abreviado de la lista:
 * ahí se escanea --"941 k" alcanza-- y acá se mira un perfil concreto. El resto
 * de los formatos son los compartidos, para que un porcentaje se escriba igual
 * en las dos pantallas.
 */
const exacto = (valor: number | null, idioma: string, sinDato: string): string =>
  valor === null ? sinDato : new Intl.NumberFormat(intlDe(idioma)).format(valor)

const plata = (valor: number, moneda: string, idioma: string): string =>
  new Intl.NumberFormat(intlDe(idioma), { style: 'currency', currency: moneda }).format(valor)

/**
 * La ficha de un perfil de la base.
 *
 * Junta las dos mitades de lo que sabemos de alguien: lo que averiguamos
 * pagándole a un proveedor --sus números, y cómo fueron cambiando-- y lo que
 * aprendimos trabajando con él --campañas, plata--.
 *
 * La segunda mitad se LEE de las campañas, no se copia acá. Si se copiara,
 * tarde o temprano diría una cifra distinta a la de la pantalla de la campaña,
 * y entonces habría dos verdades sobre la misma plata.
 */
export default async function PerfilDeBasePage({ params }: { params: Promise<{ perfilId: string }> }) {
  const { perfilId } = await params
  const ctx = await requireContext()
  const t = await getTranslations('descubiertos')
  const tEtiqueta = await getTranslations('etiquetas')
  const idioma = await getLocale()

  const ficha = await loadPage(async () => {
    try {
      return await fichaDeBase(ctx, perfilId)
    } catch (error) {
      if (error instanceof NotFoundError) return null
      throw error
    }
  })
  if (!ficha) notFound()

  const { perfil, historialDeMetricas, campanas } = ficha
  /*
   * Cuando el primer y el último avistaje caen el mismo día, decir "entre el 27
   * y el 27" suena a error de cálculo: se comparan ya formateados.
   */
  const primerDia = formatDate(perfil.firstSeenAt, ctx.user.timezone, idioma)
  const ultimoDia = formatDate(perfil.lastSeenAt, ctx.user.timezone, idioma)
  const nombre = perfil.handle ? `@${perfil.handle}` : (perfil.displayName ?? t('perfilSinNombre'))

  return (
    <>
      <PageHeader
        title={nombre}
        description={perfil.displayName && perfil.handle ? perfil.displayName : undefined}
      />
      <div className="space-y-4 px-5 py-6 sm:px-8">
        <NavDeInfluencers ctx={ctx} activo="/influencers/descubiertos" />
        <Button asChild variant="ghost" size="sm">
          <Link href="/influencers/descubiertos">{t('volver')}</Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>{t('loQueSabemos')}</CardTitle>
            <CardDescription>
              {/*
                Cuando el primer y el último avistaje caen el mismo día, decir
                "entre el 27 y el 27" suena a error de cálculo.
              */}
              {t('vistoVeces', { cantidad: perfil.timesSeen })}
              {primerDia === ultimoDia
                ? t('vistoElDia', { fecha: ultimoDia })
                : t('vistoEntre', { desde: primerDia, hasta: ultimoDia })}
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={perfil.displayName ?? perfil.handle ?? nombre} src={perfil.profileImageUrl} size="lg" />
              <div>
                <p className="text-sm font-medium text-ink-900">{perfil.displayName ?? '—'}</p>
                {perfil.handle ? <p className="text-xs text-ink-600">@{perfil.handle}</p> : null}
              </div>
            </div>

            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Dato titulo={t('datoRed')} valor={platformLabel(tEtiqueta, perfil.platform)} />
              <Dato titulo={t('datoSeguidores')} valor={exacto(perfil.followers, idioma, t('sinDato'))} />
              <Dato titulo={t('datoEngagement')} valor={formatPercent(perfil.engagementRate, idioma)} />
              <Dato titulo={t('datoPais')} valor={perfil.country ?? t('noLoDice')} />
            </dl>

            {perfil.bio ? <p className="text-sm text-fg">{perfil.bio}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="secondary" size="sm">
                <a href={perfil.url} target="_blank" rel="noopener noreferrer nofollow">
                  {t('verElPerfil')}
                </a>
              </Button>
              {perfil.influencerId ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/influencers/${perfil.influencerId}`}>{t('fichaDelInfluencer')}</Link>
                </Button>
              ) : (
                <Badge tone="slate">{t('todaviaNoEnPadron')}</Badge>
              )}
            </div>

            {perfil.keywords.length > 0 ? (
              <Grupo titulo={t('grupoPalabras')} items={perfil.keywords} />
            ) : null}
            {perfil.interests.length > 0 ? <Grupo titulo={t('grupoIntereses')} items={perfil.interests} /> : null}
            <Grupo titulo={t('grupoProveedores')} items={perfil.providers} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('comoCambiaron')}</CardTitle>
            <CardDescription>{t('comoCambiaronBajada')}</CardDescription>
          </CardHeader>
          <CardBody className={historialDeMetricas.length > 0 ? 'p-0' : undefined}>
            {historialDeMetricas.length === 0 ? (
              <EmptyState
                title={t('sinHistoriaTitulo')}
                description={t('sinHistoriaBajada')}
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <Tr>
                      <Th>{t('colCuando')}</Th>
                      <Th className="text-right">{t('datoSeguidores')}</Th>
                      <Th className="text-right">{t('datoEngagement')}</Th>
                      <Th>{t('colQuienMidio')}</Th>
                    </Tr>
                  </thead>
                  <tbody>
                    {historialDeMetricas.map((m, indice) => {
                      const anterior = historialDeMetricas[indice - 1]
                      const delta =
                        anterior && anterior.followers !== null && m.followers !== null
                          ? m.followers - anterior.followers
                          : null
                      return (
                        <Tr key={`${m.seenAt.toISOString()}-${indice}`}>
                          <Td>{formatDate(m.seenAt, ctx.user.timezone, idioma)}</Td>
                          <Td className="text-right tabular-nums">
                            {exacto(m.followers, idioma, t('sinDato'))}
                            {delta !== null && delta !== 0 ? (
                              <span className={delta > 0 ? 'ml-2 text-xs text-green-600' : 'ml-2 text-xs text-red-600'}>
                                {delta > 0 ? '+' : ''}
                                {new Intl.NumberFormat(intlDe(idioma)).format(delta)}
                              </span>
                            ) : null}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatPercent(m.engagementRate)}
                          </Td>
                          <Td>{m.provider}</Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('historialDeTrabajo')}</CardTitle>
            <CardDescription>{t('historialDeTrabajoBajada')}</CardDescription>
          </CardHeader>
          <CardBody className={campanas.length > 0 ? 'p-0' : undefined}>
            {campanas.length === 0 ? (
              <EmptyState
                title={perfil.influencerId ? t('sinTrabajoTitulo') : t('todaviaNoEnPadron')}
                description={perfil.influencerId ? t('sinTrabajoBajada') : t('sinPadronBajada')}
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <Tr>
                      <Th>{t('colCampana')}</Th>
                      <Th>{t('colCliente')}</Th>
                      <Th>{t('colEstado')}</Th>
                      <Th>{t('colPublico')}</Th>
                      <Th className="text-right">{t('colPagado')}</Th>
                      <Th className="text-right">{t('colPendiente')}</Th>
                    </Tr>
                  </thead>
                  <tbody>
                    {campanas.map((c) => (
                      <Tr key={c.campaignId}>
                        <Td>
                          <Link href={`/campanas/${c.campaignId}`} className="font-medium hover:underline">
                            {c.campana}
                          </Link>
                        </Td>
                        <Td>{c.cliente}</Td>
                        <Td>{c.estado}</Td>
                        <Td>
                          {c.publicadoEl ? (
                            formatDate(c.publicadoEl, ctx.user.timezone, idioma)
                          ) : (
                            <span className="text-muted">{t('todaviaNo')}</span>
                          )}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {c.pagos.length === 0 ? (
                            <span className="text-muted">{t('sinMovimientos')}</span>
                          ) : (
                            c.pagos.map((p) => (
                              <div key={`${p.moneda}-pagado`}>{plata(p.pagado, p.moneda, idioma)}</div>
                            ))
                          )}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {c.pagos.map((p) => (
                            <div key={`${p.moneda}-pendiente`}>{plata(p.pendiente, p.moneda, idioma)}</div>
                          ))}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </CardBody>
        </Card>

        <InfoNote>{t('avisoMonedas')}</InfoNote>
      </div>
    </>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{titulo}</dt>
      <dd className="mt-1 text-sm font-medium text-fg tabular-nums">{valor}</dd>
    </div>
  )
}

function Grupo({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-muted">{titulo}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <Badge key={item} tone="slate">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  )
}
