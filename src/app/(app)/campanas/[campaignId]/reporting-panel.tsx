"use client"

import * as React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Archive, Copy, Link2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Field, Input, Select } from '@/components/ui/field'
import { Stat, StatStrip } from '@/components/ui/stat'
import { ConfirmButton } from '@/components/ui/confirm'
import { InfoNote } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { formatDate, formatFollowers } from '@/lib/util/format'
import type { ResumenDeResultados } from '@/lib/repos/reporting'
import {
  archivarLinkAction,
  borrarEntregaAction,
  crearLinkAction,
  guardarEntregaAction,
} from '../../actions/reporting'

/*
 * Formatos, estados y fuentes: acá viven los valores y su orden; el texto sale
 * de `tipo<X>`, `estado<X>` y `fuente<X>` en las traducciones.
 */
const TIPOS = [
  'STORY',
  'REEL',
  'POST',
  'TIKTOK',
  'VIDEO',
  'YOUTUBE_VIDEO',
  'LIVE',
  'OTHER',
] as const

const ESTADOS = [
  'PENDING',
  'IN_PRODUCTION',
  'FOR_APPROVAL',
  'APPROVED',
  'PUBLISHED',
  'CANCELLED',
] as const

const FUENTES = ['MANUAL', 'SCREENSHOT', 'PROVIDER'] as const

/**
 * Resultados de la campaña.
 *
 * Tres capas, de la más confiable a la menos: los clics de nuestros links --que
 * medimos nosotros--, las métricas de las redes --que carga una persona-- y lo
 * que todavía nadie cargó, que se declara en vez de esconderse.
 *
 * Ningún total se muestra sin decir sobre cuántas publicaciones se calculó.
 * "12.400 visualizaciones" cuando cinco publicaciones no cargaron nada es un
 * número que alguien va a defender en una reunión sin saber que está roto.
 */
