import 'server-only'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope, capabilitiesFor } from '@/lib/authz/context'
import { NotFoundError, ValidationError } from '@/lib/authz/errors'
import { leerEnlacesPegados, nombreSugerido, type EnlacePegado } from '@/lib/domain/enlaces-pegados'
import { createInfluencer, upsertSocialProfile } from './influencers'
import { createCandidacy } from './candidacies'
import { scoped } from './base'

/**
 * Sumar gente a una campaña sin salir de la campaña.
 *
 * Antes había que dejar la campaña, ir a Influencers, dar de alta a la persona,
 * volver y recién ahí buscarla; y si eran seis, seis veces. Pero el trabajo
 * de verdad no es ahorrar clics: es **no crear duplicados**. Pegar un enlace de
 * alguien que ya está en la base tiene que encontrarlo, no dar de alta a un
 * segundo "moyanoflor" con el que después nadie sabe cuál es cuál.
 *
 * Por eso el navegador manda sólo el TEXTO pegado y nunca a quién hay que
 * agregar: el servidor vuelve a resolver cada enlace antes de escribir. La
 * previsualización que ve la persona y lo que termina pasando salen del mismo
 * lugar, así que no pueden discrepar.
 */

export type EstadoDelEnlace =
  /** Ya está en esta campaña: no se hace nada. */
  | 'YA_EN_CAMPANA'
  /** Está en la base de la agencia: se agrega, no se crea. */
  | 'EN_LA_BASE'
  /** No está: hay que darlo de alta. */
  | 'NUEVO'

export type EnlaceResuelto = {
  texto: string
  platform: string
  handle: string | null
  estado: EstadoDelEnlace
  /** Quién es, cuando ya existe. */
  influencerId: string | null
  /** Cómo se va a llamar: el nombre que ya tiene, o el sugerido si es nuevo. */
  nombre: string
}

export type LecturaDeEnlaces = {
  enlaces: EnlaceResuelto[]
  noReconocidos: string[]
  /** Si quien mira puede dar de alta. Sin esto, la pantalla no ofrece crear. */
  puedeCrear: boolean
}

/**
 * Qué pasaría con cada enlace. No escribe nada.
 */
export async function resolverEnlaces(
  ctx: AuthContext,
  campaignId: string,
  texto: string,
): Promise<LecturaDeEnlaces> {
  const clientId = await clienteDeLaCampana(ctx, campaignId)
  assertCan(ctx, 'candidate.manage', clientId)

  const { enlaces, noReconocidos } = leerEnlacesPegados(texto)
  const resueltos = await scoped(ctx, (tx) => Promise.all(enlaces.map((enlace) => resolverUno(tx, campaignId, enlace))))

  return {
    enlaces: resueltos,
    noReconocidos,
    puedeCrear: capabilitiesFor(ctx, null).has('influencer.manage'),
  }
}

/**
 * Agregarlos de verdad.
 *
 * Se resuelve de nuevo acá adentro: entre la previsualización y el botón pudo
 * pasar cualquier cosa --otra persona dio de alta al mismo perfil, o lo agregó
 * a esta misma campaña--, y en los dos casos lo correcto es reusar lo que ya
 * existe, no escribir encima.
 *
 * Cada enlace se resuelve por separado y los errores de uno no voltean al
 * resto: pegar seis y perder los seis porque uno estaba mal sería el peor
 * resultado posible de esta pantalla.
 */
