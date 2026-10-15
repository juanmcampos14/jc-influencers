import { createTranslator } from 'next-intl'
import castellano from '../../../messages/es.json'

/**
 * Las traducciones en castellano, fuera de React.
 *
 * El contexto que se le pasa al modelo de IA se escribe en castellano siempre
 * --es un prompt, no una pantalla-- pero algunos de sus datos vienen del
 * dominio como clave y valores. Esto los resuelve sin un componente y sin
 * copiar el texto a mano, que es como se desincroniza.
 */
export function enCastellano(
  grupo: string,
): (clave: string, valores?: Record<string, string | number>) => string {
  const t = createTranslator({ locale: 'es', messages: castellano, namespace: grupo as never })
  return (clave, valores) => t(clave as never, valores as never)
}
