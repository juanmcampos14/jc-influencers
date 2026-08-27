import Link from 'next/link'
import { cn } from '@/lib/util/format'

/**
 * Navegación de segundo nivel dentro de una sección.
 *
 * Existe porque Influencers dejó de ser una pantalla y pasó a ser una sección
 * con cuatro lugares. Antes, "Scouting" vivía suelto en la barra lateral y
 * terminó teniendo su propia lista de gente, casi igual a la de Influencers:
 * dos listas de personas, dos formularios de filtros y dos formas de ordenar
 * para lo mismo.
 *
 * Es un `<nav>` con enlaces reales, no botones con estado: cada lugar tiene su
 * URL, se puede compartir, abrir en otra pestaña y el botón "atrás" funciona.
 * El lugar actual se marca con `aria-current`, que es lo que leen los lectores
 * de pantalla, además del subrayado.
 *
 * No lleva números. Un número suelto al lado de un nombre no dice de qué es
 * --¿208 qué?--, y donde sí tenía sentido ya estaba dicho con todas las letras
 * en la tira de estadísticas de la pantalla. Además obligaba a contar lo mismo
 * en las cuatro páginas, y contar de más en algunas hacía que la misma
 * navegación se viera distinta según dónde estuvieras parado.
 */

export type ItemDeSubNav = {
  href: string
  etiqueta: string
  /** Descripción corta para el `title`, cuando el nombre no alcanza. */
  ayuda?: string
}

export function SubNav({
  items,
  activo,
  etiqueta,
  className,
}: {
  items: ItemDeSubNav[]
  /** El `href` del lugar actual. */
  activo: string
  /** Cómo se llama esta navegación para quien no la ve. */
  etiqueta: string
  className?: string
}) {
  return (
    <nav
      aria-label={etiqueta}
      className={cn('mb-5 -mx-1 overflow-x-auto border-b border-ink-200', className)}
    >
      <ul className="flex min-w-max gap-1 px-1">
        {items.map((item) => {
          const esActivo = item.href === activo
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={esActivo ? 'page' : undefined}
                title={item.ayuda}
                className={cn(
                  /*
                   * `min-h-11` son los 44px de alto mínimo para que se pueda
                   * tocar con el dedo sin errarle.
                   */
                  'flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  esActivo
                    ? 'border-primary font-medium text-ink-900'
                    : 'border-transparent text-ink-600 hover:border-ink-200 hover:text-ink-900',
                )}
              >
                {item.etiqueta}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
