import 'server-only'
import type { Platform } from '@/generated/prisma/enums'
import type { AuthContext } from '@/lib/authz/context'
import { NotFoundError } from '@/lib/authz/errors'
import { assertCan } from '@/lib/authz/context'
import { AUDIT, recordAudit } from '@/lib/audit'
import { actorOf, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, scoped, type Paginated } from './base'
import type { Tx } from '@/lib/db/scope'

/**
 * La base de conocimiento de la agencia.
 *
 * Cada búsqueda que se paga deja acá lo que encontró. La diferencia con los
 * resultados de una corrida es el alcance: aquéllos son el recibo de UNA
 * búsqueda para UN cliente, y esto es lo que la agencia sabe, acumulado.
 *
 * El objetivo declarado: **cada consulta que se paga tiene que valer más de una
 * vez**. Con el tiempo, buscar acá adentro reemplaza buena parte de lo que hoy
 * se le pregunta --y se le paga-- a un proveedor.
 *
 * Es sólo para la agencia. No tiene `clientId` porque un perfil de Instagram no
 * le pertenece a ningún cliente, y la base lo hace cumplir con una política
 * propia: entra la agencia o no entra nadie.
 */

/** Para un usuario de cliente esta base directamente no existe. */
function assertAgencyOnly(ctx: AuthContext): void {
  if (ctx.side !== 'AGENCY') throw new NotFoundError()
}

// ── Alimentar ────────────────────────────────────────────────────────────────

export type HallazgoParaGuardar = {
  platform: Platform
  url: string
  urlNormalized: string
  handle: string | null
  displayName: string | null
  followers: number | null
  engagementRate: number | null
  country: string | null
  bio: string | null
  profileImageUrl?: string | null
  interests?: string[]
}

/**
 * Guarda lo que trajo una búsqueda.
 *
 * Se llama desde el mismo lugar donde se guardan los resultados de la corrida,
 * dentro de su transacción: si la corrida se registra, la base aprende. No hay
 * un camino por el que se pague una búsqueda y no quede nada.
 *
 * Tres reglas de acumulación, y las tres son la misma idea --no perder lo que
 * ya sabíamos--:
 *
 * 1. **Un dato nuevo nunca pisa uno viejo con vacío.** Si esta corrida no trae
 *    país y la anterior sí, queda el de antes. Un proveedor que no informa algo
 *    no está diciendo que no exista.
 * 2. **Las palabras y los proveedores se suman**, no se reemplazan. Así el
 *    perfil se vuelve encontrable por todos los temas con los que apareció.
 * 3. **El número que cambió se archiva.** Con el tiempo eso contesta gratis si
 *    un creador crece o cae, que hoy habría que pagarlo.
 */
