import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { login, USERS } from './helpers'

/*
 * Nombres distintos en cada corrida. La base de desarrollo NO se vacía entre
 * corridas --el seed siembra, no borra--, así que un handle fijo existe desde
 * la primera vez y la segunda vez el test se prueba a sí mismo en vez de al
 * producto: "se va a crear" nunca vuelve a aparecer.
 */
const marca = randomUUID().slice(0, 8)
const UNO = `nueva.${marca}.uno`
const DOS = `nueva.${marca}.dos`
const SIN_LINK = `Nadie Con Ese Nombre ${marca}`

/**
 * Agregar gente a una campaña pegando los links de sus perfiles.
 *
 * Se prueba acá arriba, con el navegador de verdad, porque lo que se arregló
 * es el camino entero: el campo tiene que darse cuenta solo de que lo pegado
 * son enlaces, mostrar qué va a pasar con cada uno antes de tocar nada, y
 * recién ahí agregarlos. Un test de unidad no ve si el botón aparece.
 */
test.describe('Agregar influencer desde la campaña', () => {
  test('pegar varios links muestra qué pasa con cada uno y los agrega juntos', async ({ page }) => {
    await login(page, USERS.agencyAdmin)
    await page.goto('/campanas')
    await page.getByRole('link', { name: 'Temporada primavera' }).click()
    await expect(page).toHaveURL(/\/campanas\//)

    await page.getByRole('button', { name: 'Agregar influencer' }).click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()

    await dialogo.getByLabel('Buscar').fill(
      `https://www.instagram.com/${UNO}\nhttps://www.instagram.com/${DOS}`,
    )

    // La previsualización: los dos se reconocen y los dos son altas nuevas.
    await expect(dialogo.getByText('2 links reconocidos')).toBeVisible()
    await expect(dialogo.getByText('se va a crear')).toHaveCount(2)

    await dialogo.getByRole('button', { name: 'Agregar 2 perfiles' }).click()

    // Quedaron en el funnel de la campaña.
    await expect(page.getByText(UNO).first()).toBeVisible()
    await expect(page.getByText(DOS).first()).toBeVisible()
  })

  test('volver a pegar los mismos links dice que ya están, y no ofrece agregarlos', async ({ page }) => {
    await login(page, USERS.agencyAdmin)
    await page.goto('/campanas')
    await page.getByRole('link', { name: 'Temporada primavera' }).click()

    await page.getByRole('button', { name: 'Agregar influencer' }).click()
    const dialogo = page.getByRole('dialog')
    await dialogo.getByLabel('Buscar').fill(`https://www.instagram.com/${UNO}`)

    await expect(dialogo.getByText('ya está en esta campaña')).toBeVisible()
    await expect(dialogo.getByRole('button', { name: /Agregar \d+ perfil/ })).toHaveCount(0)
  })

  /*
   * El otro camino: se busca por nombre, no aparece nadie, y la salida no
   * puede seguir siendo "andá a la sección Influencers y volvé".
   */
  test('un nombre que no está en la base ofrece crearlo ahí mismo', async ({ page }) => {
    await login(page, USERS.agencyAdmin)
    await page.goto('/campanas')
    await page.getByRole('link', { name: 'Temporada primavera' }).click()

    await page.getByRole('button', { name: 'Agregar influencer' }).click()
    const dialogo = page.getByRole('dialog')
    await dialogo.getByLabel('Buscar').fill(SIN_LINK)

    await expect(dialogo.getByText('No hay nadie con ese nombre en la base.')).toBeVisible()
    await dialogo.getByRole('button', { name: `Crear «${SIN_LINK}» y agregar` }).click()

    await expect(page.getByText(SIN_LINK).first()).toBeVisible()
  })
})
