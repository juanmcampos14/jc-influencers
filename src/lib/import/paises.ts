import 'server-only'
import type { Platform } from '@/generated/prisma/enums'
import type { AuthContext } from '@/lib/authz/context'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { NotFoundError, ValidationError } from '@/lib/authz/errors'
import { parseProfileUrl } from '@/lib/domain/normalize'
import { scoutingProviderFor } from '@/lib/ports/scouting'
import { scoped } from '@/lib/repos/base'
import { listScoutingResults, previewScouting, startScouting } from '@/lib/repos/scouting'
import { ajustarImportacion, type ImportSummary } from './runner'
import { opcionesDelResumen } from './opciones'

/**
 * Completar el país que a la planilla le falta, preguntándoselo al proveedor.
 *
 * Una planilla ajena casi nunca trae el país, y sin país un teléfono local no
 * alcanza para abrir un WhatsApp. El dato existe: es el mismo que el proveedor
 * devuelve al actualizar las métricas de un perfil.
 *
 * Tres cosas que esto NO hace, a propósito:
 *
 *  - No inventa el país a partir del idioma, del nombre ni del archivo. Si el
 *    proveedor no lo dice, la fila sigue sin país y se ve.
 *  - No corre solo. Cuesta plata por perfil, así que se pide, se dice cuánto
 *    sale antes y se cuenta contra el tope mensual de scouting -- va por el
 *    mismo camino que cualquier búsqueda, y queda en la lista de Búsquedas con
 *    su costo.
 *  - No toca a quien ya tiene país en la planilla.
 */

/** Las filas sin país que se pueden preguntar, agrupadas por red. */
export type FilasPreguntables = {
  /** Una entrada por red, porque cada corrida de scouting es de una red. */
  porRed: Array<{ platform: Platform; urls: string[] }>
  total: number
  /** Filas sin país que no tienen URL: a ésas no se les puede preguntar nada. */
  sinUrl: number
  /**
   * Filas con URL de una red que NINGÚN proveedor conectado sabe actualizar.
   *
   * Se cuenta aparte porque "no hay a quién preguntarle" y "no hay nada que
   * preguntar" se arreglan distinto: lo primero es una credencial que falta,
   * lo segundo es que la planilla ya tiene todos los países. Juntarlos haría
   * que un proveedor sin configurar se leyera como una planilla completa.
   */
  sinProveedor: number
}

export async function filasParaPreguntar(ctx: AuthContext, importRunId: string): Promise<FilasPreguntables> {
  const summary = await resumenDe(ctx, importRunId)
  const porRed = new Map<Platform, string[]>()
  let sinUrl = 0
  let sinProveedor = 0

  for (const persona of summary.personas) {
    if (persona.country) continue
    if (!persona.url) {
      sinUrl += 1
      continue
    }
    const parsed = parseProfileUrl(persona.url)
    if (parsed.kind !== 'value') {
      sinUrl += 1
      continue
    }
    const platform = parsed.value.platform
    /*
     * Sólo las redes que el proveedor sabe actualizar. Pedirle una que no
     * soporta gasta una corrida para volver con un error que ya se sabía.
     */
    if (!scoutingProviderFor(platform, 'ENRICH').supports(platform, 'ENRICH')) {
      sinProveedor += 1
      continue
    }
    porRed.set(platform, [...(porRed.get(platform) ?? []), parsed.value.url])
  }

  const lista = [...porRed.entries()].map(([platform, urls]) => ({ platform, urls }))
  return {
    porRed: lista,
    total: lista.reduce((suma, entrada) => suma + entrada.urls.length, 0),
    sinUrl,
    sinProveedor,
  }
}

/**
 * Paso 1: registrar la consulta y decir cuánto cuesta.
 *
 * Devuelve lo mismo que un preflight de scouting --costo, tope, bloqueos--
 * porque es exactamente eso: una corrida de scouting, con su registro y su
 * presupuesto. La pantalla lo muestra antes de que nadie gaste nada.
 */