export function ReportingPanel({
  resumen,
  campaignId,
  talento,
  puedeEditar,
}: {
  resumen: ResumenDeResultados
  campaignId: string
  talento: Array<{ candidacyId: string; nombre: string }>
  puedeEditar: boolean
}) {
  const t = useTranslations('resultados')
  const idioma = useLocale()
  const router = useRouter()
  const [pendiente, startTransition] = React.useTransition()
  const [abreEntrega, setAbreEntrega] = React.useState(false)
  const [abreLink, setAbreLink] = React.useState(false)
  const entregaRef = React.useRef<HTMLFormElement>(null)
  const linkRef = React.useRef<HTMLFormElement>(null)

  const sobre = (medicion: { con: number }) =>
    resumen.publicaciones.publicadas === 0
      ? t('sinPublicaciones')
      : t('sobreDe', { con: medicion.con, total: resumen.publicaciones.publicadas })

  function guardarEntrega(formData: FormData) {
    startTransition(async () => {
      const valor = (clave: string) => String(formData.get(clave) ?? '') || null
      const resultado = await guardarEntregaAction({
        campaignId,
        deliverableId: valor('deliverableId'),
        candidacyId: String(formData.get('candidacyId') ?? ''),
        type: (valor('type') ?? 'POST') as (typeof TIPOS)[number],
        status: (valor('status') ?? 'PUBLISHED') as (typeof ESTADOS)[number],
        description: valor('description'),
        url: valor('url'),
        publishedAt: valor('publishedAt'),
        views: valor('views'),
        likes: valor('likes'),
        comments: valor('comments'),
        shares: valor('shares'),
        saves: valor('saves'),
        reach: valor('reach'),
        metricsSource: (valor('metricsSource') ?? null) as (typeof FUENTES)[number] | null,
      }).catch(() => null)

      if (!resultado?.ok) {
        toast.error(resultado && !resultado.ok ? resultado.message : t('noSeGuardoEntrega'))
        return
      }
      toast.success(t('entregaGuardada'))
      entregaRef.current?.reset()
      setAbreEntrega(false)
      router.refresh()
    })
  }

  function crearLink(formData: FormData) {
    startTransition(async () => {
      const valor = (clave: string) => String(formData.get(clave) ?? '') || null
      const resultado = await crearLinkAction({
        campaignId,
        destination: String(formData.get('destination') ?? ''),
        label: valor('label'),
        candidacyId: valor('candidacyId'),
        source: String(formData.get('source') ?? 'instagram'),
        medium: String(formData.get('medium') ?? 'influencer'),
        campaign: String(formData.get('campaign') ?? ''),
        content: valor('content'),
        term: null,
      }).catch(() => null)

      if (!resultado?.ok) {
        toast.error(resultado && !resultado.ok ? resultado.message : t('noSeCreoLink'))
        return
      }
      toast.success(t('linkCreado'))
      linkRef.current?.reset()
      setAbreLink(false)
      router.refresh()
    })
  }

  function copiar(texto: string) {
    navigator.clipboard
      .writeText(texto)
      .then(() => toast.success(t('linkCopiado')))
      .catch(() => toast.error(t('noSeCopio')))
  }

  return (
    <div className="space-y-4">
      <StatStrip>
        <Stat
          label={t('statPublicaciones')}
          value={resumen.publicaciones.publicadas}
          hint={t('entregasCargadas', { cantidad: resumen.publicaciones.total })}
        />
        <Stat
          label={t('statViews')}
          value={resumen.views.con === 0 ? null : formatFollowers(resumen.views.total, idioma)}
          hint={sobre(resumen.views)}
          tone={resumen.views.sin > 0 ? 'warn' : undefined}
        />
        <Stat
          label={t('statInteracciones')}
          value={resumen.interacciones.con === 0 ? null : formatFollowers(resumen.interacciones.total, idioma)}
          hint={sobre(resumen.interacciones)}
        />
        <Stat
          label={t('statTasa')}
          value={resumen.tasaDeInteraccion === null ? null : `${resumen.tasaDeInteraccion.toFixed(2)}%`}
          hint={resumen.tasaDeInteraccion === null ? t('tasaSinDatos') : t('tasaSobreAmbas')}
        />
        <Stat
          label={t('statClics')}
          value={resumen.clics.links === 0 ? null : resumen.clics.total}
          tone="good"
          hint={
            resumen.clics.links === 0
              ? t('sinLinksMedidos')
              : t('clicsAyuda', { personas: resumen.clics.personas, bots: resumen.clics.bots })
          }
        />
      </StatStrip>

      {resumen.huecos.length > 0 ? (
        <InfoNote>
          <p className="font-medium">{t('huecosTitulo')}</p>
          <ul className="mt-1 list-inside list-disc">
            {resumen.huecos.map((hueco) => (
              <li key={hueco.clave}>{t(hueco.clave, hueco.valores)}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs">{t('huecosCierre')}</p>
        </InfoNote>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('linksMedidos')}</CardTitle>
          <p className="text-xs text-ink-500">{t('linksMedidosBajada')}</p>
        </CardHeader>
        <CardBody className="space-y-3">
          {puedeEditar ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setAbreLink((v) => !v)}>
                <Plus className="size-4" aria-hidden="true" />
                {abreLink ? t('cerrarFormulario') : t('crearLink')}
              </Button>
              {abreLink ? (
                <form ref={linkRef} action={crearLink} className="grid gap-3 rounded-lg border border-ink-200 p-4 sm:grid-cols-3">
                  <Field label={t('campoDestino')} htmlFor="destination" required className="sm:col-span-2" hint={t('destinoAyuda')}>
                    <Input id="destination" name="destination" placeholder="https://lamarca.com/producto" required />
                  </Field>
                  <Field label={t('campoParaQuien')} htmlFor="candidacyId" hint={t('paraQuienAyuda')}>
                    <Select id="candidacyId" name="candidacyId" defaultValue="">
                      <option value="">{t('todaLaCampana')}</option>
                      {talento.map((linea) => (
                        <option key={linea.candidacyId} value={linea.candidacyId}>
                          {linea.nombre}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="utm_source" htmlFor="source" required hint={t('utmSourceAyuda')}>
                    <Input id="source" name="source" defaultValue="instagram" required maxLength={60} />
                  </Field>
                  <Field label="utm_medium" htmlFor="medium" required hint={t('utmMediumAyuda')}>
                    <Input id="medium" name="medium" defaultValue="influencer" required maxLength={60} />
                  </Field>
                  <Field label="utm_campaign" htmlFor="campaign" required hint={t('utmCampaignAyuda')}>
                    <Input id="campaign" name="campaign" required maxLength={60} />
                  </Field>
                  <Field label="utm_content" htmlFor="content" hint={t('utmContentAyuda')}>
                    <Input id="content" name="content" maxLength={60} />
                  </Field>
                  <Field label={t('campoNombreInterno')} htmlFor="label" className="sm:col-span-2">
                    <Input id="label" name="label" placeholder={t('nombreInternoPista')} maxLength={120} />
                  </Field>
                  <div className="sm:col-span-3">
                    <Button type="submit" disabled={pendiente}>
                      {pendiente ? t('creando') : t('crearElLink')}
                    </Button>
                  </div>
                </form>
              ) : null}
            </>
          ) : null}

          {resumen.links.length === 0 ? (
            <p className="text-sm text-ink-500">{t('sinLinks')}</p>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>{t('colLink')}</Th>
                    <Th>{t('campoParaQuien')}</Th>
                    <Th className="text-right">{t('colClics')}</Th>
                    <Th className="text-right">{t('colVisitantes')}</Th>
                    <Th>{t('colUltimo')}</Th>
                    {puedeEditar ? <Th className="text-right">{t('colAcciones')}</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {resumen.links.map((link) => (
                    <Tr key={link.id}>
                      <Td>
                        <span className="flex items-center gap-2">
                          <code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">{link.url}</code>
                          <button
                            type="button"
                            onClick={() => copiar(link.url)}
                            className="text-ink-500 hover:text-ink-900"
                            aria-label={t('copiarLink')}
                          >
                            <Copy className="size-3.5" aria-hidden="true" />
                          </button>
                          {link.archived ? <Badge tone="slate">{t('archivado')}</Badge> : null}
                        </span>
                        <p className="mt-0.5 truncate text-xs text-ink-500">
                          {link.label ? `${link.label} · ` : ''}
                          {link.utm.source}/{link.utm.medium}/{link.utm.campaign}
                        </p>
                      </Td>
                      <Td className="text-sm text-ink-600">{link.quien ?? t('todaLaCampana')}</Td>
                      <Td className="text-right tabular-nums">{link.clics}</Td>
                      <Td className="text-right tabular-nums">{link.personas}</Td>
                      <Td className="whitespace-nowrap text-xs text-ink-600">
                        {link.ultimoClic ? formatDate(link.ultimoClic, undefined, idioma) : '—'}
                      </Td>
                      {puedeEditar ? (
                        <Td className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pendiente}
                            onClick={() =>
                              startTransition(async () => {
                                const r = await archivarLinkAction({
                                  linkId: link.id,
                                  campaignId,
                                  archivado: !link.archived,
                                }).catch(() => null)
                                if (!r?.ok) {
                                  toast.error(t('noSeArchivo'))
                                  return
                                }
                                router.refresh()
                              })
                            }
                          >
                            <Archive className="size-4" aria-hidden="true" />
                            {link.archived ? t('reactivar') : t('archivar')}
                          </Button>
                        </Td>
                      ) : null}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('publicaciones')}</CardTitle>
          <p className="text-xs text-ink-500">{t('publicacionesBajada')}</p>
        </CardHeader>
        <CardBody className="space-y-3">
          {puedeEditar ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setAbreEntrega((v) => !v)} disabled={talento.length === 0}>
                <Plus className="size-4" aria-hidden="true" />
                {abreEntrega ? t('cerrarFormulario') : t('cargarPublicacion')}
              </Button>
              {talento.length === 0 ? (
                <p className="text-xs text-ink-500">{t('primeroConfirmados')}</p>
              ) : null}

              {abreEntrega ? (
                <form ref={entregaRef} action={guardarEntrega} className="grid gap-3 rounded-lg border border-ink-200 p-4 sm:grid-cols-4">
                  <input type="hidden" name="deliverableId" value="" />
                  <Field label={t('campoQuien')} htmlFor="candidacyId2" required>
                    <Select id="candidacyId2" name="candidacyId" required>
                      {talento.map((linea) => (
                        <option key={linea.candidacyId} value={linea.candidacyId}>
                          {linea.nombre}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('campoFormato')} htmlFor="type" required>
                    <Select id="type" name="type" defaultValue="REEL" required>
                      {TIPOS.map((valor) => (
                        <option key={valor} value={valor}>
                          {t(`tipo${valor}`)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('campoEstado')} htmlFor="status" required>
                    <Select id="status" name="status" defaultValue="PUBLISHED" required>
                      {ESTADOS.map((valor) => (
                        <option key={valor} value={valor}>
                          {t(`estado${valor}`)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('campoCuando')} htmlFor="publishedAt">
                    <Input id="publishedAt" name="publishedAt" type="date" />
                  </Field>
                  <Field label={t('campoLinkPublicacion')} htmlFor="url" className="sm:col-span-4">
                    <Input id="url" name="url" placeholder="https://www.instagram.com/reel/…" maxLength={600} />
                  </Field>

                  <Field label={t('campoViews')} htmlFor="views">
                    <Input id="views" name="views" inputMode="numeric" />
                  </Field>
                  <Field label={t('campoAlcance')} htmlFor="reach">
                    <Input id="reach" name="reach" inputMode="numeric" />
                  </Field>
                  <Field label={t('campoMeGusta')} htmlFor="likes">
                    <Input id="likes" name="likes" inputMode="numeric" />
                  </Field>
                  <Field label={t('campoComentarios')} htmlFor="comments">
                    <Input id="comments" name="comments" inputMode="numeric" />
                  </Field>
                  <Field label={t('campoCompartidos')} htmlFor="shares">
                    <Input id="shares" name="shares" inputMode="numeric" />
                  </Field>
                  <Field label={t('campoGuardados')} htmlFor="saves">
                    <Input id="saves" name="saves" inputMode="numeric" />
                  </Field>
                  <Field
                    label={t('campoFuente')}
                    htmlFor="metricsSource"
                    className="sm:col-span-2"
                    hint={t('fuenteAyuda')}
                  >
                    <Select id="metricsSource" name="metricsSource" defaultValue="MANUAL">
                      {FUENTES.map((valor) => (
                        <option key={valor} value={valor}>
                          {t(`fuente${valor}`)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="sm:col-span-4">
                    <Button type="submit" disabled={pendiente}>
                      {pendiente ? t('guardando') : t('guardarPublicacion')}
                    </Button>
                  </div>
                </form>
              ) : null}
            </>
          ) : null}

          {resumen.entregas.length === 0 ? (
            <p className="text-sm text-ink-500">{t('sinEntregas')}</p>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>{t('colQuien')}</Th>
                    <Th>{t('colFormato')}</Th>
                    <Th>{t('colEstado')}</Th>
                    <Th className="text-right">{t('colViews')}</Th>
                    <Th className="text-right">{t('colInteracciones')}</Th>
                    <Th>{t('colFuente')}</Th>
                    <Th>{t('colLink')}</Th>
                    {puedeEditar ? <Th className="text-right">{t('colAcciones')}</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {resumen.entregas.map((entrega) => {
                    const interacciones =
                      entrega.metricas.likes === null &&
                      entrega.metricas.comments === null &&
                      entrega.metricas.shares === null &&
                      entrega.metricas.saves === null
                        ? null
                        : (entrega.metricas.likes ?? 0) +
                          (entrega.metricas.comments ?? 0) +
                          (entrega.metricas.shares ?? 0) +
                          (entrega.metricas.saves ?? 0)
                    return (
                      <Tr key={entrega.id}>
                        <Td className="font-medium text-ink-900">{entrega.quien}</Td>
                        <Td className="text-sm text-ink-600">{t(`tipo${entrega.type}`)}</Td>
                        <Td>
                          <Badge tone={entrega.status === 'PUBLISHED' ? 'emerald' : 'slate'}>
                            {t(`estado${entrega.status}`)}
                          </Badge>
                        </Td>
                        <Td className="text-right tabular-nums">
                          {entrega.metricas.views === null ? (
                            <span className="text-ink-400">{t('sinCargar')}</span>
                          ) : (
                            formatFollowers(entrega.metricas.views, idioma)
                          )}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {interacciones === null ? (
                            <span className="text-ink-400">{t('sinCargar')}</span>
                          ) : (
                            formatFollowers(interacciones, idioma)
                          )}
                        </Td>
                        <Td className="text-xs text-ink-600">
                          {entrega.metricsSource ? t(`fuente${entrega.metricsSource}`) : '—'}
                        </Td>
                        <Td className="text-xs">
                          {entrega.url ? (
                            <a
                              href={entrega.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 text-brand-700 underline underline-offset-4"
                            >
                              <Link2 className="size-3.5" aria-hidden="true" />
                              {t('ver')}
                            </a>
                          ) : (
                            <span className="text-ink-400">{t('sinLink')}</span>
                          )}
                        </Td>
                        {puedeEditar ? (
                          <Td className="text-right">
                            <ConfirmButton
                              title={t('borrarTitulo')}
                              description={t('borrarBajada')}
                              confirmLabel={t('borrar')}
                              pending={pendiente}
                              onConfirm={() =>
                                startTransition(async () => {
                                  const r = await borrarEntregaAction({
                                    deliverableId: entrega.id,
                                    campaignId,
                                  }).catch(() => null)
                                  if (!r?.ok) {
                                    toast.error(t('noSeBorro'))
                                    return
                                  }
                                  toast.success(t('publicacionBorrada'))
                                  router.refresh()
                                })
                              }
                            >
                              <Button size="sm" variant="ghost" disabled={pendiente}>
                                <Trash2 className="size-4" aria-hidden="true" />
                                <span className="sr-only">{t('borrar')}</span>
                              </Button>
                            </ConfirmButton>
                          </Td>
                        ) : null}
                      </Tr>
                    )
                  })}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardBody>
      </Card>

      <InfoNote>{t.rich('avisoReporteIa', { b: (texto) => <strong>{texto}</strong> })}</InfoNote>
    </div>
  )
}
