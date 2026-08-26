"use client"

import * as React from 'react'
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

const TIPOS = {
  STORY: 'Historia',
  REEL: 'Reel',
  POST: 'Posteo',
  TIKTOK: 'TikTok',
  VIDEO: 'Video',
  YOUTUBE_VIDEO: 'Video de YouTube',
  LIVE: 'Vivo',
  OTHER: 'Otro',
} as const

const ESTADOS = {
  PENDING: 'Pendiente',
  IN_PRODUCTION: 'En producción',
  FOR_APPROVAL: 'Para aprobar',
  APPROVED: 'Aprobada',
  PUBLISHED: 'Publicada',
  CANCELLED: 'Cancelada',
} as const

const FUENTES = {
  MANUAL: 'Copiado de la app',
  SCREENSHOT: 'Captura del influencer',
  PROVIDER: 'Proveedor de datos',
} as const

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
  const router = useRouter()
  const [pendiente, startTransition] = React.useTransition()
  const [abreEntrega, setAbreEntrega] = React.useState(false)
  const [abreLink, setAbreLink] = React.useState(false)
  const entregaRef = React.useRef<HTMLFormElement>(null)
  const linkRef = React.useRef<HTMLFormElement>(null)

  const sobre = (medicion: { con: number }) =>
    resumen.publicaciones.publicadas === 0
      ? 'sin publicaciones cargadas'
      : `sobre ${medicion.con} de ${resumen.publicaciones.publicadas}`

  function guardarEntrega(formData: FormData) {
    startTransition(async () => {
      const valor = (clave: string) => String(formData.get(clave) ?? '') || null
      const resultado = await guardarEntregaAction({
        campaignId,
        deliverableId: valor('deliverableId'),
        candidacyId: String(formData.get('candidacyId') ?? ''),
        type: (valor('type') ?? 'POST') as keyof typeof TIPOS,
        status: (valor('status') ?? 'PUBLISHED') as keyof typeof ESTADOS,
        description: valor('description'),
        url: valor('url'),
        publishedAt: valor('publishedAt'),
        views: valor('views'),
        likes: valor('likes'),
        comments: valor('comments'),
        shares: valor('shares'),
        saves: valor('saves'),
        reach: valor('reach'),
        metricsSource: (valor('metricsSource') ?? null) as keyof typeof FUENTES | null,
      }).catch(() => null)

      if (!resultado?.ok) {
        toast.error(resultado && !resultado.ok ? resultado.message : 'No se pudo guardar la entrega.')
        return
      }
      toast.success('Entrega guardada.')
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
        toast.error(resultado && !resultado.ok ? resultado.message : 'No se pudo crear el link.')
        return
      }
      toast.success('Link creado. Copiálo y pasáselo al influencer.')
      linkRef.current?.reset()
      setAbreLink(false)
      router.refresh()
    })
  }

  function copiar(texto: string) {
    navigator.clipboard
      .writeText(texto)
      .then(() => toast.success('Link copiado.'))
      .catch(() => toast.error('No se pudo copiar. Seleccionálo a mano.'))
  }

  return (
    <div className="space-y-4">
      <StatStrip>
        <Stat
          label="Publicaciones"
          value={resumen.publicaciones.publicadas}
          hint={`${resumen.publicaciones.total} entregas cargadas`}
        />
        <Stat
          label="Visualizaciones"
          value={resumen.views.con === 0 ? null : formatFollowers(resumen.views.total)}
          hint={sobre(resumen.views)}
          tone={resumen.views.sin > 0 ? 'warn' : undefined}
        />
        <Stat
          label="Interacciones"
          value={resumen.interacciones.con === 0 ? null : formatFollowers(resumen.interacciones.total)}
          hint={sobre(resumen.interacciones)}
        />
        <Stat
          label="Tasa de interacción"
          value={resumen.tasaDeInteraccion === null ? null : `${resumen.tasaDeInteraccion.toFixed(2)}%`}
          hint={resumen.tasaDeInteraccion === null ? 'faltan datos para calcularla' : 'sobre las que tienen ambas'}
        />
        <Stat
          label="Clics medidos"
          value={resumen.clics.links === 0 ? null : resumen.clics.total}
          tone="good"
          hint={
            resumen.clics.links === 0
              ? 'sin links medidos'
              : `${resumen.clics.personas} visitantes · ${resumen.clics.bots} bots descartados`
          }
        />
      </StatStrip>

      {resumen.huecos.length > 0 ? (
        <InfoNote>
          <p className="font-medium">Lo que todavía nadie cargó</p>
          <ul className="mt-1 list-inside list-disc">
            {resumen.huecos.map((hueco) => (
              <li key={hueco}>{hueco}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs">
            Nada de esto se cuenta como cero. Los totales de arriba son sobre lo que sí está cargado, y el reporte con
            IA lo va a decir igual.
          </p>
        </InfoNote>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Links medidos</CardTitle>
          <p className="text-xs text-ink-500">
            El link pasa por nosotros antes de llegar al sitio del cliente, así que el clic es un hecho y no algo que
            nos cuenten. No identifica personas: se cuenta visitantes distintos por día y la dirección IP nunca se
            guarda.
          </p>
        </CardHeader>
        <CardBody className="space-y-3">
          {puedeEditar ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setAbreLink((v) => !v)}>
                <Plus className="size-4" aria-hidden="true" />
                {abreLink ? 'Cerrar' : 'Crear un link'}
              </Button>
              {abreLink ? (
                <form ref={linkRef} action={crearLink} className="grid gap-3 rounded-lg border border-ink-200 p-4 sm:grid-cols-3">
                  <Field label="A dónde lleva" htmlFor="destination" required className="sm:col-span-2" hint="La dirección completa, con https://">
                    <Input id="destination" name="destination" placeholder="https://lamarca.com/producto" required />
                  </Field>
                  <Field label="Para quién" htmlFor="candidacyId" hint="Opcional: para medir por influencer.">
                    <Select id="candidacyId" name="candidacyId" defaultValue="">
                      <option value="">Toda la campaña</option>
                      {talento.map((linea) => (
                        <option key={linea.candidacyId} value={linea.candidacyId}>
                          {linea.nombre}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="utm_source" htmlFor="source" required hint="De dónde viene: instagram, tiktok…">
                    <Input id="source" name="source" defaultValue="instagram" required maxLength={60} />
                  </Field>
                  <Field label="utm_medium" htmlFor="medium" required hint="Qué tipo de tráfico es.">
                    <Input id="medium" name="medium" defaultValue="influencer" required maxLength={60} />
                  </Field>
                  <Field label="utm_campaign" htmlFor="campaign" required hint="Cómo se llama esta campaña en la analítica del cliente.">
                    <Input id="campaign" name="campaign" required maxLength={60} />
                  </Field>
                  <Field label="utm_content" htmlFor="content" hint="Para distinguir dos links de la misma campaña.">
                    <Input id="content" name="content" maxLength={60} />
                  </Field>
                  <Field label="Nombre interno" htmlFor="label" className="sm:col-span-2">
                    <Input id="label" name="label" placeholder="Historia del 12" maxLength={120} />
                  </Field>
                  <div className="sm:col-span-3">
                    <Button type="submit" disabled={pendiente}>
                      {pendiente ? 'Creando…' : 'Crear el link'}
                    </Button>
                  </div>
                </form>
              ) : null}
            </>
          ) : null}

          {resumen.links.length === 0 ? (
            <p className="text-sm text-ink-500">
              Todavía no hay links medidos. Sin ellos no se puede saber cuánta gente fue del posteo al sitio.
            </p>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Link</Th>
                    <Th>Para quién</Th>
                    <Th className="text-right">Clics</Th>
                    <Th className="text-right">Visitantes</Th>
                    <Th>Último</Th>
                    {puedeEditar ? <Th className="text-right">Acciones</Th> : null}
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
                            aria-label="Copiar el link"
                          >
                            <Copy className="size-3.5" aria-hidden="true" />
                          </button>
                          {link.archived ? <Badge tone="slate">Archivado</Badge> : null}
                        </span>
                        <p className="mt-0.5 truncate text-xs text-ink-500">
                          {link.label ? `${link.label} · ` : ''}
                          {link.utm.source}/{link.utm.medium}/{link.utm.campaign}
                        </p>
                      </Td>
                      <Td className="text-sm text-ink-600">{link.quien ?? 'Toda la campaña'}</Td>
                      <Td className="text-right tabular-nums">{link.clics}</Td>
                      <Td className="text-right tabular-nums">{link.personas}</Td>
                      <Td className="whitespace-nowrap text-xs text-ink-600">
                        {link.ultimoClic ? formatDate(link.ultimoClic) : '—'}
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
                                  toast.error('No se pudo archivar.')
                                  return
                                }
                                router.refresh()
                              })
                            }
                          >
                            <Archive className="size-4" aria-hidden="true" />
                            {link.archived ? 'Reactivar' : 'Archivar'}
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
          <CardTitle>Publicaciones</CardTitle>
          <p className="text-xs text-ink-500">
            Qué publicó cada uno y qué midió. Dejá vacío lo que no sepas: un campo vacío significa «nadie lo cargó», y
            eso es distinto de cero.
          </p>
        </CardHeader>
        <CardBody className="space-y-3">
          {puedeEditar ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setAbreEntrega((v) => !v)} disabled={talento.length === 0}>
                <Plus className="size-4" aria-hidden="true" />
                {abreEntrega ? 'Cerrar' : 'Cargar una publicación'}
              </Button>
              {talento.length === 0 ? (
                <p className="text-xs text-ink-500">
                  Primero tiene que haber perfiles confirmados en la campaña.
                </p>
              ) : null}

              {abreEntrega ? (
                <form ref={entregaRef} action={guardarEntrega} className="grid gap-3 rounded-lg border border-ink-200 p-4 sm:grid-cols-4">
                  <input type="hidden" name="deliverableId" value="" />
                  <Field label="Quién" htmlFor="candidacyId2" required>
                    <Select id="candidacyId2" name="candidacyId" required>
                      {talento.map((linea) => (
                        <option key={linea.candidacyId} value={linea.candidacyId}>
                          {linea.nombre}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Formato" htmlFor="type" required>
                    <Select id="type" name="type" defaultValue="REEL" required>
                      {Object.entries(TIPOS).map(([valor, etiqueta]) => (
                        <option key={valor} value={valor}>
                          {etiqueta}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Estado" htmlFor="status" required>
                    <Select id="status" name="status" defaultValue="PUBLISHED" required>
                      {Object.entries(ESTADOS).map(([valor, etiqueta]) => (
                        <option key={valor} value={valor}>
                          {etiqueta}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Cuándo se publicó" htmlFor="publishedAt">
                    <Input id="publishedAt" name="publishedAt" type="date" />
                  </Field>
                  <Field label="Link de la publicación" htmlFor="url" className="sm:col-span-4">
                    <Input id="url" name="url" placeholder="https://www.instagram.com/reel/…" maxLength={600} />
                  </Field>

                  <Field label="Visualizaciones" htmlFor="views">
                    <Input id="views" name="views" inputMode="numeric" />
                  </Field>
                  <Field label="Alcance" htmlFor="reach">
                    <Input id="reach" name="reach" inputMode="numeric" />
                  </Field>
                  <Field label="Me gusta" htmlFor="likes">
                    <Input id="likes" name="likes" inputMode="numeric" />
                  </Field>
                  <Field label="Comentarios" htmlFor="comments">
                    <Input id="comments" name="comments" inputMode="numeric" />
                  </Field>
                  <Field label="Compartidos" htmlFor="shares">
                    <Input id="shares" name="shares" inputMode="numeric" />
                  </Field>
                  <Field label="Guardados" htmlFor="saves">
                    <Input id="saves" name="saves" inputMode="numeric" />
                  </Field>
                  <Field
                    label="De dónde salieron"
                    htmlFor="metricsSource"
                    className="sm:col-span-2"
                    hint="Obligatorio si cargás algún número: en tres meses nadie se acuerda."
                  >
                    <Select id="metricsSource" name="metricsSource" defaultValue="MANUAL">
                      {Object.entries(FUENTES).map(([valor, etiqueta]) => (
                        <option key={valor} value={valor}>
                          {etiqueta}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="sm:col-span-4">
                    <Button type="submit" disabled={pendiente}>
                      {pendiente ? 'Guardando…' : 'Guardar la publicación'}
                    </Button>
                  </div>
                </form>
              ) : null}
            </>
          ) : null}

          {resumen.entregas.length === 0 ? (
            <p className="text-sm text-ink-500">
              Todavía no se cargó ninguna publicación. Hasta que las haya, no hay resultados que reportar.
            </p>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Quién</Th>
                    <Th>Formato</Th>
                    <Th>Estado</Th>
                    <Th className="text-right">Visualiz.</Th>
                    <Th className="text-right">Interacciones</Th>
                    <Th>Fuente</Th>
                    <Th>Link</Th>
                    {puedeEditar ? <Th className="text-right">Acciones</Th> : null}
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
                        <Td className="text-sm text-ink-600">{TIPOS[entrega.type]}</Td>
                        <Td>
                          <Badge tone={entrega.status === 'PUBLISHED' ? 'emerald' : 'slate'}>
                            {ESTADOS[entrega.status]}
                          </Badge>
                        </Td>
                        <Td className="text-right tabular-nums">
                          {entrega.metricas.views === null ? (
                            <span className="text-ink-400">sin cargar</span>
                          ) : (
                            formatFollowers(entrega.metricas.views)
                          )}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {interacciones === null ? (
                            <span className="text-ink-400">sin cargar</span>
                          ) : (
                            formatFollowers(interacciones)
                          )}
                        </Td>
                        <Td className="text-xs text-ink-600">
                          {entrega.metricsSource ? FUENTES[entrega.metricsSource] : '—'}
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
                              ver
                            </a>
                          ) : (
                            <span className="text-ink-400">sin link</span>
                          )}
                        </Td>
                        {puedeEditar ? (
                          <Td className="text-right">
                            <ConfirmButton
                              title="Borrar la publicación"
                              description="Se pierden las métricas cargadas para esta entrega. Si la publicación se dio de baja, marcala como cancelada en vez de borrarla."
                              confirmLabel="Borrar"
                              pending={pendiente}
                              onConfirm={() =>
                                startTransition(async () => {
                                  const r = await borrarEntregaAction({
                                    deliverableId: entrega.id,
                                    campaignId,
                                  }).catch(() => null)
                                  if (!r?.ok) {
                                    toast.error('No se pudo borrar.')
                                    return
                                  }
                                  toast.success('Publicación borrada.')
                                  router.refresh()
                                })
                              }
                            >
                              <Button size="sm" variant="ghost" disabled={pendiente}>
                                <Trash2 className="size-4" aria-hidden="true" />
                                <span className="sr-only">Borrar</span>
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

      <InfoNote>
        El reporte escrito con IA vive en <strong>Análisis IA</strong> y ahora usa todo esto: los clics medidos, las
        métricas cargadas y, sobre todo, lo que falta. No calcula conversiones porque nadie las cargó todavía.
      </InfoNote>
    </div>
  )
}
