import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { COOKIE_DE_IDIOMA, resolverIdioma } from './idiomas'

/**
 * Resuelve el idioma de CADA pedido y carga sus textos.
 *
 * El país sale de la cabecera que pone Vercel (`x-vercel-ip-country`). En
 * desarrollo no existe, y está bien: ahí decide el navegador.
 */
export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])

  const locale = resolverIdioma({
    cookie: cookieStore.get(COOKIE_DE_IDIOMA)?.value,
    acceptLanguage: headerStore.get('accept-language'),
    pais: headerStore.get('x-vercel-ip-country'),
  })

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    /* Fechas y números siguen al idioma, no al revés. */
    timeZone: process.env.APP_TIMEZONE || 'America/Argentina/Buenos_Aires',
  }
})
