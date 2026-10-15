"use client"

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/field'

/**
 * Selección de filas, compartida por todas las listas.
 *
 * Salió de la de influencers, que era la única que la tenía. Tres reglas que
 * costaron aprenderse y que ahora valen para todas:
 *
 *  - El estado vive en el proveedor y no en cada fila, para que la barra sepa
 *    cuántos hay elegidos.
 *  - Se limpia al cambiar de página o de orden: actuar sobre filas que ya no
 *    están en pantalla es la forma más fácil de hacer algo sin querer.
 *  - "Elegir todo" elige lo que se ve, y lo dice con el número. Un "todo" que
 *    en realidad son 50 de 3.000 es una mentira que se paga cara al borrar.
 */
type Contexto = {
  elegidos: ReadonlySet<string>
  alternar: (id: string) => void
  limpiar: () => void
}

const Ctx = React.createContext<Contexto | null>(null)

export function useSeleccion(): Contexto | null {
  return React.useContext(Ctx)
}

export function Seleccion({
  idsDeLaPagina,
  etiqueta = 'elegidos',
  children,
  acciones,
}: {
  /** Lo que hay en pantalla ahora. Su firma reinicia la selección. */
  idsDeLaPagina: string[]
  /** Cómo se llaman en plural: "elegidos", "elegidas". */
  etiqueta?: string
  children: React.ReactNode
  /** Qué se puede hacer con lo elegido. Recibe los ids y una forma de limpiar. */
  acciones: (elegidos: string[], limpiar: () => void) => React.ReactNode
}) {
  const t = useTranslations('general')
  const [elegidos, setElegidos] = React.useState<ReadonlySet<string>>(new Set())

  const firma = idsDeLaPagina.join(',')
  React.useEffect(() => {
    setElegidos(new Set())
  }, [firma])

  const alternar = React.useCallback((id: string) => {
    setElegidos((actual) => {
      const proximo = new Set(actual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }, [])

  const limpiar = React.useCallback(() => setElegidos(new Set()), [])

  const todos = idsDeLaPagina.length > 0 && idsDeLaPagina.every((id) => elegidos.has(id))
  const valor = React.useMemo(() => ({ elegidos, alternar, limpiar }), [elegidos, alternar, limpiar])

  return (
    <Ctx.Provider value={valor}>
      {idsDeLaPagina.length > 0 ? (
        <div className="mb-3 flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-600">
            <Checkbox
              checked={todos}
              onChange={(event) => setElegidos(event.target.checked ? new Set(idsDeLaPagina) : new Set())}
            />
            {t('elegirDeLaPagina', { cantidad: idsDeLaPagina.length })}
          </label>
        </div>
      ) : null}

      {children}

      {elegidos.size > 0 ? (
        /*
         * Barra flotante abajo: con doscientas filas, un botón arriba de todo
         * obliga a volver al principio después de elegir.
         */
        <div className="sticky bottom-4 z-30 mx-auto mt-4 flex w-fit max-w-full flex-wrap items-center gap-3 rounded-xl border border-ink-300 bg-surface px-4 py-3 shadow-lg">
          <span className="text-sm font-medium text-ink-900">
            {elegidos.size} {etiqueta}
          </span>
          {acciones([...elegidos], limpiar)}
          <Button size="sm" variant="ghost" onClick={limpiar}>
            <X className="size-4" aria-hidden="true" />
            {t('quitarSeleccion')}
          </Button>
        </div>
      ) : null}
    </Ctx.Provider>
  )
}

/** Casilla de una fila. Sin selección activa no se renderiza nada. */
export function CasillaDeFila({
  id,
  nombre,
  deshabilitada = false,
}: {
  id: string
  nombre: string
  /**
   * Para la fila sobre la que la acción no tiene sentido --ya importada, ya
   * resuelta--. Se deja la casilla en su lugar en vez de sacarla: si desaparece,
   * las columnas se corren y cuesta seguir la fila con la vista.
   */
  deshabilitada?: boolean
}) {
  const tFila = useTranslations('general')
  const contexto = React.useContext(Ctx)
  if (!contexto) return null
  return (
    <Checkbox
      aria-label={tFila('elegirFila', { nombre })}
      disabled={deshabilitada}
      checked={!deshabilitada && contexto.elegidos.has(id)}
      onChange={() => contexto.alternar(id)}
    />
  )
}
