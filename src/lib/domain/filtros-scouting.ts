/**
 * Filtros del scouting.
 *
 * Dos reglas gobiernan este archivo, y las dos vienen de la misma idea.
 *
 * **1. Sólo existe el filtro que se puede comprobar.** Un campo "publicó hace
 * menos de 30 días" se ve bien en la pantalla y sería una promesa vacía: el
 * proveedor no devuelve la fecha del último posteo. Filtrar por algo que no
 * medimos es peor que no ofrecer el filtro, porque el resultado parece
 * verificado.
 *
 * **2. Al que le falta el dato se lo MARCA, no se lo descarta.** Si pedís
 * Argentina y un creador no trae país, no sabemos que NO sea argentino: sólo
 * que no lo dice. Descartarlo silenciosamente esconde gente que podía servir y
 * hace creer que la lista está completa.
 */

export type FiltrosDeScouting = {
  /** Código de país tal como lo devuelve la red (AR, MX…). */
  pais?: string | null
  /** Ciudad o zona. Se busca dentro de la bio. */
  zona?: string | null
  /** Palabra o frase que tiene que aparecer en la bio. */
  bioMenciona?: string | null
  seguidoresDesde?: number | null
  seguidoresHasta?: number | null
  engagementMinimo?: number | null
}

/** Lo que se puede evaluar de un creador. */
export type CreadorFiltrable = {
  followers: number | null
  engagementRate: number | null
  country: string | null
  bio: string | null
}

export type Veredicto = 'CUMPLE' | 'NO_CUMPLE' | 'SIN_DATO'

/** Los filtros que un proveedor puede haber aplicado él mismo. */
export type ClaveDeFiltro = 'pais' | 'zona' | 'bioMenciona' | 'seguidores' | 'engagement'

export type Evaluacion = {
  veredicto: Veredicto
  /** Qué filtro falló o no se pudo comprobar. Vacío si cumple todo. */
  motivos: string[]
}

const normalizar = (valor: string): string =>
  valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/**
 * Evalúa un creador contra los filtros.
 *
 * El orden importa: primero se busca un incumplimiento seguro --tenemos el dato
 * y no da--, y sólo si no hay ninguno se reporta lo que no se pudo comprobar.
 * Un creador con 500 seguidores cuando se pidieron 10.000 NO CUMPLE, aunque
 * además le falte el país.
 */
export function evaluarCreador(
  creador: CreadorFiltrable,
  filtros: FiltrosDeScouting,
  /**
   * Los filtros que el proveedor aplicó **en el origen**.
   *
   * Cambia la respuesta y no es un detalle. Los scrapers devuelven lo que
   * encuentran y recién después se comprueba cada filtro sobre el dato; un
   * proveedor de datos filtra antes de devolver, así que lo que llega cumple
   * por construcción.
   *
   * Sin esto, pedir "creadores de Argentina" a un proveedor que además no
   * devuelve el país terminaba en "0 cumplen · 5 no se pudieron comprobar":
   * cinco resultados que el proveedor había garantizado argentinos, marcados
   * como dudosos. Decir que no se pudo comprobar algo que sí se garantizó es
   * tan poco honesto como afirmar lo que no se sabe.
   */
  garantizados: ReadonlyArray<ClaveDeFiltro> = [],
): Evaluacion {
  const incumple: string[] = []
  const sinDato: string[] = []
  const enOrigen = new Set(garantizados)

  if (!enOrigen.has('seguidores') && (filtros.seguidoresDesde != null || filtros.seguidoresHasta != null)) {
    if (creador.followers === null) sinDato.push('no informa seguidores')
    else if (filtros.seguidoresDesde != null && creador.followers < filtros.seguidoresDesde) {
      incumple.push(`tiene ${creador.followers} seguidores, menos del mínimo`)
    } else if (filtros.seguidoresHasta != null && creador.followers > filtros.seguidoresHasta) {
      incumple.push(`tiene ${creador.followers} seguidores, más del máximo`)
    }
  }

  if (!enOrigen.has('engagement') && filtros.engagementMinimo != null) {
    if (creador.engagementRate === null) sinDato.push('no informa engagement')
    else if (creador.engagementRate < filtros.engagementMinimo) {
      incumple.push(`engagement ${creador.engagementRate}%, debajo del mínimo`)
    }
  }

  if (!enOrigen.has('pais') && filtros.pais) {
    if (!creador.country) sinDato.push('no dice de qué país es')
    else if (normalizar(creador.country) !== normalizar(filtros.pais)) {
      incumple.push(`está en ${creador.country}`)
    }
  }

  /*
   * La zona y la mención se buscan en la bio, que es lo único que tenemos.
   * Cuando no hay bio no se puede comprobar ninguna de las dos: sin bio no hay
   * dónde mirar, y eso es distinto de "la bio no lo dice".
   */
  if (!enOrigen.has('zona') && filtros.zona) {
    if (!creador.bio) sinDato.push('no tiene bio donde buscar la zona')
    else if (!normalizar(creador.bio).includes(normalizar(filtros.zona))) {
      incumple.push('su bio no nombra esa zona')
    }
  }

  if (!enOrigen.has('bioMenciona') && filtros.bioMenciona) {
    if (!creador.bio) sinDato.push('no tiene bio')
    else if (!normalizar(creador.bio).includes(normalizar(filtros.bioMenciona))) {
      incumple.push('su bio no menciona eso')
    }
  }

  if (incumple.length > 0) return { veredicto: 'NO_CUMPLE', motivos: incumple }
  if (sinDato.length > 0) return { veredicto: 'SIN_DATO', motivos: sinDato }
  return { veredicto: 'CUMPLE', motivos: [] }
}

/** Si hay algún filtro puesto. Sin filtros, todo cumple. */
export function hayFiltros(filtros: FiltrosDeScouting): boolean {
  return Object.values(filtros).some((valor) => valor !== null && valor !== undefined && valor !== '')
}

/**
 * Filtros sobre el PÚBLICO del creador, no sobre el creador.
 *
 * Viven acá y no en el adaptador de un proveedor porque ya los aplican dos, y
 * porque son la razón de haber salido a buscar un proveedor de datos: es lo
 * único que un scraper no puede contestar --leyendo una página se ve cuántos
 * seguidores tiene alguien, no quiénes son--.
 *
 * No se mezclan con `FiltrosDeScouting` a propósito. Aquéllos se pueden
 * comprobar sobre lo que devuelve cualquier proveedor, y por eso se marcan
 * después; éstos sólo existen si el proveedor los aplica en el origen.
 * Juntarlos haría creer que Apify también los tiene en cuenta.
 */
export type FiltrosDeAudiencia = {
  /** País del PÚBLICO (AR, MX…) y qué porcentaje mínimo tiene que estar ahí. */
  paisDelPublico?: { pais: string; porcentajeMinimo: number } | null
  /** Género del público y su porcentaje mínimo. */
  generoDelPublico?: { genero: 'male' | 'female'; porcentajeMinimo: number } | null
  /** Tramos de edad ('18-24', '25-34'…) y el porcentaje mínimo sumado. */
  edadDelPublico?: { tramos: string[]; porcentajeMinimo: number } | null
  /** Intereses del público y su porcentaje mínimo. */
  interesesDelPublico?: { intereses: string[]; porcentajeMinimo: number } | null
  /** Cuánto de ese público es real, de 0 a 100. */
  calidadMinima?: number | null
}

/** Si hay algún filtro de audiencia puesto. */
export function hayFiltrosDeAudiencia(filtros: FiltrosDeAudiencia): boolean {
  return Object.values(filtros).some((valor) => valor !== null && valor !== undefined)
}
