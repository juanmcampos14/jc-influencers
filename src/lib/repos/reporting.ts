import 'server-only'
import type { AuthContext } from '@/lib/authz/context'
import { listarEntregas, type EntregaDto } from './entregas'
import { listarLinks, type LinkDto } from './links'

/**
 * Lo que la campaña realmente midió.
 *
 * Este archivo tiene una sola responsabilidad y es la más importante de todo el
 * reporting: **separar lo medido de lo que falta**. Cada total viene con la
 * cuenta de cuántas entregas lo tienen cargado, para que ningún promedio se
 * calcule sobre un denominador que nadie declaró.
 *
 * La diferencia práctica: "12.400 visualizaciones sobre 3 de 8 publicaciones"
 * es un dato. "12.400 visualizaciones" a secas, cuando 5 no cargaron nada, es
 * un número que alguien va a defender en una reunión sin saber que está roto.
 */

export type Medicion = {
  /** La suma de lo que sí está cargado. */
  total: number
  /** Cuántas entregas aportaron un número. */
  con: number
  /** Cuántas no tienen ese dato. */
  sin: number
}

export type ResumenDeResultados = {
  campaignId: string
  publicaciones: { total: number; publicadas: number; conLink: number }
  views: Medicion
  likes: Medicion
  comments: Medicion
  shares: Medicion
  saves: Medicion
  reach: Medicion
  /** Interacciones = likes + comentarios + compartidos + guardados, sobre lo cargado. */
  interacciones: Medicion
  /**
   * Tasa de interacción sobre visualizaciones. Null cuando no hay ninguna
   * entrega que tenga las DOS cosas cargadas: dividir sumas de conjuntos
   * distintos da un número que no significa nada.
   */
  tasaDeInteraccion: number | null
  clics: { total: number; personas: number; bots: number; links: number }
  /** Lo que nadie cargó, en castellano. Es la parte que más se usa. */
  huecos: string[]
  entregas: EntregaDto[]
  links: LinkDto[]
}

const medir = (valores: Array<number | null>): Medicion => {
  const con = valores.filter((valor): valor is number => valor !== null)
  return { total: con.reduce((suma, valor) => suma + valor, 0), con: con.length, sin: valores.length - con.length }
}

export async function resumirResultados(ctx: AuthContext, campaignId: string): Promise<ResumenDeResultados> {
  /*
   * Acá no se vuelve a comprobar el alcance: las DOS funciones que se llaman lo
   * hacen, con las mismas aserciones y sobre la misma campaña. Hacerlo también
   * acá era una transacción más --unos 900 ms-- por una garantía que ya estaba.
   */
  const [entregas, links] = await Promise.all([listarEntregas(ctx, campaignId), listarLinks(ctx, campaignId)])

  const publicadas = entregas.filter((entrega) => entrega.status === 'PUBLISHED')
  const views = medir(publicadas.map((e) => e.metricas.views))
  const likes = medir(publicadas.map((e) => e.metricas.likes))
  const comments = medir(publicadas.map((e) => e.metricas.comments))
  const shares = medir(publicadas.map((e) => e.metricas.shares))
  const saves = medir(publicadas.map((e) => e.metricas.saves))
  const reach = medir(publicadas.map((e) => e.metricas.reach))

  const interacciones: Medicion = {
    total: likes.total + comments.total + shares.total + saves.total,
    con: publicadas.filter(
      (e) =>
        e.metricas.likes !== null ||
        e.metricas.comments !== null ||
        e.metricas.shares !== null ||
        e.metricas.saves !== null,
    ).length,
    sin: 0,
  }
  interacciones.sin = publicadas.length - interacciones.con

  /*
   * La tasa sólo se calcula sobre las entregas que tienen las dos cosas. Sumar
   * las interacciones de unas y dividirlas por las visualizaciones de otras da
   * un porcentaje que no describe nada.
   */
  const conAmbas = publicadas.filter(
    (e) =>
      e.metricas.views !== null &&
      e.metricas.views > 0 &&
      (e.metricas.likes !== null || e.metricas.comments !== null),
  )
  const tasaDeInteraccion =
    conAmbas.length === 0
      ? null
      : (conAmbas.reduce(
          (suma, e) =>
            suma +
            ((e.metricas.likes ?? 0) + (e.metricas.comments ?? 0) + (e.metricas.shares ?? 0) + (e.metricas.saves ?? 0)),
          0,
        ) /
          conAmbas.reduce((suma, e) => suma + (e.metricas.views ?? 0), 0)) *
        100

  const activos = links.filter((link) => !link.archived)
  const clics = {
    total: activos.reduce((suma, link) => suma + link.clics, 0),
    personas: activos.reduce((suma, link) => suma + link.personas, 0),
    bots: activos.reduce((suma, link) => suma + link.bots, 0),
    links: activos.length,
  }

  const huecos: string[] = []
  if (entregas.length === 0) {
    huecos.push('Todavía no se cargó ninguna publicación.')
  } else {
    if (publicadas.length === 0) huecos.push('Ninguna de las entregas cargadas figura como publicada.')
    if (views.sin > 0) huecos.push(`${views.sin} de ${publicadas.length} publicaciones no tienen visualizaciones cargadas.`)
    if (interacciones.sin > 0) huecos.push(`${interacciones.sin} no tienen ninguna interacción cargada.`)
    const sinLink = publicadas.filter((e) => !e.url).length
    if (sinLink > 0) huecos.push(`${sinLink} no tienen el link de la publicación.`)
  }
  if (activos.length === 0) {
    huecos.push('No hay links medidos, así que no se puede saber cuántas personas fueron al sitio.')
  }

  return {
    campaignId,
    publicaciones: {
      total: entregas.length,
      publicadas: publicadas.length,
      conLink: publicadas.filter((e) => Boolean(e.url)).length,
    },
    views,
    likes,
    comments,
    shares,
    saves,
    reach,
    interacciones,
    tasaDeInteraccion,
    clics,
    huecos,
    entregas,
    links,
  }
}

