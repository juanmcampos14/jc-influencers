import 'server-only'
import type { Platform } from '@/generated/prisma/enums'
import type { FiltrosDeAudiencia, FiltrosDeScouting } from '@/lib/domain/filtros-scouting'
import {
  cuerpoDeBusqueda,
  leerCreador,
  leerSobre,
  MAXIMO_POR_PAGINA,
  redDe,
} from './influencers-club-consulta'
import {
  ScoutingUnavailableError,
  type DiscoverParams,
  type EnrichParams,
  type JobHandle,
  type JobProgress,
  type ScoutingProvider,
  type ScoutingRecord,
} from './scouting'

/**
 * Proveedor de datos: influencers.club.
 *
 * Es el motor principal de descubrimiento. A diferencia de Bright Data y Apify,
 * que raspan una página y devuelven lo que está a la vista, mantiene perfiles
 * ya analizados y filtra en el origen por **quién sigue al creador**: país,
 * edad, género e intereses del público, y cuánto de esa audiencia es real.
 *
 * Tres cosas suyas cambian cómo se lo usa, y las tres están resueltas acá:
 *
 * **Contesta de una.** No hay trabajo que arrancar y después consultar. Nuestro
 * puerto está armado al revés porque así trabajan los scrapers; la costura está
 * explicada en `startDiscover`.
 *
 * **Cobra por creador devuelto, no por consulta.** Una búsqueda que no
 * encuentra a nadie no se cobra --lo contrario de lo que nos pasó con Apify,
 * donde una corrida abortada se cobró igual--. Pero pedir de más sí se paga
 * aunque no se mire, así que el límite pedido se respeta a rajatabla.
 *
 * **Devuelve poco a propósito.** La búsqueda entrega usuario, nombre, foto,
 * seguidores y engagement; el país y la bio son de otro endpoint que cuesta 20
 * a 80 veces más. Acá van en null, que es la verdad, y `filtros-scouting.ts`
 * los marca como "no dice de qué país es" en vez de inventarlos.
 */

const BASE = 'https://api-dashboard.influencers.club'

/** Lo que cuesta un creador devuelto, en créditos. Es su precio de lista. */
const CREDITOS_POR_CREADOR = 0.01

/** Techo de páginas por corrida, para que un pedido raro no vacíe el saldo. */
const MAX_PAGINAS = 20

export type CredencialesInfluencersClub = {
  apiKey: string
  /**
   * Cuánto sale un crédito, en dólares. No tiene valor por defecto: su precio
   * cambia según el plan --arranca en US$ 0,23-- y sin saberlo el tope mensual
   * deja de ser un tope. Un cero por defecto haría creer que buscar es gratis.
   */
  costoPorCreditoUsd: number | null
}

/**
 * Lo que viaja adentro del identificador del trabajo.
 *
 * La API contesta al instante, así que no hay identificador que él nos dé para
 * seguir. Guardar los resultados en la memoria del proceso no sirve: quien
 * dispara la corrida y quien la consulta después son dos invocaciones
 * distintas, y muy posiblemente dos máquinas. Así que el pedido entero viaja
 * codificado en el identificador, que sí queda persistido en la corrida.
 *
 * Consecuencia buscada: **`startDiscover` no gasta**. Se paga en el primer
 * `poll`, y el repositorio sólo consulta mientras la corrida está RUNNING, así
 * que se paga una vez.
 */
type PedidoCodificado = {
  p: Platform
  k: string[]
  f: FiltrosDeScouting
  a: FiltrosDeAudiencia
  n: number
}

function codificar(pedido: PedidoCodificado): string {
  return Buffer.from(JSON.stringify(pedido), 'utf8').toString('base64url')
}

function decodificar(jobId: string): PedidoCodificado {
  try {
    const crudo = JSON.parse(Buffer.from(jobId, 'base64url').toString('utf8')) as PedidoCodificado
    if (!crudo || typeof crudo.p !== 'string' || !Array.isArray(crudo.k)) throw new Error('forma inesperada')
    return crudo
  } catch {
    throw new ScoutingUnavailableError('No se pudo leer la búsqueda guardada. Volvé a calcular el costo.')
  }
}

export class InfluencersClubScoutingProvider implements ScoutingProvider {
  readonly name = 'influencers-club'
  readonly filtraPorAudiencia = true

  /** Consultas en curso, para que dos `poll` a la vez no paguen dos veces. */
  private enVuelo = new Map<string, Promise<JobProgress>>()

  constructor(private readonly credenciales: CredencialesInfluencersClub) {}

  get configured(): boolean {
    return Boolean(this.credenciales.apiKey) && this.credenciales.costoPorCreditoUsd !== null
  }

  unitCostUsd(): number {
    const porCredito = this.credenciales.costoPorCreditoUsd
    if (porCredito === null) return 0
    return Number((CREDITOS_POR_CREADOR * porCredito).toFixed(6))
  }

  supports(platform: Platform, mode: 'DISCOVER' | 'ENRICH'): boolean {
    /*
     * Sólo descubrimiento. Actualizar las métricas de un perfil que ya tenemos
     * es su endpoint de enriquecimiento, con otro precio --de 3 a 100 veces más
     * caro por perfil--; declararlo acá haría que el ruteo le mandara trabajo
     * que este adaptador no sabe hacer, y a un costo que nadie pidió.
     */
    if (mode !== 'DISCOVER') return false
    return redDe(platform) !== null
  }

