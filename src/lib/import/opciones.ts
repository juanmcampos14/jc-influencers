import type { ParsedPerson, ParsedWorkbook } from './excel'

/**
 * Lo que una persona decide sobre una importación, antes de aplicarla.
 *
 * El importador vuelve a leer el archivo guardado cuando se confirma, así que
 * una decisión tomada en la previsualización tiene que viajar con la corrida:
 * si viviera sólo en la pantalla, confirmar la ignoraría en silencio. Se guarda
 * dentro del `summary` de la corrida, que ya es JSON --sin migración.
 */
export type OpcionesDeImportacion = {
  /**
   * El país que se aplica a las filas que NO lo traen.
   *
   * Sólo a las que no lo traen: una planilla que dice el país de cada fila
   * manda sobre lo que se elija acá. Sin esto, elegir "España" para un archivo
   * mezclado reescribiría países que el archivo sí sabía.
   */
  paisPorDefecto: string | null
  /**
   * El país que averiguó el proveedor, por fila.
   *
   * Es un dato medido, no una elección, así que se guarda aparte: queda claro
   * cuál vino de la API y cuál de la lista desplegable.
   */
  paisPorFila: Record<string, string>
}

export const SIN_OPCIONES: OpcionesDeImportacion = { paisPorDefecto: null, paisPorFila: {} }

/** Identifica una fila del archivo: la hoja y el número, que no cambian al releer. */
export const claveDeFila = (person: Pick<ParsedPerson, 'sheetName' | 'rowNumber'>): string =>
  `${person.sheetName}#${person.rowNumber}`

/**
 * Aplica las decisiones sobre lo que se leyó del archivo.
 *
 * El orden importa y es el único defendible: lo que dice el archivo, después lo
 * que averiguó el proveedor, y al final lo que eligió una persona para el
 * resto. Nunca al revés: ninguna de las dos últimas pisa un país que la
 * planilla traía.
 */
export function aplicarOpciones(parsed: ParsedWorkbook, opciones: OpcionesDeImportacion): ParsedWorkbook {
  const people = parsed.people.map((person) => {
    if (person.country) return person
    const medido = opciones.paisPorFila[claveDeFila(person)]
    const pais = medido ?? opciones.paisPorDefecto
    return pais ? { ...person, country: pais } : person
  })
  return { ...parsed, people }
}

/** Las filas que siguen sin país después de aplicar todo. */
export function filasSinPais(parsed: ParsedWorkbook): ParsedPerson[] {
  return parsed.people.filter((person) => !person.country)
}

/** Lee las opciones guardadas en el `summary` de una corrida. */
export function opcionesDelResumen(summary: unknown): OpcionesDeImportacion {
  if (!summary || typeof summary !== 'object') return SIN_OPCIONES
  const crudo = (summary as { opciones?: unknown }).opciones
  if (!crudo || typeof crudo !== 'object') return SIN_OPCIONES
  const { paisPorDefecto, paisPorFila } = crudo as Partial<OpcionesDeImportacion>
  return {
    paisPorDefecto: typeof paisPorDefecto === 'string' && paisPorDefecto ? paisPorDefecto : null,
    paisPorFila:
      paisPorFila && typeof paisPorFila === 'object'
        ? Object.fromEntries(
            Object.entries(paisPorFila).filter(
              (entrada): entrada is [string, string] => typeof entrada[1] === 'string' && entrada[1].length > 0,
            ),
          )
        : {},
  }
}
