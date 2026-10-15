import type { Frase } from './frase'

/**
 * Objetivos de campaña, y si se cumplieron.
 *
 * La regla que decide si esto sirve o es decoración: **un objetivo cuya métrica
 * no tiene dato no vale cero por ciento**. Vale "todavía no se puede evaluar".
 *
 * La diferencia importa porque una barra de progreso en cero se lee como un
 * fracaso, y en una reunión con el cliente eso es lo peor que puede pasar: la
 * agencia termina defendiéndose de un número que en realidad significa que
 * nadie cargó las métricas todavía.
 */

export type Metrica =
  | 'ALCANCE_ESTIMADO'
  | 'ALCANCE_REAL'
  | 'VISUALIZACIONES'
  | 'INTERACCIONES'
  | 'CLICS'
  | 'PUBLICACIONES'
  | 'PERFILES_APROBADOS'
  | 'INVERSION_EN_TALENTO'

export type Direccion = 'AL_MENOS' | 'COMO_MUCHO'

export type Estado = 'CUMPLIDO' | 'EN_CAMINO' | 'NO_ALCANZADO' | 'SIN_DATO'

export type Objetivo = {
  id: string
  metric: Metrica
  direction: Direccion
  target: number
  rationale: string | null
  clientVisible: boolean
}

/**
 * Lo que se pudo medir.
 *
 * `null` significa que nadie cargó ese dato. Es distinto de `0`, que significa
 * que se midió y dio cero. Todo este archivo existe para no confundir las dos
 * cosas.
 */
export type Mediciones = Record<Metrica, number | null>

export type ObjetivoEvaluado = Objetivo & {
  /** Cuánto va. Null cuando no hay dato. */
  actual: number | null
  estado: Estado
  /** 0 a 100, o null si no se puede calcular. Puede pasarse de 100. */
  progreso: number | null
  /** Una frase que explica el estado. Es lo que se lee, más que el número. */
  explicacion: Frase
}

/**
 * El nombre de cada métrica y de dónde sale su número.
 *
 * Los dos viven en `messages/*.json` bajo `objetivos`: `metrica<X>` y
 * `fuente<X>`. Sin la segunda, ningún objetivo se puede defender --"alcance
 * estimado" y "alcance real" parecen lo mismo-- así que es texto de producto,
 * no un comentario.
 */
export const claveDeMetrica = (metrica: Metrica): string => `metrica${metrica}`
export const claveDeFuente = (metrica: Metrica): string => `fuente${metrica}`

/**
 * Métricas que se pueden mostrar en el portal del cliente.
 *
 * La inversión en talento queda afuera aunque el objetivo esté marcado como
 * visible: es lo que la agencia le paga al influencer, y de ahí se deduce el
 * margen. La visibilidad se decide en dos lados a propósito.
 */
const NUNCA_PARA_EL_CLIENTE = new Set<Metrica>(['INVERSION_EN_TALENTO'])

export const esVisibleParaCliente = (objetivo: Objetivo): boolean =>
  objetivo.clientVisible && !NUNCA_PARA_EL_CLIENTE.has(objetivo.metric)

/**
 * Contexto de la evaluación.
 *
 * `cerrada` cambia el significado de estar por debajo del objetivo, y no es un
 * detalle: mientras la campaña corre, ir al 40% es ir en camino. Una vez que
 * cerró, ese mismo 40% es un objetivo que no se alcanzó. Sin esta distinción el
 * producto le diría "no alcanzado" a una campaña que arrancó ayer.
 */
export type ContextoDeEvaluacion = { cerrada: boolean }

