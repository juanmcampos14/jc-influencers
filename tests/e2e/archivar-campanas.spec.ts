import { expect, test } from '@playwright/test'
import { login, USERS } from './helpers'

/**
 * Archivar una campaña desde la lista.
 *
 * Lo que se prueba acá arriba y no se puede probar abajo: que el botón exista,
 * que la campaña DESAPAREZCA de la lista después, y que esté en la otra.
 *
 * Las dos pruebas son una sola historia --archivar y después restaurar-- para
 * que la base quede como estaba: el seed no vacía entre corridas.
 */
test('archivar saca la campaña de la lista, restaurar la devuelve', async ({ page }) => {
  const nombre = 'Temporada primavera'
  const fila = () => page.getByRole('row').filter({ hasText: nombre })
  const dialogo = () => page.getByRole('dialog')

  await login(page, USERS.agencyAdmin)
  await page.goto('/campanas')
  await expect(fila()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ver archivadas' })).toBeVisible()

  await fila().getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Archivar' }).click()
  await dialogo().getByRole('button', { name: 'Archivar' }).click()
  await expect(fila()).toHaveCount(0)

  // Está en la otra lista, y esa lista se anuncia como tal.
  await page.goto('/campanas?archivadas=1')
  await expect(page.getByRole('heading', { name: 'Campañas archivadas' })).toBeVisible()
  await expect(fila()).toBeVisible()

  await fila().getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Restaurar' }).click()
  await dialogo().getByRole('button', { name: 'Restaurar' }).click()
  await expect(fila()).toHaveCount(0)

  await page.goto('/campanas')
  await expect(fila()).toBeVisible()
})
