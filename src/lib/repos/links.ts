import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { NotFoundError, ValidationError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import { env } from '@/lib/env'
import { withSystemScope } from '@/lib/db/scope'
import { construirDestino, generarSlug, hostDe, normalizarUtm, pareceBot, type Utms } from '@/lib/domain/utm'
import { actorOf, scoped } from './base'

export type LinkDto = {
  id: string
  slug: string
  url: string
  destination: string
  label: string | null
  utm: { source: string; medium: string; campaign: string; content: string | null; term: string | null }
  candidacyId: string | null
  quien: string | null
  archived: boolean
  clics: number
  /** Clics de personas distintas, contadas por día. */
  personas: number
  bots: number
  ultimoClic: string | null
  createdAt: string
}

const urlPublica = (slug: string): string => `${env().APP_URL.replace(/\/$/, '')}/r/${slug}`

export async function listarLinks(ctx: AuthContext, campaignId: string): Promise<LinkDto[]> {
  // Alcance y consulta en la misma transacción: ver la nota en `entregas.ts`.
  return scoped(ctx, async (tx) => {
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true } })
    if (!campaign) throw new NotFoundError()
    assertClientInScope(ctx, campaign.clientId)
    assertCan(ctx, 'campaign.view', campaign.clientId)

    const links = await tx.trackedLink.findMany({
      where: { campaignId },
      orderBy: [{ archived: 'asc' }, { createdAt: 'desc' }],
      include: { candidacy: { select: { influencer: { select: { displayName: true } } } } },
    })
    if (links.length === 0) return []

    const ids = links.map((link) => link.id)

    /*
     * Los clics se cuentan en la base, no en memoria.
     *
     * La primera versión traía TODAS las filas de clics para contarlas acá. Con
     * cien clics no se nota; con cien mil es una pantalla que no carga -- y el
     * éxito de una campaña es justamente lo que hace crecer esa tabla. El
     * agrupado por (link, bot) da los totales, y el agrupado por
     * (link, visitante) devuelve una fila por visitante distinto, que es lo que
     * hace falta contar y es mucho más chico que el total de clics.
     */
    const [totales, porVisitante, ultimos] = await Promise.all([
      tx.linkClick.groupBy({ by: ['linkId', 'bot'], where: { linkId: { in: ids } }, _count: { _all: true } }),
      tx.linkClick.groupBy({
        by: ['linkId', 'visitorHash'],
        where: { linkId: { in: ids }, bot: false },
      }),
      tx.linkClick.groupBy({ by: ['linkId'], where: { linkId: { in: ids }, bot: false }, _max: { at: true } }),
    ])

    const humanosPorLink = new Map<string, number>()
    const botsPorLink = new Map<string, number>()
    for (const fila of totales) {
      const destino = fila.bot ? botsPorLink : humanosPorLink
      destino.set(fila.linkId, (destino.get(fila.linkId) ?? 0) + fila._count._all)
    }

    /*
     * "Personas" no es "visitantes únicos para siempre": el hash cambia todos
     * los días a propósito, así que lo que se cuenta son visitantes distintos
     * por día. Es menos preciso y es la única forma honesta de contarlo sin
     * seguir a nadie en el tiempo.
     */
    const personasPorLink = new Map<string, number>()
    for (const fila of porVisitante) {
      personasPorLink.set(fila.linkId, (personasPorLink.get(fila.linkId) ?? 0) + 1)
    }

    const ultimoPorLink = new Map<string, Date | null>()
    for (const fila of ultimos) ultimoPorLink.set(fila.linkId, fila._max.at)

    return links.map((link) => {
      const humanos = humanosPorLink.get(link.id) ?? 0
      const ultimo = ultimoPorLink.get(link.id) ?? null

      return {
        id: link.id,
        slug: link.slug,
        url: urlPublica(link.slug),
        destination: link.destination,
        label: link.label,
        utm: {
          source: link.utmSource,
          medium: link.utmMedium,
          campaign: link.utmCampaign,
          content: link.utmContent,
          term: link.utmTerm,
        },
        candidacyId: link.candidacyId,
        quien: link.candidacy?.influencer.displayName ?? null,
        archived: link.archived,
        clics: humanos,
        personas: personasPorLink.get(link.id) ?? 0,
        bots: botsPorLink.get(link.id) ?? 0,
        ultimoClic: ultimo?.toISOString() ?? null,
        createdAt: link.createdAt.toISOString(),
      }
    })
  })
}

export type CrearLinkInput = {
  destination: string
  label: string | null
  candidacyId: string | null
  utm: Utms
}

