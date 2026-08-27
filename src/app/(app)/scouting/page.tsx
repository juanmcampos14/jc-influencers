import { permanentRedirect } from 'next/navigation'

/**
 * Scouting se mudó adentro de Influencers.
 *
 * Vivía suelto en la barra lateral y terminó con su propia lista de gente,
 * casi igual a la de Influencers. Ahora es un lugar más de esa sección.
 *
 * Esta redirección se queda: hay enlaces guardados en favoritos, en correos y
 * en la guía del equipo. Que una URL que funcionaba pase a dar 404 es un
 * costo que paga la persona, no nosotros.
 */
export default function ScoutingMudado() {
  permanentRedirect('/influencers/buscar')
}
