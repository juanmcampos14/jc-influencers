import { expect, test } from '@playwright/test'
import { USERS, login, resetRateLimits } from './helpers'

test.beforeEach(async () => {
  await resetRateLimits()
})

test.describe('Cabeceras de seguridad', () => {
  test('la aplicación arranca en el navegador sin violar la política de contenido', async ({ page }) => {
    // El HTML puede llegar perfecto y la pantalla quedar vacía igual: si la
    // política bloquea los scripts de arranque de Next, React nunca hidrata.
    const violaciones: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
        violaciones.push(message.text())
      }
    })

    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible()

    // Prueba de hidratación: este mensaje lo escribe React en el cliente.
    // Si la aplicación no arrancó, el formulario se envía y recarga la página.
    await page.getByLabel('Email').fill('no-existe@ejemplo.test')
    await page.getByLabel('Contraseña').fill('clave-incorrecta-1234')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(page.locator('main').getByRole('alert').first()).toBeVisible()

    expect(violaciones, violaciones.join('\n')).toEqual([])
  })


  // Una página prerenderizada en la compilación no puede llevar el nonce del
  // pedido: se ve, pero sus scripts quedan bloqueados y nunca hidrata. Por eso
  // se recorren también las rutas que Next prerenderizaría por defecto.
  for (const ruta of ['/login', '/recuperar', '/ruta-que-no-existe']) {
    test(`${ruta} carga todos sus scripts`, async ({ page }) => {
      const violaciones: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
          violaciones.push(message.text())
        }
      })
      await page.goto(ruta)
      await page.waitForLoadState('networkidle')
      expect(violaciones, violaciones.join('\n')).toEqual([])
    })
  }

  test('cada respuesta trae una única política, con nonce y sin scripts inline libres', async ({ page }) => {
    const response = await page.goto('/login')
    const headers = await response!.headersArray()
    const policies = headers.filter((h) => h.name.toLowerCase() === 'content-security-policy')

    // Dos cabeceras CSP se intersectan y el nonce deja de valer.
    expect(policies).toHaveLength(1)

    const policy = policies[0]!.value
    expect(policy).toMatch(/script-src[^;]*'nonce-/)
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/)
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("object-src 'none'")
  })

  test('el nonce cambia en cada respuesta', async ({ page }) => {
    const leer = async () => {
      const response = await page.goto('/login')
      const policy = response!.headers()['content-security-policy'] ?? ''
      return /'nonce-([^']+)'/.exec(policy)?.[1]
    }
    const primero = await leer()
    const segundo = await leer()
    expect(primero).toBeTruthy()
    expect(segundo).not.toBe(primero)
  })

  test('las páginas internas también salen protegidas', async ({ page }) => {
    await login(page, USERS.agencyAdmin)
    const response = await page.goto('/')
    const headers = response!.headers()
    expect(headers['content-security-policy']).toMatch(/'nonce-/)
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-powered-by']).toBeUndefined()
  })
})
