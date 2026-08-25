"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox, Select } from '@/components/ui/field'
import { addToCampaignAction } from '../actions/candidacies'

export type CampanaElegible = { id: string; name: string; clientName: string }

/**
 * Selección de influencers y qué hacer con ellos.
 *
 * La base era una lista para mirar: encontrabas a alguien que servía y no había
 * nada que hacer con eso. Había que anotarse el nombre, ir a la campaña y
 * buscarlo de nuevo.
 *
 * El estado vive acá arriba y no en cada fila para que la barra sepa cuántos
 * hay elegidos. Se limpia al cambiar de página: seleccionar cosas que ya no se
 * ven es la forma más fácil de hacer algo sin querer.
 */
const Contexto = React.createContext<{
  elegidos: Set<string>
  alternar: (id: string) => void
} | null>(null)

export function SeleccionDeInfluencers({
  campanas,
  idsDeLaPagina,
  children,
}: {
  campanas: CampanaElegible[]
  /** Lo que hay en pantalla ahora, para el "elegir todos". */
  idsDeLaPagina: string[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const [elegidos, setElegidos] = React.useState<Set<string>>(new Set())
  const [campana, setCampana] = React.useState<string>(campanas[0]?.id ?? '')
  const [pendiente, startTransition] = React.useTransition()

  // Al cambiar de página la selección deja de tener sentido.
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

  const todosElegidos = idsDeLaPagina.length > 0 && idsDeLaPagina.every((id) => elegidos.has(id))

  function agregar() {
    const elegida = campanas.find((c) => c.id === campana)
    if (!elegida) return
    startTransition(async () => {
      const resultado = await addToCampaignAction({ campaignId: campana, influencerIds: [...elegidos] })
      if (!resultado.ok) {
        toast.error(resultado.message)
        return
      }
      const { added, alreadyThere } = resultado.data
      // Los que ya estaban se dicen: "agregué 12" cuando agregaste 7 es una
      // mentira chica que después cuesta cara.
      const partes = [`${added} ${added === 1 ? 'influencer agregado' : 'influencers agregados'} a ${elegida.name}`]
      if (alreadyThere > 0) partes.push(`${alreadyThere} ya ${alreadyThere === 1 ? 'estaba' : 'estaban'}`)
      toast.success(`${partes.join(' · ')}.`)
      setElegidos(new Set())
      router.refresh()
    })
  }

  return (
    <Contexto.Provider value={{ elegidos, alternar }}>
      {campanas.length > 0 ? (
        <div className="mb-3 flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-600">
            <Checkbox
              checked={todosElegidos}
              onChange={(event) => setElegidos(event.target.checked ? new Set(idsDeLaPagina) : new Set())}
            />
            Elegir los {idsDeLaPagina.length} de esta página
          </label>
        </div>
      ) : null}

      {children}

      {elegidos.size > 0 && campanas.length > 0 ? (
        /*
         * Barra flotante: con doscientas filas, un botón arriba de todo obliga
         * a volver al principio después de elegir.
         */
        <div className="sticky bottom-4 z-30 mx-auto mt-4 flex w-fit max-w-full flex-wrap items-center gap-3 rounded-xl border border-ink-300 bg-surface px-4 py-3 shadow-lg">
          <span className="text-sm font-medium text-ink-900">
            {elegidos.size} {elegidos.size === 1 ? 'elegido' : 'elegidos'}
          </span>
          <Select
            aria-label="Campaña de destino"
            value={campana}
            onChange={(event) => setCampana(event.target.value)}
            className="h-9 w-56"
          >
            {campanas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.clientName}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={agregar} disabled={pendiente || !campana}>
            <Plus className="size-4" aria-hidden="true" />
            {pendiente ? 'Agregando…' : 'Agregar a la campaña'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setElegidos(new Set())} disabled={pendiente}>
            <X className="size-4" aria-hidden="true" />
            Quitar selección
          </Button>
        </div>
      ) : null}
    </Contexto.Provider>
  )
}

/** Casilla de una fila. Sin selección activa no se renderiza nada. */
export function CasillaDeFila({ id, nombre }: { id: string; nombre: string }) {
  const contexto = React.useContext(Contexto)
  if (!contexto) return null
  return (
    <Checkbox
      aria-label={`Elegir ${nombre}`}
      checked={contexto.elegidos.has(id)}
      onChange={() => contexto.alternar(id)}
    />
  )
}
