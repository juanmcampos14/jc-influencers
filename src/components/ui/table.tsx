import * as React from 'react'
import { cn } from '@/lib/util/format'

/**
 * Contenedor de tabla. Desplaza en HORIZONTAL y nada más.
 *
 * No le pongas una altura máxima. `overflow-x: auto` obliga al eje vertical a
 * valer `auto` también, así que un `max-h` acá crea un SEGUNDO scroll vertical
 * adentro del de la página: la tabla se corta, pero el documento sigue midiendo
 * lo que mide la tabla entera. Resultado: cientos de píxeles en blanco después
 * del final del contenido, la barra lateral se despega y la rueda del mouse
 * hace una cosa distinta según dónde esté el puntero.
 *
 * Medido en producción sobre una campaña de 75 perfiles: el cuerpo medía 1392px
 * y el documento 3590. Se pierde el encabezado fijo de la tabla, y está bien:
 * una sola barra de scroll vale más que un encabezado pegado.
 */
export function TableWrap({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('w-full overflow-x-auto', className)} {...props} />
}

/**
 * Primera columna anclada al borde izquierdo.
 *
 * En una tabla de once columnas, al desplazarse a la derecha se pierde de vista
 * de quién es cada fila. Se aplica en `Th` y `Td` de la primera columna.
 */
export const columnaFija = 'sticky left-0 z-20 bg-surface'

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-ink-200 bg-surface-2/95 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500 backdrop-blur',
        className,
      )}
      {...props}
    />
  )
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-ink-100 px-3 py-3 align-middle text-ink-800', className)} {...props} />
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors hover:bg-ink-50/70', className)} {...props} />
}
