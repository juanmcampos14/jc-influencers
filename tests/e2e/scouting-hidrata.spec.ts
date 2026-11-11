import { expect, test } from '@playwright/test'
import { USERS, login } from './helpers'

/**
 * La consola de scouting tiene que quedar VIVA después de cargar.
 *
 * Pasó en producción: el shell hidrataba --el sidebar respondía-- pero el
 * subárbol de la consola no, así que sus botones eran HTML muerto. Tocar
 * "Ver cuánto cuesta" hacía un submit nativo del formulario y la página
 * recargaba con los filtros en la URL, que se lee como "no hace nada".
 *
 * Un error de hidratación no rompe la pantalla ni tira un 500: la deja
 * inerte. Por eso hace falta un test que la TOQUE, no uno que la mire.
 */
test.describe('Scouting', () => {
  test('la consola queda interactiva después de cargar', async ({ page }) => {
    await login(page, USERS.agencyAdmin)
    await page.goto('/scouting')

    // El panel de filtros arranca plegado y se abre al tocar. Si el subárbol
    // no hidrató, el botón existe y no pasa nada.
    const masFiltros = page.getByRole('button', { name: /Más filtros/ })
    await expect(masFiltros).toBeVisible()
    await expect(masFiltros).toHaveAttribute('aria-expanded', 'false')

    await masFiltros.click()
    await expect(masFiltros).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByLabel('País donde está')).toBeVisible()
  })

  test('pedir el costo no recarga la página', async ({ page }) => {
    await login(page, USERS.agencyAdmin)
    await page.goto('/scouting')

    await page.getByLabel('Tema o nicho').fill('finanzas')
    /*
     * El botón lleva el costo adentro --"Buscar · hasta US$ 0,07"-- porque lo
     * que sale se dice ANTES de apretar. El nombre fijo de antes quedó viejo
     * con un rediseño y este test falló en silencio hasta que alguien volvió a
     * correr los E2E: por eso ahora se busca por el principio del texto.
     */
    await page.getByRole('button', { name: /^Buscar( ·|$)/ }).click()

    // Con el formulario vivo, la respuesta llega sin navegar. Si hubiera hecho
    // submit nativo, los campos aparecerían en la URL.
    await expect(page.getByText('Antes de ejecutar')).toBeVisible({ timeout: 15_000 })
    expect(page.url()).not.toContain('keywords=')
  })
})
