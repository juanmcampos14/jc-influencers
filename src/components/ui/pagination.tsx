import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { hrefCon } from '@/lib/util/query'

/**
 * Paginación única para todas las listas.
 *
 * Estaba copiada en cuatro archivos, y cada copia armaba la URL desde cero: al
 * pasar de página se perdían los filtros y aparecía otra lista sin avisar.
 * Acá la URL sale de los parámetros actuales, así que lo elegido sobrevive.
 */
export function Pagination({
  base,
  params,
  page,
  pageCount,
  total,
  unidad,
}: {
  /** Ruta sin parámetros, por ejemplo `/campanas`. */
  base: string
  /** Los parámetros que trae la página ahora mismo. */
  params: URLSearchParams | Record<string, string | string[] | undefined>
  page: number
  pageCount: number
  total: number
  /** Cómo se llama lo que se lista: "campañas", "influencers". */
  unidad: string
}) {
  const t = useTranslations('general')
  if (pageCount <= 1) return null

  const boton =
    'inline-flex min-h-11 items-center gap-1 rounded-lg border border-ink-300 px-3 text-sm text-ink-800 transition-colors hover:border-ink-400 hover:bg-ink-50'

  return (
    <nav
      aria-label={t('paginacionDe', { unidad })}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 px-5 py-3 text-sm"
    >
      <p className="text-ink-500">
        {t('paginaDe', { pagina: page, total: pageCount, cantidad: total, unidad })}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link rel="prev" href={hrefCon(base, params, { pagina: page - 1 })} className={boton}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            {t('anterior')}
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link rel="next" href={hrefCon(base, params, { pagina: page + 1 })} className={boton}>
            {t('siguiente')}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </nav>
  )
}
