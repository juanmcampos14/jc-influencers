import 'server-only'
import type { Platform } from '@/generated/prisma/enums'
import type { FiltrosDeScouting } from '@/lib/domain/filtros-scouting'
import {
  cuerpoDeBusqueda,
  leerCreador,
  leerSobre,
  paginasPara,
  POR_PAGINA,
  redDe,
  type FiltrosDeAudiencia,
} from './hypeauditor-consulta'
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
 * Proveedor de datos: HypeAuditor.
 *
 * Es de otra especie que Bright Data y Apify. Ellos raspan una página y
 * devuelven lo que está a la vista; HypeAuditor mantiene perfiles ya
 * analizados. Por eso puede contestar lo único que un scraper nunca va a
 * saber: **quién sigue a ese creador** --de qué país es su público, qué edad
 * tiene, cuánto de esa audiencia es real--.
 *
 * Dos cosas suyas cambian cómo se lo usa:
 *
 * **Contesta de una.** No hay trabajo que arrancar y después consultar: se
 * pregunta y responde. Nuestro puerto está armado al revés porque así trabajan
 * los scrapers. La costura está explicada en `startDiscover`.
 *
 * **Cobra por página de 20, no por perfil.** Buscar 21 cuesta igual que buscar
 * 40. El costo por registro que declaramos es el de la página repartido, y por
 * eso `unitCostUsd` divide.
 */

const BASE = 'https://hypeauditor.com/api/method'

/** Cuántas páginas se traen como máximo de una. Techo de gasto por corrida. */
const MAX_PAGINAS = 25

export type CredencialesHypeAuditor = {
  authId: string
  token: string
  /**
   * Cuánto cuesta una consulta (una página de 20). No tiene default: si no
   * sabemos qué cuesta, no podemos controlar el tope mensual, y un cero por
   * defecto haría creer que buscar es gratis.
   */
  costoPorConsultaUsd: number | null
  /**
   * Si se usa el entorno de prueba. Sirve para verificar la integración entera
   * sin tocar el saldo real.
   */
  sandbox: boolean
}

