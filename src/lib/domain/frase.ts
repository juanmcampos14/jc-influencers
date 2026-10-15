/**
 * Una frase que todavía no está escrita: la clave y sus valores.
 *
 * El dominio corre en el servidor y no sabe en qué idioma mira quien pide. Si
 * devuelve la frase hecha --"3 perfiles sin cachet acordado"-- esa frase llega
 * tal cual a una pantalla en inglés. Devolviendo la clave, el texto lo arma
 * quien pinta, con las traducciones cargadas.
 *
 * Es lo mismo que hace `Intl` con una fecha: el dominio da el instante, la
 * pantalla decide cómo se lee.
 */
export type Frase = { clave: string; valores?: Record<string, string | number> }