export async function registrarHallazgos(
  tx: Tx,
  entrada: { provider: string; keywords: string[]; hallazgos: HallazgoParaGuardar[] },
): Promise<{ nuevos: number; actualizados: number }> {
  const palabras = normalizarPalabras(entrada.keywords)
  let nuevos = 0
  let actualizados = 0

  for (const h of entrada.hallazgos) {
    const existente = await tx.discoveredProfile.findUnique({
      where: { platform_urlNormalized: { platform: h.platform, urlNormalized: h.urlNormalized } },
      select: {
        id: true,
        followers: true,
        engagementRate: true,
        keywords: true,
        interests: true,
        providers: true,
      },
    })

    const intereses = normalizarPalabras(h.interests ?? [])

    if (!existente) {
      const creado = await tx.discoveredProfile.create({
        data: {
          platform: h.platform,
          url: h.url,
          urlNormalized: h.urlNormalized,
          handle: h.handle,
          displayName: h.displayName,
          followers: h.followers,
          engagementRate: h.engagementRate === null ? null : String(h.engagementRate),
          country: h.country,
          bio: h.bio,
          profileImageUrl: h.profileImageUrl ?? null,
          keywords: palabras,
          interests: intereses,
          providers: [entrada.provider],
        },
        select: { id: true },
      })
      if (h.followers !== null || h.engagementRate !== null) {
        await tx.discoveredProfileMetric.create({
          data: {
            profileId: creado.id,
            followers: h.followers,
            engagementRate: h.engagementRate === null ? null : String(h.engagementRate),
            provider: entrada.provider,
          },
        })
      }
      nuevos += 1
      continue
    }

    const seguidoresAntes = existente.followers
    const erAntes = existente.engagementRate === null ? null : Number(existente.engagementRate)
    const cambio =
      (h.followers !== null && h.followers !== seguidoresAntes) ||
      (h.engagementRate !== null && h.engagementRate !== erAntes)

    await tx.discoveredProfile.update({
      where: { id: existente.id },
      data: {
        // `?? undefined` es la regla 1: sin dato nuevo, no se toca el viejo.
        handle: h.handle ?? undefined,
        displayName: h.displayName ?? undefined,
        followers: h.followers ?? undefined,
        engagementRate: h.engagementRate === null ? undefined : String(h.engagementRate),
        country: h.country ?? undefined,
        bio: h.bio ?? undefined,
        profileImageUrl: h.profileImageUrl ?? undefined,
        keywords: unir(existente.keywords, palabras),
        interests: unir(existente.interests, intereses),
        providers: unir(existente.providers, [entrada.provider]),
        timesSeen: { increment: 1 },
        lastSeenAt: new Date(),
      },
    })

    if (cambio) {
      await tx.discoveredProfileMetric.create({
        data: {
          profileId: existente.id,
          followers: h.followers,
          engagementRate: h.engagementRate === null ? null : String(h.engagementRate),
          provider: entrada.provider,
        },
      })
    }
    actualizados += 1
  }

  return { nuevos, actualizados }
}

/**
 * Ata un perfil de la base al influencer del padrón.
 *
 * Es el puente por el que la ficha muestra campañas y pagos sin copiarlos: lo
 * que se ve ahí se lee de las campañas de verdad, así que no puede quedar
 * desactualizado ni contradecir a la pantalla de la campaña.
 */
export async function vincularConInfluencer(
  tx: Tx,
  datos: { platform: Platform; urlNormalized: string; influencerId: string },
): Promise<void> {
  await tx.discoveredProfile.updateMany({
    where: { platform: datos.platform, urlNormalized: datos.urlNormalized },
    data: { influencerId: datos.influencerId },
  })
}