export async function preverBusquedaDePaises(ctx: AuthContext, importRunId: string) {
  const run = await corridaDe(ctx, importRunId)
  const filas = await filasParaPreguntar(ctx, importRunId)
  if (filas.total === 0) {
    /*
     * Dos motivos distintos para no poder preguntar, y decir el equivocado
     * manda a buscar el problema donde no está. Si hay filas con URL pero
     * ningún proveedor conectado sabe actualizar esa red, el problema es la
     * credencial, no la planilla.
     */
    throw new ValidationError({
      clave: filas.sinProveedor > 0 ? 'ningunProveedorActualiza' : 'nadaQuePreguntar',
      valores: { cantidad: filas.sinProveedor },
    })
  }

  /*
   * Una red por corrida. Con una planilla de una sola red --el caso normal--
   * es una sola; con varias, se hace la más grande primero y se repite.
   */
  const mayor = [...filas.porRed].sort((a, b) => b.urls.length - a.urls.length)[0]!
  return previewScouting(ctx, {
    clientId: run.clientId,
    mode: 'ENRICH',
    platform: mayor.platform,
    urls: mayor.urls,
    limit: mayor.urls.length,
  })
}

/** Paso 2: ejecutarla. Acá se gasta. */
export async function ejecutarBusquedaDePaises(ctx: AuthContext, scoutingRunId: string) {
  return startScouting(ctx, scoutingRunId)
}

/**
 * Paso 3: pasar a la importación los países que volvieron.
 *
 * Lo que el proveedor no contestó no se completa con nada: esas filas siguen
 * sin país y la pantalla lo muestra, que es la única forma de que alguien
 * decida qué hacer con ellas.
 */
export async function aplicarPaisesEncontrados(
  ctx: AuthContext,
  input: { importRunId: string; scoutingRunId: string },
): Promise<{ summary: ImportSummary; encontrados: number; sinRespuesta: number }> {
  const summary = await resumenDe(ctx, input.importRunId)
  const resultados = await listScoutingResults(ctx, input.scoutingRunId)

  const paisPorUrl = new Map<string, string>()
  for (const resultado of resultados) {
    if (!resultado.country) continue
    const parsed = parseProfileUrl(resultado.url)
    if (parsed.kind === 'value') paisPorUrl.set(parsed.value.urlNormalized, resultado.country)
  }

  const paisPorFila: Record<string, string> = {}
  let sinRespuesta = 0
  for (const persona of summary.personas) {
    if (persona.country || !persona.url) continue
    const parsed = parseProfileUrl(persona.url)
    const pais = parsed.kind === 'value' ? paisPorUrl.get(parsed.value.urlNormalized) : undefined
    if (pais) paisPorFila[`${persona.sheetName}#${persona.rowNumber}`] = pais
    else sinRespuesta += 1
  }

  const actualizado = await ajustarImportacion(ctx, input.importRunId, { paisPorFila })
  return { summary: actualizado, encontrados: Object.keys(paisPorFila).length, sinRespuesta }
}

/** El país que ya se había averiguado, para no volver a pagarlo. */
export async function paisesYaAveriguados(ctx: AuthContext, importRunId: string): Promise<number> {
  const run = await corridaDe(ctx, importRunId)
  return Object.keys(opcionesDelResumen(run.summary).paisPorFila).length
}

async function corridaDe(ctx: AuthContext, importRunId: string) {
  const run = await scoped(ctx, (tx) => tx.importRun.findUnique({ where: { id: importRunId } }))
  if (!run) throw new NotFoundError()
  assertClientInScope(ctx, run.clientId)
  assertCan(ctx, 'import.run', run.clientId)
  // Preguntarle al proveedor cuesta plata: hace falta el permiso de scouting,
  // que es independiente del de importar.
  assertCan(ctx, 'scouting.run', run.clientId)
  return run
}

async function resumenDe(ctx: AuthContext, importRunId: string): Promise<ImportSummary> {
  const run = await corridaDe(ctx, importRunId)
  const summary = run.summary as unknown as ImportSummary | null
  if (!summary?.personas) throw new ValidationError({ clave: 'importacionSinResumen' })
  return summary
}
