import Link from 'next/link'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { Th } from '@/components/ui/table'
import { cn } from '@/lib/util/format'
import { proximaDireccion, type ColumnaOrdenable, type Orden } from '@/lib/domain/orden'
import { hrefCon } from '@/lib/util/query'

/**
 * Encabezado de columna que ordena.
 *
 * Es un enlace, no un botón con JavaScript: el orden vive en la URL, así que se
 * puede compartir, volver atrás y recargar sin perderlo. Y conserva el resto de
 * los parámetros -- filtros incluidos -- porque ordenar no es filtrar de nuevo.
 *
 * Al ordenar se vuelve a la página 1: quedarse en la 7 después de reordenar
 * muestra un tramo del medio de otra lista, que es peor que no ordenar.
 */
export function ThOrdenable<Clave extends string>({
  columna,
  orden,
  base,
  params,
  children,
  className,
  alineado = 'izquierda',
}: {
  columna: ColumnaOrdenable<Clave>
  orden: Orden<Clave>
  /** Ruta de la lista, sin parámetros. */
  base: string
  /** Los parámetros actuales, para no pisar los filtros. */
  params: Record<string, string | string[] | undefined>
  children: React.ReactNode
  className?: string
  alineado?: 'izquierda' | 'derecha'
}) {
  const activa = orden.clave === columna.clave
  const proxima = proximaDireccion(columna, orden)
  const href = hrefCon(base, params, { orden: columna.clave, dir: proxima, page: null })

  const Icono = activa ? (orden.direccion === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown

  return (
    <Th className={className} aria-sort={activa ? (orden.direccion === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <Link
        href={href}
        className={cn(
          'inline-flex items-center gap-1 rounded hover:text-ink-800',
          alineado === 'derecha' && 'flex-row-reverse',
          activa && 'text-ink-800',
        )}
        title={`Ordenar por ${typeof children === 'string' ? children.toLowerCase() : 'esta columna'}${
          proxima === 'asc' ? ', de menor a mayor' : ', de mayor a menor'
        }`}
      >
        {children}
        <Icono className={cn('size-3', activa ? 'opacity-100' : 'opacity-35')} aria-hidden="true" />
      </Link>
    </Th>
  )
}