const normalizarPalabras = (valores: string[]): string[] => {
  const limpias = valores
    .map((v) => v.trim().toLowerCase().replace(/^#/, ''))
    .filter((v) => v.length > 0 && v.length <= 80)
  return [...new Set(limpias)]
}

const unir = (previas: string[], nuevas: string[]): string[] => [...new Set([...previas, ...nuevas])]

// ── Pasar al padrón ─────────────────────────────────────────────────────────

/**
 * Importa perfiles descubiertos al padrón.
 *
 * Descubiertos y padrón contestan preguntas distintas --"¿a quién vimos alguna
 * vez?" contra "¿con quién trabajamos?"-- y por eso son dos tablas. Esto es el
 * puente: elegís del mercado y pasa a tu agenda.
 *
 * El que ya está en el padrón no se duplica: se ata al influencer que ya
 * existe. Y el que ya estaba atado se informa como omitido en vez de contarse
 * como importado, porque decir "importé 30" cuando 12 ya estaban es la mentira
 * chica que después cuesta cara.
 */
export async function importarDescubiertos(
  ctx: AuthContext,
  ids: string[],
): Promise<{ hechos: number; creados: number; vinculados: number; omitidos: Array<{ nombre: string; motivo: string }> }> {
  assertAgencyOnly(ctx)
  assertCan(ctx, 'influencer.manage', null)

  const omitidos: Array<{ nombre: string; motivo: string }> = []
  let creados = 0
  let vinculados = 0

  // Un lote llega de la selección de una página; el tope evita que un pedido
  // armado a mano barra la base entera.
  const unicos = [...new Set(ids)].slice(0, 500)

  for (const id of unicos) {
    try {
      await scoped(ctx, async (tx) => {
        const perfil = await tx.discoveredProfile.findUnique({
          where: { id },
          select: {
            id: true,
            platform: true,
            url: true,
            urlNormalized: true,
            handle: true,
            displayName: true,
            followers: true,
            engagementRate: true,
            country: true,
            bio: true,
            providers: true,
            influencerId: true,
          },
        })
        if (!perfil) {
          omitidos.push({ nombre: id, motivo: 'Ese perfil ya no está.' })
          return
        }

        const nombre = perfil.displayName ?? (perfil.handle ? `@${perfil.handle}` : perfil.url)

        if (perfil.influencerId) {
          omitidos.push({ nombre, motivo: 'Ya estaba en el padrón.' })
          return
        }

        /*
         * Puede estar en el padrón sin que la base lo sepa: se cargó a mano, o
         * se importó desde una corrida antes de que existiera este puente.
         * Buscarlo por su perfil social evita crear un duplicado.
         */
        const existente = await tx.socialProfile.findFirst({
          where: { platform: perfil.platform, urlNormalized: perfil.urlNormalized },
          select: { influencerId: true },
        })

        let influencerId = existente?.influencerId ?? null
        if (influencerId) {
          vinculados += 1
        } else {
          const creado = await tx.influencer.create({
            data: {
              displayName: nombre,
              primaryHandle: perfil.handle,
              country: perfil.country,
              bio: perfil.bio,
              status: 'NEW',
              createdById: ctx.user.id,
            },
          })
          influencerId = creado.id
          creados += 1

          await tx.socialProfile.create({
            data: {
              influencerId,
              platform: perfil.platform,
              url: perfil.url,
              urlNormalized: perfil.urlNormalized,
              handle: perfil.handle,
              followers: perfil.followers,
              engagementRate: perfil.engagementRate,
              /* Procedencia: de dónde salió este número, y de qué proveedor. */
              metricSource: `Descubiertos · ${perfil.providers.join(', ') || 'sin proveedor'}`,
              measuredAt: new Date(),
              verificationStatus: 'UNVERIFIED',
              isPrimary: true,
            },
          })
        }

        await tx.discoveredProfile.update({ where: { id: perfil.id }, data: { influencerId } })
        await recordAudit(tx, actorOf(ctx), {
          action: AUDIT.SCOUTING_IMPORTED,
          entityType: 'Influencer',
          entityId: influencerId,
          metadata: { desde: 'descubiertos', perfil: nombre },
        })
      })
    } catch (error) {
      omitidos.push({ nombre: id, motivo: error instanceof Error ? error.message : 'No se pudo importar.' })
    }
  }

  return { hechos: creados + vinculados, creados, vinculados, omitidos }
}

// ── Buscar ───────────────────────────────────────────────────────────────────

export type FiltrosDeBase = {
  /** Busca en usuario, nombre y bio. */
  texto?: string | null
  platform?: Platform | null
  pais?: string | null
  seguidoresDesde?: number | null
  seguidoresHasta?: number | null
  engagementDesde?: number | null
  engagementHasta?: number | null
  /** Cualquiera de estas palabras. */
  palabras?: string[]
  intereses?: string[]
  proveedor?: string | null
  /** Cuántas búsquedas distintas lo trajeron, como mínimo. */
  vistoAlMenos?: number | null
  visto?: 'CUALQUIERA' | 'ULTIMOS_30' | 'ULTIMOS_90'
  /** Si ya está en el padrón de influencers. */
  enPadron?: 'CUALQUIERA' | 'SI' | 'NO'
  /** Si alguna vez participó de una campaña. */
  conCampanas?: 'CUALQUIERA' | 'SI' | 'NO'
  orden?: OrdenDeBase
}

/**
 * Las columnas por las que se puede ordenar.
 *
 * Son las mismas claves que declara la pantalla, y se validan contra
 * `resolverOrden` antes de llegar acá: una clave de más ordenaría por una
 * columna que la lista no muestra, y el orden se convierte en una forma de
 * leer datos ocultos de a uno.
 */
export type ClaveDeOrden = 'nombre' | 'seguidores' | 'engagement' | 'visto' | 'veces'

export type OrdenDeBase = { clave: ClaveDeOrden; direccion: 'asc' | 'desc' }

export type PerfilDeBase = {
  id: string
  platform: Platform
  url: string
  handle: string | null
  displayName: string | null
  followers: number | null
  engagementRate: number | null
  country: string | null
  bio: string | null
  profileImageUrl: string | null
  keywords: string[]
  interests: string[]
  providers: string[]
  timesSeen: number
  firstSeenAt: Date
  lastSeenAt: Date
  influencerId: string | null
  /** En cuántas campañas participó. Se lee de las campañas, no se copia. */
  campanas: number
}

export async function buscarEnBase(
  ctx: AuthContext,
  filtros: FiltrosDeBase,
  paginacion: { page: number; pageSize: number },
): Promise<Paginated<PerfilDeBase>> {
  assertAgencyOnly(ctx)

  const page = Math.max(1, paginacion.page)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, paginacion.pageSize || DEFAULT_PAGE_SIZE))
  const where = condiciones(filtros)

  return scoped(ctx, async (tx) => {
    const [total, filas] = await Promise.all([
      tx.discoveredProfile.count({ where }),
      tx.discoveredProfile.findMany({
        where,
        orderBy: ordenar(filtros.orden ?? { clave: 'visto', direccion: 'desc' }),
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          platform: true,
          url: true,
          handle: true,
          displayName: true,
          followers: true,
          engagementRate: true,
          country: true,
          bio: true,
          profileImageKey: true,
          keywords: true,
          interests: true,
          providers: true,
          timesSeen: true,
          firstSeenAt: true,
          lastSeenAt: true,
          influencerId: true,
          influencer: { select: { _count: { select: { candidacies: true } } } },
        },
      }),
    ])

    return {
      items: filas.map((f) => ({
        id: f.id,
        platform: f.platform,
        url: f.url,
        handle: f.handle,
        displayName: f.displayName,
        followers: f.followers,
        engagementRate: f.engagementRate === null ? null : Number(f.engagementRate),
        country: f.country,
        bio: f.bio,
        /*
         * La foto la sirve la aplicación, no el proveedor: su URL caduca y
         * nuestro CSP no la deja cargar. Sin imagen guardada va null, y el
         * avatar muestra las iniciales.
         */
        profileImageUrl: f.profileImageKey ? `/api/descubiertos/${f.id}/foto` : null,
        keywords: f.keywords,
        interests: f.interests,
        providers: f.providers,
        timesSeen: f.timesSeen,
        firstSeenAt: f.firstSeenAt,
        lastSeenAt: f.lastSeenAt,
        influencerId: f.influencerId,
        campanas: f.influencer?._count.candidacies ?? 0,
      })),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    }
  })
}

