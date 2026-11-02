/**
 * Teléfonos y enlaces de WhatsApp.
 *
 * `wa.me` necesita el número COMPLETO con código de país y sin signos. Un
 * número local --"612 345 678"-- abre un chat con otra persona o con nadie, y
 * eso no se nota hasta que alguien manda un mensaje al vacío.
 *
 * Así que el enlace se arma sólo cuando el código de país se puede saber: o
 * porque el número lo trae, o porque la ficha dice de qué país es la persona.
 * Cuando no se puede, se dice; no se adivina un prefijo.
 */

/**
 * Códigos de país, por el nombre o la sigla con que aparecen en la base.
 *
 * Es la lista de mercados con los que trabaja la agencia (`MARKET_SEED`) más
 * las siglas ISO que llegan de los proveedores. Las regiones --LATAM, EUROPA,
 * GLOBAL-- no están a propósito: no tienen un código de país.
 */
const CODIGOS: Record<string, string> = {
  ARG: '54',
  ARGENTINA: '54',
  AR: '54',
  BOLIVIA: '591',
  BO: '591',
  BOL: '591',
  BRASIL: '55',
  BRAZIL: '55',
  BR: '55',
  BRL: '55',
  CHILE: '56',
  CL: '56',
  CHL: '56',
  COL: '57',
  COLOMBIA: '57',
  CO: '57',
  EMIRATES: '971',
  AE: '971',
  ESPAÑA: '34',
  ESPANA: '34',
  SPAIN: '34',
  ES: '34',
  ESP: '34',
  MEX: '52',
  MEXICO: '52',
  MÉXICO: '52',
  MX: '52',
  PANAMA: '507',
  PANAMÁ: '507',
  PA: '507',
  PAN: '507',
  PERU: '51',
  PERÚ: '51',
  PE: '51',
  PER: '51',
  'REPUBLICA DOMINICANA': '1',
  'REPÚBLICA DOMINICANA': '1',
  DO: '1',
  TURKEY: '90',
  TURQUIA: '90',
  TURQUÍA: '90',
  TR: '90',
  USA: '1',
  US: '1',
  'ESTADOS UNIDOS': '1',
  URUGUAY: '598',
  UY: '598',
  URY: '598',
  VENEZUELA: '58',
  VE: '58',
  VEN: '58',
}

export type TelefonoParaWhatsapp =
  | { estado: 'SIN_NUMERO' }
  /** Hay número y se puede escribir: `url` abre el chat. */
  | { estado: 'LISTO'; url: string; e164: string; paraMostrar: string }
  /** Hay número pero sin código de país: no se puede abrir un chat sin inventarlo. */
  | { estado: 'SIN_CODIGO_DE_PAIS'; paraMostrar: string }

/** El código de un país, por su nombre o sigla. `null` si no es un país. */
export function codigoDePais(pais: string | null | undefined): string | null {
  if (!pais) return null
  const clave = pais.trim().toUpperCase()
  return CODIGOS[clave] ?? null
}

/**
 * Prepara un teléfono para WhatsApp.
 *
 * @param telefono lo que cargó una persona, tal cual: "+34 612 345 678",
 *   "612345678", "0054 9 11 1234-5678".
 * @param pais el país de la ficha, para completar el código cuando falta.
 */
export function paraWhatsapp(
  telefono: string | null | undefined,
  pais?: string | null,
): TelefonoParaWhatsapp {
  const crudo = (telefono ?? '').trim()
  if (!crudo) return { estado: 'SIN_NUMERO' }

  const paraMostrar = crudo
  /*
   * Un "00" al principio es la forma de marcar internacional desde media
   * Europa y América: equivale al "+", así que el número ya trae su país.
   */
  const internacional = crudo.startsWith('+') || /^00\d/.test(crudo)
  const digitos = crudo.replace(/\D/g, '').replace(/^00/, internacional ? '' : '00')

  if (digitos.length < 6) return { estado: 'SIN_CODIGO_DE_PAIS', paraMostrar }

  if (internacional) {
    return { estado: 'LISTO', url: `https://wa.me/${digitos}`, e164: `+${digitos}`, paraMostrar }
  }

  const codigo = codigoDePais(pais)
  if (!codigo) return { estado: 'SIN_CODIGO_DE_PAIS', paraMostrar }

  /*
   * Un número local que ya empieza con el código de su propio país --"5491122..."
   * cargado sin el "+"-- no lleva el código otra vez. Se mira el largo para no
   * confundirlo con un número local que casualmente empieza igual: con el
   * código puesto, un internacional tiene al menos 10 dígitos.
   */
  const yaLoTrae = digitos.startsWith(codigo) && digitos.length >= codigo.length + 8
  const completo = yaLoTrae ? digitos : `${codigo}${digitos.replace(/^0+/, '')}`
  return { estado: 'LISTO', url: `https://wa.me/${completo}`, e164: `+${completo}`, paraMostrar }
}
