"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm'

export type ResultadoDeLote = {
  hechos: number
  omitidos: Array<{ nombre: string; motivo: string }>
}

/**
 * Ejecuta una acción en lote y cuenta lo que realmente pasó.
 *
 * El aviso NUNCA dice sólo cuántos salieron bien. Si alguno quedó afuera se
 * nombra y se dice por qué: la mitad de las veces el motivo es una regla del
 * producto -- "participó de campañas, fusionalo o archivalo" -- y esconderla
 * deja al usuario creyendo que terminó una tarea que no terminó.
 */
export function useAccionDeLote() {
  const router = useRouter()
  const [pendiente, startTransition] = React.useTransition()

  const ejecutar = React.useCallback(
    (
      correr: () => Promise<{ ok: true; data: ResultadoDeLote } | { ok: false; message: string } | null>,
      textos: { singular: string; plural: string; verbo: string },
      alTerminar?: () => void,
    ) => {
      startTransition(async () => {
        const resultado = await correr().catch(() => null)
        if (!resultado) {
          toast.error('No se pudo completar. Reintentá en un momento.')
          return
        }
        if (!resultado.ok) {
          toast.error(resultado.message)
          return
        }

        const { hechos, omitidos } = resultado.data
        const cosa = hechos === 1 ? textos.singular : textos.plural

        if (hechos === 0) {
          const detalle = omitidos[0]
          toast.error(
            omitidos.length === 1 && detalle
              ? `${detalle.nombre}: ${detalle.motivo}`
              : `No se ${textos.verbo} ninguno. ${omitidos.length} quedaron afuera.`,
            { description: omitidos.length > 1 ? listar(omitidos) : undefined, duration: 8000 },
          )
          return
        }

        if (omitidos.length > 0) {
          // Éxito parcial: se cuenta como aviso, no como éxito. Un tilde verde
          // sobre "12 de 20" hace que nadie lea el resto de la frase.
          toast.warning(`${hechos} ${cosa}. ${omitidos.length} quedaron afuera.`, {
            description: listar(omitidos),
            duration: 10000,
          })
        } else {
          toast.success(`${hechos} ${cosa}.`)
        }

        alTerminar?.()
        router.refresh()
      })
    },
    [router],
  )

  return { ejecutar, pendiente }
}

function listar(omitidos: ResultadoDeLote['omitidos']): string {
  const primeros = omitidos.slice(0, 4).map((o) => `${o.nombre}: ${o.motivo}`)
  if (omitidos.length > 4) primeros.push(`…y ${omitidos.length - 4} más.`)
  return primeros.join('\n')
}

/** Botón de lote que pide confirmación antes de algo que no se deshace. */
export function BotonDeLote({
  children,
  onConfirm,
  pendiente,
  confirmacion,
  variant = 'secondary',
}: {
  children: React.ReactNode
  onConfirm: () => void
  pendiente: boolean
  /** Si viene, se confirma primero. Para lo reversible, no hace falta. */
  confirmacion?: { title: string; description: string; confirmLabel: string }
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) {
  if (!confirmacion) {
    return (
      <Button size="sm" variant={variant} onClick={onConfirm} disabled={pendiente}>
        {children}
      </Button>
    )
  }
  return (
    <ConfirmButton
      title={confirmacion.title}
      description={confirmacion.description}
      confirmLabel={confirmacion.confirmLabel}
      onConfirm={onConfirm}
      pending={pendiente}
    >
      <Button size="sm" variant={variant} disabled={pendiente}>
        {children}
      </Button>
    </ConfirmButton>
  )
}
