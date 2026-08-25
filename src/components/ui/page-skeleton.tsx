import { PageHeader } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { Skeleton, TableSkeleton } from '@/components/ui/states'

/**
 * Lo que se ve mientras el servidor arma la página.
 *
 * Todas las pantallas se renderizan en el servidor con varias consultas. Sin
 * esto, tocar un ítem del menú dejaba la pantalla anterior quieta y sin señal:
 * desde el teléfono se lee como que la aplicación se colgó, y la gente vuelve a
 * tocar.
 *
 * Se muestra el título real -- ya se sabe cuál es -- y sólo el contenido queda
 * en gris. Así no salta todo el diseño cuando llegan los datos.
 */
export function PageSkeleton({
  title,
  description,
  stats = false,
  rows = 8,
}: {
  title: string
  description?: string
  /** Reservá el lugar de la tira de cifras si la página la tiene. */
  stats?: boolean
  rows?: number
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="space-y-6 px-5 py-6 sm:px-8" aria-busy="true">
        {stats ? <Skeleton className="h-[104px] w-full rounded-xl" /> : null}
        <Card>
          <TableSkeleton rows={rows} />
        </Card>
        <span className="sr-only" role="status">
          Cargando…
        </span>
      </div>
    </>
  )
}