export function evaluarObjetivo(
  objetivo: Objetivo,
  mediciones: Mediciones,
  contexto: ContextoDeEvaluacion = { cerrada: false },
): ObjetivoEvaluado {
  const actual = mediciones[objetivo.metric]

  if (actual === null) {
    return {
      ...objetivo,
      actual: null,
      estado: 'SIN_DATO',
      progreso: null,
      explicacion: { clave: 'expSinDato', valores: { metrica: objetivo.metric } },
    }
  }

  if (objetivo.target <= 0) {
    return {
      ...objetivo,
      actual,
      estado: 'SIN_DATO',
      progreso: null,
      explicacion: { clave: 'expObjetivoEnCero' },
    }
  }

  if (objetivo.direction === 'COMO_MUCHO') {
    // Acá el éxito es NO pasarse, así que el progreso es cuánto del tope se usó.
    const usado = (actual / objetivo.target) * 100
    const cumplido = actual <= objetivo.target
    return {
      ...objetivo,
      actual,
      estado: cumplido ? 'CUMPLIDO' : 'NO_ALCANZADO',
      progreso: usado,
      explicacion: cumplido
        ? { clave: 'expDentroDelTope', valores: { pct: Math.round(usado) } }
        : { clave: 'expSePaso', valores: { exceso: redondear(actual - objetivo.target) } },
    }
  }

  const progreso = (actual / objetivo.target) * 100
  if (actual >= objetivo.target) {
    return {
      ...objetivo,
      actual,
      estado: 'CUMPLIDO',
      progreso,
      explicacion:
        progreso >= 110
          ? { clave: 'expPorEncima', valores: { pct: Math.round(progreso) } }
          : { clave: 'expCumplido' },
    }
  }

  const falta = redondear(objetivo.target - actual)
  return {
    ...objetivo,
    actual,
    estado: contexto.cerrada ? 'NO_ALCANZADO' : 'EN_CAMINO',
    progreso,
    explicacion: contexto.cerrada
      ? { clave: 'expQuedoEn', valores: { pct: Math.round(progreso), falta } }
      : { clave: 'expVaEn', valores: { pct: Math.round(progreso), falta } },
  }
}

const redondear = (valor: number): string =>
  Number.isInteger(valor) ? String(valor) : valor.toFixed(2)

export type ResumenDeObjetivos = {
  objetivos: ObjetivoEvaluado[]
  cumplidos: number
  enCamino: number
  noAlcanzados: number
  sinDato: number
  /**
   * El veredicto de la campaña en una frase. Null cuando no hay objetivos: el
   * producto no opina sobre una campaña que nadie se propuso medir.
   */
  veredicto: Frase | null
}

export function evaluarObjetivos(
  objetivos: Objetivo[],
  mediciones: Mediciones,
  contexto: ContextoDeEvaluacion = { cerrada: false },
): ResumenDeObjetivos {
  const evaluados = objetivos.map((objetivo) => evaluarObjetivo(objetivo, mediciones, contexto))
  const cuenta = (estado: Estado) => evaluados.filter((o) => o.estado === estado).length

  const cumplidos = cuenta('CUMPLIDO')
  const enCamino = cuenta('EN_CAMINO')
  const noAlcanzados = cuenta('NO_ALCANZADO')
  const sinDato = cuenta('SIN_DATO')

  return {
    objetivos: evaluados,
    cumplidos,
    enCamino,
    noAlcanzados,
    sinDato,
    veredicto: veredictoDe(evaluados.length, cumplidos, enCamino, noAlcanzados, sinDato),
  }
}

function veredictoDe(
  total: number,
  cumplidos: number,
  enCamino: number,
  noAlcanzados: number,
  sinDato: number,
): Frase | null {
  if (total === 0) return null

  /*
   * Con más de la mitad sin dato no se dice nada sobre la campaña. Opinar sobre
   * el 40% que sí se cargó y presentarlo como el estado general es la forma más
   * fácil de que un reporte diga lo contrario de lo que pasó.
   */
  if (sinDato > total / 2) {
    return { clave: 'verSinDatos', valores: { sinDato, total } }
  }
  if (cumplidos === total) return { clave: 'verTodosCumplidos' }
  if (noAlcanzados === 0 && enCamino > 0) {
    return { clave: 'verRestoEnCamino', valores: { cumplidos, total } }
  }
  if (noAlcanzados > 0) {
    return sinDato > 0
      ? { clave: 'verNoAlcanzadosConSinDato', valores: { cantidad: noAlcanzados, sinDato } }
      : { clave: 'verNoAlcanzados', valores: { cantidad: noAlcanzados } }
  }
  return { clave: 'verCumplidosDeTotal', valores: { cumplidos, total } }
}
