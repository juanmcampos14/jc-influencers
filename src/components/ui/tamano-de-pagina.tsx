import Link from 'next/link'
import { cn } from '@/lib/util/format'

/**
 * Cuántas filas por página.
 *
 * Vive en la URL como el resto de los filtros: la elección sobrevive a
 * recargar, a compartir el enlace y al botón "atrás".
 *
 * Al cambiarlo se vuelve a la primera página. Si no, alguien parado en la
 * página 7 de 25 filas que pide 200 cae en una página que ya no existe y ve
 * una lista vacía sin entender por qué.
 */
const OPCIONES = [25, 50, 100, 250, 500] as const

export function TamanoDePagina({
  base,
  params,
  actual,
  total,
}: {
  /** Ruta sin parámetros, por ejemplo `/influencers`. */
  base: string
  /** Los parámetros actuales, para no pisar los filtros al cambiar el tamaño. */
  params: URLSearchParams | Record<string, string | string[] | undefined>
  actual: number
  /** Cuántos hay en total, para no ofrecer tamaños que no hacen nada. */
  total: number
}) {
  const utiles = OPCIONES.filter((opcion, indice) => opcion <= total || OPCIONES[indice - 1] === undefined || OPCIONES[indice - 1]! < total)
  if (utiles.length <= 1) return null

  const href = (tamano: number): string => {
    const query = new URLSearchParams()
    const entradas =
      params instanceof URLSearchParams ? [...params.entries()] : Object.entries(params)
    for (const [clave, valor] of entradas) {
      // La página vuelve a la primera: si no, quien está en la 7 de 25 y pide
      // 200 cae en una página que ya no existe y ve una lista vacía.
      if (clave === 'porPagina' || clave === 'pagina') continue
      const uno = Array.isArray(valor) ? valor[0] : valor
      if (uno) query.set(clave, uno)
    }
    query.set('porPagina', String(tamano))
    return `${base}?${query.toString()}`
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-600">
      <span>Mostrar</span>
      {utiles.map((opcion) => (
        <Link
          key={opcion}
          href={href(opcion)}
          aria-current={opcion === actual ? 'page' : undefined}
          className={cn(
            'flex min-h-11 items-center rounded-lg border px-2.5 tabular-nums transition-colors',
            opcion === actual
              ? 'border-ink-900 bg-ink-900 font-medium text-surface'
              : 'border-ink-200 hover:border-ink-400',
          )}
        >
          {opcion}
        </Link>
      ))}
      <span>por página</span>
    </div>
  )
}