export async function crearLink(
  ctx: AuthContext,
  campaignId: string,
  input: CrearLinkInput,
): Promise<{ id: string; url: string }> {
  const campaign = await scoped(ctx, (tx) =>
    tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true } }),
  )
  if (!campaign) throw new NotFoundError()
  assertClientInScope(ctx, campaign.clientId)
  assertCan(ctx, 'campaign.update', campaign.clientId)

  const utm: Utms = {
    source: normalizarUtm(input.utm.source),
    medium: normalizarUtm(input.utm.medium),
    campaign: normalizarUtm(input.utm.campaign),
    content: input.utm.content ? normalizarUtm(input.utm.content) : null,
    term: input.utm.term ? normalizarUtm(input.utm.term) : null,
  }
  if (!utm.source || !utm.medium || !utm.campaign) {
    throw new ValidationError('Fuente, medio y campaña no pueden quedar vacíos.')
  }

  const destination = construirDestino(input.destination, utm)

  if (input.candidacyId) {
    const pertenece = await scoped(ctx, (tx) =>
      tx.candidacy.findFirst({ where: { id: input.candidacyId!, campaignId }, select: { id: true } }),
    )
    if (!pertenece) throw new ValidationError('Ese perfil no está en esta campaña.')
  }

  return scoped(ctx, async (tx) => {
    // Reintenta ante una colisión de slug en vez de fallarle al usuario por un
    // choque de azar que se resuelve solo.
    for (let intento = 0; intento < 5; intento += 1) {
      const slug = generarSlug(randomBytes(7))
      const existe = await tx.trackedLink.findUnique({ where: { slug }, select: { id: true } })
      if (existe) continue

      const creado = await tx.trackedLink.create({
        data: {
          clientId: campaign.clientId,
          campaignId,
          candidacyId: input.candidacyId,
          slug,
          destination,
          utmSource: utm.source,
          utmMedium: utm.medium,
          utmCampaign: utm.campaign,
          utmContent: utm.content ?? null,
          utmTerm: utm.term ?? null,
          label: input.label,
          createdById: ctx.user.id,
        },
      })
      await recordAudit(tx, actorOf(ctx), {
        action: AUDIT.LINK_CREATED,
        entityType: 'TrackedLink',
        entityId: creado.id,
        clientId: campaign.clientId,
        after: { slug, destino: destination },
      })
      return { id: creado.id, url: urlPublica(slug) }
    }
    throw new ValidationError('No se pudo generar un link. Probá de nuevo.')
  })
}

export async function archivarLink(ctx: AuthContext, linkId: string, archivado: boolean): Promise<void> {
  const link = await scoped(ctx, (tx) =>
    tx.trackedLink.findUnique({ where: { id: linkId }, select: { clientId: true, slug: true } }),
  )
  if (!link) throw new NotFoundError()
  assertClientInScope(ctx, link.clientId)
  assertCan(ctx, 'campaign.update', link.clientId)

  await scoped(ctx, async (tx) => {
    await tx.trackedLink.update({ where: { id: linkId }, data: { archived: archivado } })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.LINK_ARCHIVED,
      entityType: 'TrackedLink',
      entityId: linkId,
      clientId: link.clientId,
      after: { archivado },
    })
  })
}

// ── El clic ─────────────────────────────────────────────────────────────────

/**
 * Resuelve un slug y anota el clic.
 *
 * Corre SIN sesión: quien toca el link es alguien de internet, no un usuario de
 * la plataforma. Por eso va con alcance de sistema y por eso lo único que se
 * hace acá es leer un link y escribir un clic -- nada más.
 *
 * Si anotar el clic falla, la persona igual llega a destino. Perder una medición
 * es molesto; dejar a alguien colgado en una pantalla de error por culpa de
 * nuestra estadística es inaceptable, y encima el influencer se lleva la culpa.
 */
export async function registrarClic(input: {
  slug: string
  ip: string | null
  userAgent: string | null
  referer: string | null
  country: string | null
}): Promise<string | null> {
  const link = await withSystemScope((tx) =>
    tx.trackedLink.findUnique({
      where: { slug: input.slug },
      select: { id: true, clientId: true, destination: true, archived: true },
    }),
  ).catch(() => null)

  if (!link || link.archived) return null

  const bot = pareceBot(input.userAgent)
  const visitorHash = hashDeVisitante(input.ip, input.userAgent)

  await withSystemScope((tx) =>
    tx.linkClick.create({
      data: {
        linkId: link.id,
        clientId: link.clientId,
        visitorHash,
        referrerHost: hostDe(input.referer),
        country: input.country?.slice(0, 2) ?? null,
        bot,
      },
    }),
  ).catch(() => undefined)

  return link.destination
}

/**
 * Hash del visitante, con sal que cambia cada día.
 *
 * La IP nunca se escribe. Y como la sal rota, el mismo visitante es otro hash
 * mañana: alcanza para no contarlo diez veces en una tarde, y no alcanza para
 * seguirlo en el tiempo. Esa limitación es el punto, no una carencia.
 */
function hashDeVisitante(ip: string | null, userAgent: string | null): string {
  const dia = new Date().toISOString().slice(0, 10)
  return createHash('sha256')
    .update(`${env().SESSION_SECRET}|${dia}|${ip ?? 'sin-ip'}|${userAgent ?? 'sin-ua'}`)
    .digest('hex')
    .slice(0, 32)
}