/**
 * Lo que viaja adentro del identificador del trabajo.
 *
 * HypeAuditor contesta al instante, así que no hay ningún identificador que él
 * nos dé para seguir. En vez de inventar uno y guardar los resultados en la
 * memoria del proceso --que en producción no sobrevive: quien dispara la
 * corrida y quien la consulta después son dos invocaciones distintas, y muy
 * posiblemente dos máquinas-- el pedido entero viaja codificado en el
 * identificador, que sí queda persistido en la corrida.
 *
 * Consecuencia buscada: **`startDiscover` no gasta**. La consulta se paga en el
 * primer `poll`, y el repositorio sólo consulta mientras la corrida está
 * RUNNING, así que se paga una vez.
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

export class HypeAuditorScoutingProvider implements ScoutingProvider {
  readonly name = 'hypeauditor'
  readonly filtraPorAudiencia = true

  /**
   * Reintentos en curso, por identificador de trabajo.
   *
   * Si dos consultas llegan a la vez a la misma máquina --la pantalla consulta
   * cada pocos segundos-- comparten una sola llamada en vez de pagar dos.
   */
  private enVuelo = new Map<string, Promise<JobProgress>>()

  constructor(private readonly credenciales: CredencialesHypeAuditor) {}

  get configured(): boolean {
    /*
     * Tener la llave no alcanza: sin saber qué cuesta una consulta, el tope
     * mensual deja de ser un tope. Se prefiere aparecer como no configurado
     * --con lo que la pantalla pide cargar credenciales-- antes que ejecutar
     * gasto que no sabemos medir.
     */
    return Boolean(this.credenciales.authId && this.credenciales.token) && this.credenciales.costoPorConsultaUsd !== null
  }

  unitCostUsd(): number {
    const porConsulta = this.credenciales.costoPorConsultaUsd
    if (porConsulta === null) return 0
    // Se cobra la página entera, así que el costo por registro es el reparto.
    return Number((porConsulta / POR_PAGINA).toFixed(6))
  }

  supports(platform: Platform, mode: 'DISCOVER' | 'ENRICH'): boolean {
    /*
     * Sólo descubrimiento. Actualizar las métricas de un perfil que ya
     * tenemos es otro endpoint suyo, con otro precio; declararlo acá haría que
     * el ruteo le mandara trabajo que este adaptador no sabe hacer.
     */
    if (mode !== 'DISCOVER') return false
    return redDe(platform) !== null
  }

  async startDiscover(params: DiscoverParams): Promise<JobHandle> {
    if (!this.supports(params.platform, 'DISCOVER')) {
      throw new ScoutingUnavailableError(`HypeAuditor no busca en ${params.platform}.`)
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
    throw new ScoutingUnavailableError('HypeAuditor sólo descubre perfiles nuevos; no actualiza métricas.')
  }

  async poll(job: JobHandle): Promise<JobProgress> {
    const enCurso = this.enVuelo.get(job.jobId)
    if (enCurso) return enCurso

    const corrida = this.buscar(job.jobId).finally(() => this.enVuelo.delete(job.jobId))
    this.enVuelo.set(job.jobId, corrida)
    return corrida
  }

  async cancel(): Promise<void> {
    /*
     * No hay nada que cancelar: si la consulta salió, ya se pagó y ya volvió.
     * Cancelar es una operación de los proveedores que trabajan en segundo
     * plano.
     */
  }

  async fetchProfileImage(): Promise<{ imageUrl: string | null; displayName: string | null }> {
    // Buscar un perfil suelto acá costaría una consulta entera. No vale la pena.
    return { imageUrl: null, displayName: null }
  }

  // ── Adentro ────────────────────────────────────────────────────────────────

  private async buscar(jobId: string): Promise<JobProgress> {
    const pedido = decodificar(jobId)
    const paginas = Math.min(paginasPara(pedido.n), MAX_PAGINAS)
    const registros: ScoutingRecord[] = []
    const vistos = new Set<string>()

    for (let pagina = 1; pagina <= paginas; pagina += 1) {
      const cuerpo = cuerpoDeBusqueda({
        platform: pedido.p,
        palabras: pedido.k,
        filtros: pedido.f,
        audiencia: pedido.a,
        pagina,
      })

      let sobre
      try {
        sobre = await this.consultar(cuerpo)
      } catch (error) {
        /*
         * Si ya se trajo algo, se entrega. La página que falló se pagó igual
         * --y hay que decirlo-- pero tirar 40 perfiles buenos porque el tercer
         * pedido se cortó sería perder lo que ya está pago.
         */
        if (registros.length > 0) break
        const mensaje = error instanceof Error ? error.message : 'Error de HypeAuditor.'
        return { status: 'FAILED', message: mensaje }
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
           * El país del creador no viene en la búsqueda: se filtra por él, pero
           * no se devuelve. Decir null es lo correcto --y hace que los filtros
           * lo marquen como "no dice de qué país es" en vez de inventarlo--.
           */
          country: null,
          bio: null,
          profileImageUrl: perfil.profileImageUrl,
          raw: perfil.raw,
        })
        if (registros.length >= pedido.n) break
      }

      if (registros.length >= pedido.n) break
      // Página incompleta: no hay más para traer, y la siguiente se cobraría igual.
      if (sobre.creadores.length < POR_PAGINA) break
    }

    return { status: 'READY', records: registros.slice(0, pedido.n) }
  }

  private async consultar(cuerpo: Record<string, unknown>) {
    const metodo = this.credenciales.sandbox ? 'auditor.searchSandbox' : 'auditor.search'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45_000)
    try {
      const respuesta = await fetch(`${BASE}/${metodo}/`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Id': this.credenciales.authId,
          'X-Auth-Token': this.credenciales.token,
        },
        body: JSON.stringify(cuerpo),
      })

      const texto = await respuesta.text()
      let json: unknown
      try {
        json = JSON.parse(texto)
      } catch {
        throw new Error(`HypeAuditor respondió ${respuesta.status} con algo que no es JSON.`)
      }
      /*
       * El sobre se lee siempre, tenga el estado que tenga: HypeAuditor
       * devuelve el motivo adentro del cuerpo, y quedarse con el código de
       * estado convertiría "token inválido" en un error mudo.
       */
      return leerSobre(json)
    } finally {
      clearTimeout(timer)
    }
  }
}
