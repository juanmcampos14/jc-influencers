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

/**
 * El traductor del idioma del pedido, y castellano cuando no hay pedido.
 *
 * Un email lo dispara una persona --quien invita, quien pide recuperar su
 * contraseña-- así que se escribe en SU idioma, que es el del pedido. Los
 * mismos flujos corren en tests y en scripts, donde no hay pedido ninguno: ahí
 * cae en castellano en vez de explotar.
 */
export async function textoDelPedido(
  grupo: string,
): Promise<(clave: string, valores?: Record<string, string | number>) => string> {
  try {
    const { getTranslations } = await import('next-intl/server')
    const t = await getTranslations(grupo as never)
    return (clave, valores) => t(clave as never, valores as never)
  } catch {
    return enCastellano(grupo)
  }
}

/** El idioma del pedido, o castellano fuera de un pedido. */
export async function idiomaDelPedido(): Promise<string> {
  try {
    const { getLocale } = await import('next-intl/server')
    return await getLocale()
  } catch {
    return 'es'
  }
}