export async function agregarPorEnlace(
  ctx: AuthContext,
  input: { campaignId: string; texto: string; clusterId?: string | null },
): Promise<{ agregados: number; creados: number; yaEstaban: number; fallidos: Array<{ texto: string; motivo: string }> }> {
  const clientId = await clienteDeLaCampana(ctx, input.campaignId)
  assertCan(ctx, 'candidate.manage', clientId)

  const { enlaces } = leerEnlacesPegados(input.texto)
  if (enlaces.length === 0) throw new ValidationError({ clave: 'ningunEnlaceUtil' })

  let agregados = 0
  let creados = 0
  let yaEstaban = 0
  const fallidos: Array<{ texto: string; motivo: string }> = []

  for (const enlace of enlaces) {
    try {
      const actual = await scoped(ctx, (tx) => resolverUno(tx, input.campaignId, enlace))
      if (actual.estado === 'YA_EN_CAMPANA') {
        yaEstaban += 1
        continue
      }

      let influencerId = actual.influencerId
      if (!influencerId) {
        /*
         * El alta y su perfil van juntos: un influencer creado desde un enlace
         * al que después le falla el perfil quedaría en la base sin manera de
         * reconocerlo, y el mismo enlace lo volvería a crear la próxima vez.
         */
        const creado = await createInfluencer(ctx, { displayName: nombreSugerido(enlace), primaryHandle: enlace.handle })
        await upsertSocialProfile(ctx, creado.id, { url: enlace.url, isPrimary: true })
        influencerId = creado.id
        creados += 1
      }

      await createCandidacy(ctx, input.campaignId, influencerId, { clusterId: input.clusterId ?? null })
      agregados += 1
    } catch (error) {
      fallidos.push({ texto: enlace.texto, motivo: error instanceof Error ? error.message : 'no se pudo agregar' })
    }
  }

  return { agregados, creados, yaEstaban, fallidos }
}

// ── Adentro ──────────────────────────────────────────────────────────────────

async function clienteDeLaCampana(ctx: AuthContext, campaignId: string): Promise<string> {
  const campaign = await scoped(ctx, (tx) =>
    tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true } }),
  )
  if (!campaign) throw new NotFoundError()
  assertClientInScope(ctx, campaign.clientId)
  return campaign.clientId
}

type Tx = Parameters<Parameters<typeof scoped>[1]>[0]

async function resolverUno(tx: Tx, campaignId: string, enlace: EnlacePegado): Promise<EnlaceResuelto> {
  /*
   * Se busca por la dirección normalizada y no por el handle: dos personas
   * distintas pueden tener el mismo handle en redes distintas, y la dirección
   * es lo único que identifica a un perfil sin ambigüedad.
   */
  const perfil = await tx.socialProfile.findFirst({
    where: { platform: enlace.platform, urlNormalized: enlace.urlNormalized },
    select: { influencerId: true, influencer: { select: { displayName: true } } },
  })

  if (!perfil) {
    return {
      texto: enlace.texto,
      platform: enlace.platform,
      handle: enlace.handle,
      estado: 'NUEVO',
      influencerId: null,
      nombre: nombreSugerido(enlace),
    }
  }

  const enCampana = await tx.candidacy.findUnique({
    where: { campaignId_influencerId: { campaignId, influencerId: perfil.influencerId } },
    select: { id: true },
  })

  return {
    texto: enlace.texto,
    platform: enlace.platform,
    handle: enlace.handle,
    estado: enCampana ? 'YA_EN_CAMPANA' : 'EN_LA_BASE',
    influencerId: perfil.influencerId,
    nombre: perfil.influencer.displayName,
  }
}

/**
 * Dar de alta a alguien por su nombre y sumarlo, cuando no hay enlace.
 *
 * Es el otro camino de la misma pantalla: se buscó por nombre, no apareció
 * nadie, y la salida no puede ser "andá a otra sección y volvé". Nace sin
 * perfil --no hay enlace que guardar-- y por eso NO se puede comprobar contra
 * nada: dos personas con el mismo nombre son dos fichas. La pantalla avisa que
 * conviene pegar el enlace, que sí identifica, y el detector de duplicados que
 * ya corre en `createInfluencer` marca el par para que alguien decida.
 */
export async function crearYAgregarPorNombre(
  ctx: AuthContext,
  input: { campaignId: string; displayName: string; clusterId?: string | null },
): Promise<{ influencerId: string }> {
  const clientId = await clienteDeLaCampana(ctx, input.campaignId)
  assertCan(ctx, 'candidate.manage', clientId)

  const creado = await createInfluencer(ctx, { displayName: input.displayName })
  await createCandidacy(ctx, input.campaignId, creado.id, { clusterId: input.clusterId ?? null })
  return { influencerId: creado.id }
}