function condiciones(filtros: FiltrosDeBase): Record<string, unknown> {
  const and: Record<string, unknown>[] = []

  if (filtros.platform) and.push({ platform: filtros.platform })
  if (filtros.pais) and.push({ country: { equals: filtros.pais, mode: 'insensitive' } })
  if (filtros.proveedor) and.push({ providers: { has: filtros.proveedor } })
  if (filtros.vistoAlMenos != null) and.push({ timesSeen: { gte: filtros.vistoAlMenos } })

  const seguidores: Record<string, number> = {}
  if (filtros.seguidoresDesde != null) seguidores.gte = filtros.seguidoresDesde
  if (filtros.seguidoresHasta != null) seguidores.lte = filtros.seguidoresHasta
  if (Object.keys(seguidores).length > 0) and.push({ followers: seguidores })

  const er: Record<string, number> = {}
  if (filtros.engagementDesde != null) er.gte = filtros.engagementDesde
  if (filtros.engagementHasta != null) er.lte = filtros.engagementHasta
  if (Object.keys(er).length > 0) and.push({ engagementRate: er })

  const palabras = normalizarPalabras(filtros.palabras ?? [])
  if (palabras.length > 0) and.push({ keywords: { hasSome: palabras } })

  const intereses = normalizarPalabras(filtros.intereses ?? [])
  if (intereses.length > 0) and.push({ interests: { hasSome: intereses } })

  const texto = filtros.texto?.trim()
  if (texto) {
    and.push({
      OR: [
        { handle: { contains: texto, mode: 'insensitive' } },
        { displayName: { contains: texto, mode: 'insensitive' } },
        { bio: { contains: texto, mode: 'insensitive' } },
      ],
    })
  }

  if (filtros.visto === 'ULTIMOS_30' || filtros.visto === 'ULTIMOS_90') {
    const dias = filtros.visto === 'ULTIMOS_30' ? 30 : 90
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
    and.push({ lastSeenAt: { gte: desde } })
  }

  if (filtros.enPadron === 'SI') and.push({ influencerId: { not: null } })
  if (filtros.enPadron === 'NO') and.push({ influencerId: null })

  /*
   * "Participó de una campaña" se pregunta a las campañas, no a una copia. Es
   * más lento que guardar un contador acá, y es lo correcto: un contador propio
   * puede quedar desactualizado y contradecir a la pantalla de la campaña.
   */
  if (filtros.conCampanas === 'SI') {
    and.push({ influencer: { is: { candidacies: { some: {} } } } })
  }
  if (filtros.conCampanas === 'NO') {
    and.push({ OR: [{ influencerId: null }, { influencer: { is: { candidacies: { none: {} } } } }] })
  }

  return and.length > 0 ? { AND: and } : {}
}