  async startDiscover(params: DiscoverParams): Promise<JobHandle> {
    if (!this.supports(params.platform, 'DISCOVER')) {
      throw new ScoutingUnavailableError(`influencers.club no busca en ${params.platform}.`)
    }
    const filtros: FiltrosDeScouting = {
      ...(params.filtros ?? {}),
      pais: params.filtros?.pais ?? params.country ?? null,
      seguidoresDesde: params.filtros?.seguidoresDesde ?? params.minFollowers ?? null,
      seguidoresHasta: params.filtros?.seguidoresHasta ?? params.maxFollowers ?? null,
    }
    return {
      jobId: codificar({
        p: params.platform,
        k: params.keywords,
        f: filtros,
        a: params.audiencia ?? {},
        n: params.limit,
      }),
      provider: this.name,
    }
  }

  async startEnrich(_params: EnrichParams): Promise<JobHandle> {
    throw new ScoutingUnavailableError(
      'influencers.club sólo descubre perfiles nuevos acá; actualizar métricas usa otro endpoint suyo, más caro.',
    )
  }

  async poll(job: JobHandle): Promise<JobProgress> {
    const enCurso = this.enVuelo.get(job.jobId)
    if (enCurso) return enCurso

    const corrida = this.buscar(job.jobId).finally(() => this.enVuelo.delete(job.jobId))
    this.enVuelo.set(job.jobId, corrida)
    return corrida
  }

  async cancel(): Promise<void> {
    // No hay nada que cancelar: si la consulta salió, ya volvió y ya se pagó.
  }

  async fetchProfileImage(): Promise<{ imageUrl: string | null; displayName: string | null }> {
    // Buscar un perfil suelto acá costaría una consulta. No vale la pena.
    return { imageUrl: null, displayName: null }
  }

  // ── Adentro ────────────────────────────────────────────────────────────────

  private async buscar(jobId: string): Promise<JobProgress> {
    const pedido = decodificar(jobId)
    const registros: ScoutingRecord[] = []
    const vistos = new Set<string>()

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
      /*
       * Se pide exactamente lo que falta, no una página entera: cobra por
       * creador devuelto, así que traer de más para descartarlo es tirar plata.
       */
      const faltan = pedido.n - registros.length
      if (faltan <= 0) break

      const cuerpo = cuerpoDeBusqueda({
        platform: pedido.p,
        palabras: pedido.k,
        filtros: pedido.f,
        audiencia: pedido.a,
        pagina,
        limite: Math.min(faltan, MAXIMO_POR_PAGINA),
      })

      let sobre
      try {
        sobre = await this.consultar(cuerpo)
      } catch (error) {
        /*
         * Si ya se trajo algo, se entrega: esos creadores ya se pagaron y
         * tirarlos porque la página siguiente se cortó sería perder lo pago.
         */
        if (registros.length > 0) break
        return { status: 'FAILED', message: error instanceof Error ? error.message : 'Error de influencers.club.' }
      }

      if (!sobre.ok) {
        if (registros.length > 0) break
        return { status: 'FAILED', message: sobre.mensaje }
      }

      for (const crudo of sobre.creadores) {
        const perfil = leerCreador(pedido.p, crudo)
        if (!perfil) continue
        const clave = perfil.url.toLowerCase()
        if (vistos.has(clave)) continue
        vistos.add(clave)
        registros.push({
          platform: pedido.p,
          url: perfil.url,
          urlNormalized: clave,
          handle: perfil.handle,
          displayName: perfil.displayName,
          followers: perfil.followers,
          engagementRate: perfil.engagementRate,
          /*
           * La búsqueda no devuelve país ni bio --son de su endpoint de
           * enriquecimiento, que cuesta mucho más--. Null es la verdad, y los
           * filtros lo marcan como "no dice de qué país es" en vez de suponerlo.
           */
          country: null,
          bio: null,
          profileImageUrl: perfil.profileImageUrl,
          raw: perfil.raw,
        })
        if (registros.length >= pedido.n) break
      }

      // Devolvió menos de lo pedido: no hay más, y la próxima página sería en vano.
      if (sobre.creadores.length === 0) break
    }

    return { status: 'READY', records: registros.slice(0, pedido.n) }
  }

  private async consultar(cuerpo: Record<string, unknown>) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45_000)
    try {
      const respuesta = await fetch(`${BASE}/public/v1/discovery/`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.credenciales.apiKey}`,
        },
        body: JSON.stringify(cuerpo),
      })

      const texto = await respuesta.text()
      let json: unknown
      try {
        json = JSON.parse(texto)
      } catch {
        throw new Error(`influencers.club respondió ${respuesta.status} con algo que no es JSON.`)
      }

      /*
       * Dos cosas distintas contestan 429 y hay que saber cuál es: el límite de
       * 300 pedidos por minuto --se reintenta más tarde-- y el tope de
       * descubrimiento del plan --no se reintenta, hay que esperar la
       * renovación--. Decir "probá de nuevo" en el segundo caso manda a alguien
       * a golpear una puerta cerrada.
       */
      if (respuesta.status === 429) {
        const detalle = typeof json === 'object' && json !== null ? (json as { error?: unknown }).error : null
        const mensaje = typeof detalle === 'string' ? detalle : ''
        throw new Error(
          /credit limit/i.test(mensaje)
            ? 'Se agotó el cupo de descubrimiento del plan de influencers.club. Se repone cuando renueva la suscripción.'
            : 'influencers.club está recibiendo demasiados pedidos por minuto. Probá de nuevo en un rato.',
        )
      }

      return leerSobre(json)
    } finally {
      clearTimeout(timer)
    }
  }
}
