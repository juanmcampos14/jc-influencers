"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import {
  archivarCampanas,
  archivarClientes,
  borrarInfluencers,
  cambiarEstadoDeInfluencers,
  cerrarCampanas,
  fusionarDuplicados,
} from '@/lib/repos/lote'
import { dismissDuplicate } from '@/lib/repos/influencers'
import { importarDescubiertos } from '@/lib/repos/base-conocimiento'

/*
 * Hasta 500 porque la lista de Descubiertos puede mostrar 500 por página y
 * "elegir todos" tiene que poder importarlos. El repositorio vuelve a acotar,
 * que es donde el tope de verdad tiene que estar.
 */
const ids = z.array(z.string().min(1).max(60)).min(1).max(500)

export const archivarClientesAction = defineAction(
  z.object({ ids, destino: z.enum(['ARCHIVED', 'ACTIVE']) }),
  async (input, ctx) => {
    const resultado = await archivarClientes(ctx, input.ids, input.destino)
    revalidatePath('/clientes')
    revalidatePath('/panel')
    return resultado
  },
)

export const archivarCampanasAction = defineAction(
  z.object({ ids, archivar: z.boolean() }),
  async (input, ctx) => {
    const resultado = await archivarCampanas(ctx, input.ids, input.archivar)
    revalidatePath('/campanas')
    revalidatePath('/panel')
    // El portal del cliente también cambia: archivar es cómo deja de verla.
    revalidatePath('/portal')
    return resultado
  },
)

export const cerrarCampanasAction = defineAction(
  z.object({ ids, destino: z.enum(['CLOSED', 'CANCELLED']) }),
  async (input, ctx) => {
    const resultado = await cerrarCampanas(ctx, input.ids, input.destino)
    revalidatePath('/campanas')
    revalidatePath('/panel')
    revalidatePath('/portal')
    return resultado
  },
)

export const estadoDeInfluencersAction = defineAction(
  z.object({ ids, destino: z.enum(['ARCHIVED', 'ACTIVE', 'BACKLOG', 'BLOCKED']) }),
  async (input, ctx) => {
    const resultado = await cambiarEstadoDeInfluencers(ctx, input.ids, input.destino)
    revalidatePath('/influencers')
    return resultado
  },
)

export const borrarInfluencersAction = defineAction(z.object({ ids }), async (input, ctx) => {
  const resultado = await borrarInfluencers(ctx, input.ids)
  revalidatePath('/influencers')
  return resultado
})

/**
 * Descarta varios duplicados de una vez.
 *
 * Descartar no borra a nadie: marca que ese par ya se miró y no es el mismo.
 * Por eso puede ir en lote, mientras que fusionar --que sí une dos fichas-- se
 * hace de a uno y mirando cada una.
 */
export const descartarDuplicadosAction = defineAction(z.object({ ids }), async (input, ctx) => {
  const omitidos: Array<{ nombre: string; motivo: string }> = []
  let hechos = 0
  for (const id of [...new Set(input.ids)]) {
    try {
      await dismissDuplicate(ctx, id)
      hechos += 1
    } catch (error) {
      omitidos.push({ nombre: id, motivo: error instanceof Error ? error.message : 'No se pudo descartar.' })
    }
  }
  revalidatePath('/influencers/duplicados')
  return { hechos, omitidos }
})

/**
 * Fusiona varios duplicados de una vez.
 *
 * Sólo los que coinciden al 100 %, que son los que empatan por URL: ahí no hay
 * nada que juzgar. Los demás vuelven en `omitidos` con el motivo, para que se
 * miren de a uno.
 */
export const fusionarDuplicadosAction = defineAction(z.object({ ids }), async (input, ctx) => {
  const resultado = await fusionarDuplicados(ctx, input.ids)
  revalidatePath('/influencers/duplicados')
  // Fusionar cambia el padrón: alguien queda archivado y otro absorbe sus datos.
  revalidatePath('/influencers')
  return resultado
})

/**
 * Pasa varios perfiles descubiertos al padrón.
 *
 * El que ya estaba vuelve en `omitidos`: decir "importé 30" cuando 12 ya
 * estaban haría creer que hay 30 fichas nuevas para trabajar.
 */
export const importarDescubiertosAction = defineAction(z.object({ ids }), async (input, ctx) => {
  const resultado = await importarDescubiertos(ctx, input.ids)
  revalidatePath('/influencers/descubiertos')
  revalidatePath('/influencers')
  return resultado
})
