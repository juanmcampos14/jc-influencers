"use server"

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { COOKIE_DE_IDIOMA, DURACION_DE_COOKIE, esIdioma } from '@/i18n/idiomas'

/**
 * Guarda el idioma elegido.
 *
 * No pasa por `defineAction` a propósito: no toca la base, no necesita sesión y
 * tiene que funcionar también en la pantalla de ingreso, donde todavía no hay
 * usuario. Lo único que valida es que el valor sea un idioma que hablamos --lo
 * que llega del navegador no se escribe en una cookie sin mirarlo--.
 */
export async function elegirIdiomaAction(valor: string): Promise<void> {
  if (!esIdioma(valor)) return

  const store = await cookies()
  store.set(COOKIE_DE_IDIOMA, valor, {
    maxAge: DURACION_DE_COOKIE,
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })

  /*
   * Todo el árbol se rearma: el idioma se resuelve por pedido, así que cada
   * página renderizada queda con el idioma anterior hasta que se revalida.
   */
  revalidatePath('/', 'layout')
}