function ordenar(orden: OrdenDeBase): Record<string, unknown>[] {
  const { direccion } = orden
  /*
   * `nulls: 'last'` en todas las que pueden faltar: al que no informa un número
   * no se lo premia poniéndolo primero ni se lo esconde. Va al final, que es
   * donde no confunde, y da igual si se ordena de mayor a menor o al revés.
   */
  const alFinal = { sort: direccion, nulls: 'last' as const }

  switch (orden.clave) {
    case 'nombre':
      return [{ displayName: alFinal }, { handle: alFinal }]
    case 'seguidores':
      return [{ followers: alFinal }, { lastSeenAt: 'desc' }]
    case 'engagement':
      return [{ engagementRate: alFinal }, { lastSeenAt: 'desc' }]
    case 'veces':
      return [{ timesSeen: direccion }, { lastSeenAt: 'desc' }]
    case 'visto':
    default:
      return [{ lastSeenAt: direccion }]
  }
}

/** Los números de arriba de la lista. */
export type ResumenDeDescubiertos = {
  total: number
  /** Los que todavía no son influencers del padrón. */
  sinIncorporar: number
  /** Los que alguna búsqueda volvió a encontrar en los últimos 30 días. */
  recientes: number
}

export async function resumenDeDescubiertos(ctx: AuthContext): Promise<ResumenDeDescubiertos> {
  assertAgencyOnly(ctx)
  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  return scoped(ctx, async (tx) => {
    const [total, sinIncorporar, recientes] = await Promise.all([
      tx.discoveredProfile.count(),
      tx.discoveredProfile.count({ where: { influencerId: null } }),
      tx.discoveredProfile.count({ where: { lastSeenAt: { gte: hace30 } } }),
    ])
    return { total, sinIncorporar, recientes }
  })
}

// ── La ficha de un perfil ────────────────────────────────────────────────────

export type HistorialDeCampana = {
  campaignId: string
  campana: string
  cliente: string
  estado: string
  aprobacionCliente: string
  publicadoEl: Date | null
  /** Lo que se le pagó y lo que falta, en la moneda de cada movimiento. */
  pagos: { moneda: string; pagado: number; pendiente: number }[]
}

