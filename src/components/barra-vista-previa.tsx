import { Eye } from 'lucide-react'
import { salirDeVistaPreviaAction } from '@/app/(app)/actions/vista-previa'

/**
 * La barra de la vista previa.
 *
 * Va arriba de todo, fija, y con un color que no se parece a nada más del
 * producto. No es decoración: alguien que se olvida de que está en vista previa
 * concluye que al cliente le falta información, o peor, que le sobra.
 *
 * Dice las tres cosas que importan: qué está viendo, que es sólo lectura, y
 * cómo salir.
 */
export function BarraDeVistaPrevia({ nombreDelCliente }: { nombreDelCliente: string }) {
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-amber-400 px-4 py-2 text-ink-950">
      <p className="flex items-center gap-2 text-sm">
        <Eye className="size-4 shrink-0" aria-hidden="true" />
        <span>
          Estás viendo el espacio <strong>como lo ve {nombreDelCliente}</strong>. Es sólo lectura: no podés aprobar ni
          comentar en su nombre.
        </span>
      </p>
      <form action={salirDeVistaPreviaAction}>
        <button
          type="submit"
          className="rounded-lg bg-ink-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-800"
        >
          Salir de la vista del cliente
        </button>
      </form>
    </div>
  )
}
