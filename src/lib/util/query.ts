/**
 * Enlaces que conservan lo que el usuario ya eligió.
 *
 * Cada paginación armaba su URL desde cero, así que pasar a la página 2 --o
 * cambiar de pestaña-- borraba los filtros y devolvía otra lista sin avisar.
 * Es el peor tipo de error: no falla nada, simplemente estás mirando datos que
 * no son los que pediste, y podés tomar una decisión sobre la lista equivocada.
 */

type Entrada = URLSearchParams | Record<string, string | string[] | undefined>

function aParams(actual: Entrada): URLSearchParams {
  if (actual instanceof URLSearchParams) return new URLSearchParams(actual)
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(actual)) {
    if (valor === undefined) continue
    if (Array.isArray(valor)) valor.forEach((v) => params.append(clave, v))
    else params.set(clave, valor)
  }
  return params
}

/**
 * Devuelve `base` con los parámetros actuales y sólo `cambios` pisados.
 * Un valor `null` borra ese parámetro.
 */
export function hrefCon(base: string, actual: Entrada, cambios: Record<string, string | number | null>): string {
  const params = aParams(actual)
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === null || valor === '') params.delete(clave)
    else params.set(clave, String(valor))
  }
  const cadena = params.toString()
  return cadena ? `${base}?${cadena}` : base
}
