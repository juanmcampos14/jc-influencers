/**
 * Ordenamiento pedido desde la URL.
 *
 * La clave llega del navegador y termina en un `orderBy` de Prisma, así que se
 * valida contra una lista blanca declarada por cada pantalla. Sin eso, un
 * parámetro de más ordena por una columna que esa pantalla no muestra --o que
 * el usuario no tiene permiso de ver-- y el orden se convierte en un canal para
 * leer datos de a uno: pedir orden por una columna oculta y deducir su valor
 * mirando dónde cae cada fila.
 */

export type Direccion = 'asc' | 'desc'

export type Orden<Clave extends string> = {
  clave: Clave
  direccion: Direccion
}

export type ColumnaOrdenable<Clave extends string> = {
  clave: Clave
  /** Dirección al tocarla por primera vez. Los números suelen querer 'desc'. */
  porDefecto?: Direccion
}

/**
 * Resuelve el orden a partir de los parámetros de la URL.
 * Si la clave pedida no está permitida, se cae al primero de la lista.
 */
export function resolverOrden<Clave extends string>(
  columnas: ReadonlyArray<ColumnaOrdenable<Clave>>,
  params: { orden?: string | string[]; dir?: string | string[] },
): Orden<Clave> {
  const pedida = Array.isArray(params.orden) ? params.orden[0] : params.orden
  const dirPedida = Array.isArray(params.dir) ? params.dir[0] : params.dir

  const columna = columnas.find((c) => c.clave === pedida) ?? columnas[0]
  if (!columna) throw new Error('resolverOrden necesita al menos una columna.')

  const direccion: Direccion =
    dirPedida === 'asc' || dirPedida === 'desc' ? dirPedida : (columna.porDefecto ?? 'asc')

  return { clave: columna.clave, direccion }
}

/** La dirección que corresponde al tocar una columna, según cómo esté ahora. */
export function proximaDireccion<Clave extends string>(
  columna: ColumnaOrdenable<Clave>,
  actual: Orden<Clave>,
): Direccion {
  if (actual.clave !== columna.clave) return columna.porDefecto ?? 'asc'
  return actual.direccion === 'asc' ? 'desc' : 'asc'
}