/**
 * El resumen en texto, para pasarle al modelo.
 *
 * Se declara explícitamente lo que falta, porque la instrucción "no inventes"
 * sola no alcanza: si el material sólo trae los números que existen, el modelo
 * asume que ese es el total. Diciéndole cuántas entregas quedaron sin cargar,
 * el hueco se convierte en parte del análisis en vez de desaparecer.
 */
export function contextoDeResultados(resumen: ResumenDeResultados): string {
  const partes: string[] = []
  const linea = (nombre: string, medicion: Medicion) =>
    medicion.con === 0
      ? `- ${nombre}: SIN DATO (ninguna de las ${resumen.publicaciones.publicadas} publicaciones lo tiene cargado)`
      : `- ${nombre}: ${medicion.total} sumando ${medicion.con} de ${resumen.publicaciones.publicadas} publicaciones` +
        (medicion.sin > 0 ? ` · faltan ${medicion.sin}` : '')

  partes.push('## Publicaciones')
  partes.push(
    `- Entregas cargadas: ${resumen.publicaciones.total} · publicadas: ${resumen.publicaciones.publicadas} · con link: ${resumen.publicaciones.conLink}`,
  )

  partes.push('\n## Métricas de las publicaciones')
  partes.push(linea('Visualizaciones', resumen.views))
  partes.push(linea('Alcance', resumen.reach))
  partes.push(linea('Me gusta', resumen.likes))
  partes.push(linea('Comentarios', resumen.comments))
  partes.push(linea('Compartidos', resumen.shares))
  partes.push(linea('Guardados', resumen.saves))
  partes.push(
    resumen.tasaDeInteraccion === null
      ? '- Tasa de interacción: SIN DATO (ninguna publicación tiene visualizaciones e interacciones a la vez)'
      : `- Tasa de interacción: ${resumen.tasaDeInteraccion.toFixed(2)}% (sólo sobre las publicaciones que tienen las dos cosas)`,
  )

  partes.push('\n## Links medidos (esto sí lo medimos nosotros)')
  partes.push(
    resumen.clics.links === 0
      ? '- No hay links medidos en esta campaña.'
      : `- ${resumen.clics.links} links · ${resumen.clics.total} clics de personas · ${resumen.clics.personas} visitantes distintos por día · ${resumen.clics.bots} descartados por parecer bots`,
  )

  if (resumen.entregas.length > 0) {
    partes.push('\n## Detalle por publicación')
    for (const entrega of resumen.entregas) {
      const m = entrega.metricas
      const numeros = [
        m.views !== null ? `${m.views} visualizaciones` : null,
        m.reach !== null ? `${m.reach} de alcance` : null,
        m.likes !== null ? `${m.likes} me gusta` : null,
        m.comments !== null ? `${m.comments} comentarios` : null,
      ].filter(Boolean)
      partes.push(
        `- ${entrega.quien} · ${entrega.type} · ${entrega.status}` +
          (numeros.length > 0 ? ` · ${numeros.join(', ')}` : ' · SIN MÉTRICAS CARGADAS') +
          (entrega.metricsSource ? ` (fuente: ${entrega.metricsSource})` : ''),
      )
    }
  }

  if (resumen.huecos.length > 0) {
    partes.push('\n## Lo que NADIE cargó todavía')
    partes.push('Esto no es cero: es ausencia de dato. No lo trates como una caída ni lo completes.')
    for (const hueco of resumen.huecos) partes.push(`- ${hueco}`)
  }

  return partes.join('\n')
}
