import 'server-only'

/**
 * Arma la entrada de un actor de Apify leyendo el esquema que el actor declara.
 *
 * Los actores de la tienda no comparten nombres de campo: uno pide `hashtags`
 * como lista, otro `query` como texto, otro `searchQueries`. Codificar el
 * nombre de un actor en el adaptador funciona hasta que alguien cambia de
 * actor -- y pasó: el código esperaba `hashtags` y el actor cargado pedía
 * `query`, así que la corrida habría fallado después de cobrarse.
 *
 * Acá se lee el esquema una vez y se traduce la INTENCIÓN --qué buscar y
 * cuántos-- a los nombres que ese actor usa. Si el actor pide algo obligatorio
 * que no sabemos completar, se dice cuál en vez de mandar una corrida que va a
 * fallar.
 */

export type EsquemaDeActor = {
  properties?: Record<string, { type?: string; editor?: string; default?: unknown }>
  required?: string[]
}

export type IntencionDeBusqueda = {
  /** Palabras clave o hashtags, sin almohadilla. */
  terminos: string[]
  /** Cuántos resultados como máximo. */
  tope: number
}

/** Nombres con los que los actores llaman a "qué buscar", del más común al menos. */
const CAMPOS_DE_BUSQUEDA = [
  'hashtags',
  'searchQueries',
  'queries',
  'query',
  'search',
  'keyword',
  'keywords',
  'hashtag',
  'searchTerms',
  'terms',
]

/** Y a "cuántos". */
const CAMPOS_DE_TOPE = [
  'maxResults',
  'resultsLimit',
  'maxItems',
  'maxPosts',
  'limit',
  'maxProfilesPerQuery',
  'resultsPerPage',
]

export class EsquemaIncompletoError extends Error {
  constructor(public readonly faltantes: string[]) {
    super(
      `El actor de Apify pide ${faltantes.join(', ')} y no sabemos con qué completarlo. Probá con otro actor.`,
    )
    this.name = 'EsquemaIncompletoError'
  }
}

export function construirEntrada(
  esquema: EsquemaDeActor | null,
  intencion: IntencionDeBusqueda,
): Record<string, unknown> {
  const props = esquema?.properties ?? {}
  const nombres = Object.keys(props)
  const entrada: Record<string, unknown> = {}

  const buscar = (candidatos: string[]) => candidatos.find((nombre) => nombres.includes(nombre))

  const campoBusqueda = buscar(CAMPOS_DE_BUSQUEDA)
  if (campoBusqueda) {
    const tipo = props[campoBusqueda]?.type
    /*
     * Un actor que pide texto acepta UN término. Mandarle los tres pegados
     * daría una búsqueda que no es ninguna de las tres, así que se usa el
     * primero y quien llama avisa que el resto queda afuera.
     */
    entrada[campoBusqueda] = tipo === 'array' ? intencion.terminos : (intencion.terminos[0] ?? '')
  }

  const campoTope = buscar(CAMPOS_DE_TOPE)
  if (campoTope) entrada[campoTope] = intencion.tope

  // Lo obligatorio que no supimos completar se declara: es mejor no ejecutar.
  const faltantes = (esquema?.required ?? []).filter((nombre) => !(nombre in entrada))
  if (faltantes.length > 0) throw new EsquemaIncompletoError(faltantes)

  return entrada
}

/** Si el actor sólo acepta un término por corrida. */
export function aceptaUnSoloTermino(esquema: EsquemaDeActor | null): boolean {
  const props = esquema?.properties ?? {}
  const campo = CAMPOS_DE_BUSQUEDA.find((nombre) => nombre in props)
  return campo ? props[campo]?.type !== 'array' : false
}