export type FichaDeBase = {
  perfil: PerfilDeBase
  /** Cómo fueron cambiando sus números. Lo que la base aprendió sola. */
  historialDeMetricas: { seenAt: Date; followers: number | null; engagementRate: number | null; provider: string }[]
  /** Campañas en las que participó. Vacío si todavía no está en el padrón. */
  campanas: HistorialDeCampana[]
}

export async function fichaDeBase(ctx: AuthContext, id: string): Promise<FichaDeBase> {
  assertAgencyOnly(ctx)

  return scoped(ctx, async (tx) => {
    const perfil = await tx.discoveredProfile.findUnique({
      where: { id },
      select: {
        id: true,
        platform: true,
        url: true,
        handle: true,
        displayName: true,
        followers: true,
        engagementRate: true,
        country: true,
        bio: true,
        profileImageKey: true,
        keywords: true,
        interests: true,
        providers: true,
        timesSeen: true,
        firstSeenAt: true,
        lastSeenAt: true,
        influencerId: true,
      },
    })
    if (!perfil) throw new NotFoundError()

    const metricas = await tx.discoveredProfileMetric.findMany({
      where: { profileId: id },
      orderBy: { seenAt: 'asc' },
      take: 200,
      select: { seenAt: true, followers: true, engagementRate: true, provider: true },
    })

    /*
     * El historial de campañas y pagos se LEE de las campañas. No se copia acá
     * a propósito: una copia se desactualiza y termina contradiciendo a la
     * pantalla de la campaña, y entonces hay dos verdades sobre la misma plata.
     */
    const candidaturas = perfil.influencerId
      ? await tx.candidacy.findMany({
          where: { influencerId: perfil.influencerId },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: {
            campaignId: true,
            statusKey: true,
            clientApproval: true,
            publishedAt: true,
            campaign: { select: { name: true, client: { select: { name: true } } } },
            payments: {
              select: { amount: true, currency: true, status: true, direction: true },
            },
          },
        })
      : []

    return {
      perfil: {
        ...perfil,
        engagementRate: perfil.engagementRate === null ? null : Number(perfil.engagementRate),
        // La sirve la aplicación, igual que en la lista.
        profileImageUrl: perfil.profileImageKey ? `/api/descubiertos/${perfil.id}/foto` : null,
        campanas: candidaturas.length,
      },
      historialDeMetricas: metricas.map((m) => ({
        seenAt: m.seenAt,
        followers: m.followers,
        engagementRate: m.engagementRate === null ? null : Number(m.engagementRate),
        provider: m.provider,
      })),
      campanas: candidaturas.map((c) => ({
        campaignId: c.campaignId,
        campana: c.campaign?.name ?? 'Campaña',
        cliente: c.campaign?.client?.name ?? '',
        estado: c.statusKey,
        aprobacionCliente: c.clientApproval,
        publicadoEl: c.publishedAt,
        pagos: resumirPagos(c.payments),
      })),
    }
  })
}

/**
 * Junta los pagos por moneda.
 *
 * No se convierte nada: sumar pesos con dólares a un tipo de cambio inventado
 * sería informar una cifra que nadie puede verificar. Cada moneda se muestra
 * por separado, como en el resto del producto.
 */
function resumirPagos(
  pagos: { amount: unknown; currency: string; status: string; direction: string }[],
): { moneda: string; pagado: number; pendiente: number }[] {
  const porMoneda = new Map<string, { pagado: number; pendiente: number }>()
  for (const p of pagos) {
    // Sólo la plata que sale hacia el influencer. Lo que cobra el cliente es
    // otra cosa y no es parte de la historia de este perfil.
    if (p.direction !== 'TALENT_OUT') continue
    if (p.status === 'CANCELLED') continue
    const monto = Number(p.amount)
    if (!Number.isFinite(monto)) continue
    const actual = porMoneda.get(p.currency) ?? { pagado: 0, pendiente: 0 }
    if (p.status === 'PAID') actual.pagado += monto
    else actual.pendiente += monto
    porMoneda.set(p.currency, actual)
  }
  return [...porMoneda.entries()].map(([moneda, v]) => ({ moneda, ...v }))
}
