/**
 * Qué idiomas habla la plataforma, y cómo se decide cuál mostrar.
 *
 * El idioma NO va en la URL. Esta aplicación vive detrás de un login: no hay
 * nada que indexar, nadie comparte un enlace para que se abra en otro idioma, y
 * meterlo en la ruta obligaría a reescribir cada enlace del producto y el
 * middleware entero. La elección viaja en una cookie, que es lo que
 * corresponde a una herramienta de trabajo privada.
 */

export const IDIOMAS = ['es', 'en'] as const
export type Idioma = (typeof IDIOMAS)[number]

export const IDIOMA_POR_DEFECTO: Idioma = 'es'

export const NOMBRE_DE_IDIOMA: Record<Idioma, string> = {
  es: 'Español',
  en: 'English',
}

/** La cookie donde queda la elección explícita. Un año. */
export const COOKIE_DE_IDIOMA = 'jc_idioma'
export const DURACION_DE_COOKIE = 60 * 60 * 24 * 365

export const esIdioma = (valor: unknown): valor is Idioma =>
  typeof valor === 'string' && (IDIOMAS as readonly string[]).includes(valor)

/**
 * Países donde se asume español.
 *
 * Es el último recurso, no el primero: alguien de Buenos Aires de viaje por
 * Estados Unidos sigue queriendo la plataforma en español, y su navegador lo
 * dice. Por eso la ubicación sólo decide cuando el navegador no dijo nada.
 */
const PAISES_HISPANOHABLANTES = new Set([
  'AR', 'BO', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'ES', 'GQ',
  'GT', 'HN', 'MX', 'NI', 'PA', 'PE', 'PR', 'PY', 'SV', 'UY', 'VE',
])

/**
 * Lee la cabecera `Accept-Language` y devuelve el primer idioma que hablamos.
 *
 * Respeta el orden de preferencia del navegador --y sus pesos `q`-- en vez de
 * quedarse con el primero que aparezca: alguien con "en;q=0.9, es;q=1.0" quiere
 * español, aunque el inglés esté escrito antes.
 */
export function idiomaDeCabecera(acceptLanguage: string | null | undefined): Idioma | null {
  if (!acceptLanguage) return null

  const candidatos = acceptLanguage
    .split(',')
    .map((parte) => {
      const [etiqueta, ...params] = parte.trim().split(';')
      const q = params.find((p) => p.trim().startsWith('q='))
      const peso = q ? Number(q.split('=')[1]) : 1
      return { base: (etiqueta ?? '').trim().toLowerCase().split('-')[0] ?? '', peso: Number.isFinite(peso) ? peso : 0 }
    })
    .filter((c) => c.base.length > 0)
    .sort((a, b) => b.peso - a.peso)

  for (const c of candidatos) {
    if (esIdioma(c.base)) return c.base
  }
  return null
}

/** Idioma sugerido por el país, cuando no hay nada mejor. */
export function idiomaDePais(pais: string | null | undefined): Idioma | null {
  if (!pais) return null
  return PAISES_HISPANOHABLANTES.has(pais.toUpperCase()) ? 'es' : 'en'
}

/**
 * La decisión completa, en orden de autoridad.
 *
 *   1. lo que la persona ELIGIÓ (cookie) — manda siempre
 *   2. lo que pide su navegador (`Accept-Language`)
 *   3. desde dónde se conecta (país)
 *   4. español
 *
 * Que la elección explícita vaya primera no es un detalle: si la ubicación
 * pudiera darla vuelta, alguien que eligió inglés en Buenos Aires vería la
 * plataforma volver al español en cada recarga, sin entender por qué.
 */
export function resolverIdioma(entrada: {
  cookie?: string | null
  acceptLanguage?: string | null
  pais?: string | null
}): Idioma {
  if (esIdioma(entrada.cookie)) return entrada.cookie
  return idiomaDeCabecera(entrada.acceptLanguage) ?? idiomaDePais(entrada.pais) ?? IDIOMA_POR_DEFECTO
}
