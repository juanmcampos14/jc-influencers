import { expect, test } from '@playwright/test'
import { DEMO_PASSWORD, USERS, formAlert, lastEmailLink, login, logout, resetRateLimits } from './helpers'

test.beforeEach(async () => {
  await resetRateLimits()
})

test.describe('Acceso', () => {
  test('el login rechaza credenciales incorrectas con un mensaje genérico', async ({ page }) => {
    await login(page, USERS.agencyAdmin, 'contraseña-incorrecta')
    await expect(formAlert(page)).toContainText('Email o contraseña incorrectos')
    await expect(page).toHaveURL(/\/login/)
  })

  test('un email inexistente da exactamente el mismo mensaje', async ({ page }) => {
    await login(page, 'nadie-existe@ejemplo.test', 'lo-que-sea-123')
    await expect(formAlert(page)).toContainText('Email o contraseña incorrectos')
  })

  test('un usuario desactivado no puede entrar', async ({ page }) => {
    await login(page, USERS.disabled)
    await expect(formAlert(page)).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('la recuperación no revela si el email existe', async ({ page }) => {
    await page.goto('/recuperar')
    await page.getByLabel('Email').fill('fantasma@ejemplo.test')
    await page.getByRole('button', { name: 'Enviar enlace' }).click()
    await expect(page.getByText('Si ese email tiene una cuenta activa')).toBeVisible()
  })

  test('sin sesión, cualquier ruta interna manda al login', async ({ page }) => {
    for (const path of ['/panel', '/campanas', '/influencers', '/usuarios', '/auditoria', '/portal']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login/)
    }
  })

  test('se puede navegar el login sólo con teclado', async ({ page }) => {
    await page.goto('/login')
    // El campo de email recibe el foco al cargar: se completa el formulario
    // entero sin tocar el mouse.
    await expect(page.getByLabel('Email')).toBeFocused()
    await page.keyboard.type(USERS.agencyAdmin)
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Contraseña')).toBeFocused()
    await page.keyboard.type(DEMO_PASSWORD)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/panel/)
  })
})

test.describe('Panel de agencia', () => {
  test('el administrador entra al panel y ve sus campañas', async ({ page }) => {
    await login(page, USERS.agencyAdmin)
    await expect(page).toHaveURL(/\/panel/)
    await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible()
    await page.getByRole('link', { name: 'Campañas' }).click()
    await expect(page).toHaveURL(/\/campanas/)
    await expect(page.getByRole('heading', { name: 'Campañas' })).toBeVisible()
  })

  test('el scouting no ve la sección de auditoría', async ({ page }) => {
    await login(page, 'scout@jcmarketing.digital')
    await expect(page).toHaveURL(/\/panel/)
    await expect(page.getByRole('link', { name: 'Auditoría' })).toHaveCount(0)
    // Y tampoco entrando por URL directa.
    await page.goto('/auditoria')
    await expect(page.locator('body')).not.toContainText('Registro inmutable')
  })
})

test.describe('Aislamiento entre clientes', () => {
  test('un account manager no puede abrir la campaña de un cliente que no tiene asignado', async ({ page }) => {
    // El administrador de agencia sí ve la campaña del segundo cliente.
    await login(page, USERS.agencyAdmin)
    await page.goto('/campanas')
    const link = page.getByRole('link', { name: 'Temporada primavera' })
    await expect(link).toBeVisible()
    const href = await link.getAttribute('href')
    expect(href).toBeTruthy()
    await logout(page)

    // El account manager sólo está asignado al otro cliente: para él no existe.
    await login(page, USERS.accountManager)
    await expect(page).toHaveURL(/\/panel/)
    const response = await page.goto(href as string)
    expect(response?.status()).toBe(404)
    await expect(page.locator('body')).not.toContainText('Temporada primavera')
  })

  test('un usuario de un cliente no puede abrir la campaña de otro en el portal', async ({ page }) => {
    await login(page, USERS.agencyAdmin)
    await page.goto('/campanas')
    const href = await page.getByRole('link', { name: 'Lanzamiento tarjeta global' }).getAttribute('href')
    const campaignId = (href ?? '').split('/').pop()
    expect(campaignId).toBeTruthy()
    await logout(page)

    await login(page, USERS.otherTenantAdmin)
    const response = await page.goto(`/portal/campanas/${campaignId}`)
    expect(response?.status()).toBe(404)
    await expect(page.locator('body')).not.toContainText('Valentina Ruiz')
  })

  test('un usuario de cliente que entra al panel interno va a su portal', async ({ page }) => {
    await login(page, USERS.clientReviewer)
    await expect(page).toHaveURL(/\/portal/)
    await page.goto('/panel')
    await expect(page).toHaveURL(/\/portal/)
    await page.goto('/influencers')
    await expect(page).toHaveURL(/\/portal/)
  })
})

test.describe('Portal del cliente', () => {
  test('el revisor aprueba un perfil y la agencia lo ve', async ({ page }) => {
    await login(page, USERS.clientReviewer)
    await expect(page).toHaveURL(/\/portal/)
    await page.getByRole('link', { name: /Lanzamiento tarjeta global/ }).click()

    const card = page.locator('li', { hasText: 'Valentina Ruiz (demo)' }).first()
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: 'Aprobar' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Comentario').fill('Nos encanta el perfil, avancemos.')
    await dialog.getByRole('button', { name: 'Aprobar', exact: true }).click()
    await expect(page.getByText('La agencia ya lo ve')).toBeVisible()
    await expect(card.getByText('Aprobado').first()).toBeVisible()
  })

  test('el portal no muestra notas internas ni presupuestos', async ({ page }) => {
    await login(page, USERS.clientReviewer)
    await page.getByRole('link', { name: /Lanzamiento tarjeta global/ }).click()
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('NOTA INTERNA')
    expect(body).not.toContain('OBSERVACIÓN PRIVADA')
    expect(body).not.toMatch(/US\$\s?\d/)
  })

  test('el lector no ve botones de aprobación', async ({ page }) => {
    await login(page, USERS.clientViewer)
    await page.getByRole('link', { name: /Lanzamiento tarjeta global/ }).click()
    await expect(page.getByRole('button', { name: 'Aprobar' })).toHaveCount(0)
    await expect(page.getByText('Tu rol es de sólo lectura').first()).toBeVisible()
  })
})

test.describe('Invitaciones', () => {
  test('invitar, activar la cuenta y entrar', async ({ page }) => {
    const email = `invitado.e2e.${Date.now()}@ejemplo.test`

    await login(page, USERS.agencyAdmin)
    await page.getByRole('link', { name: 'Usuarios' }).click()
    await page.getByRole('button', { name: 'Invitar' }).click()

    await page.getByLabel('Tipo de acceso').selectOption('CLIENT')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Nombre').fill('Invitada E2E')
    await page.getByLabel('Rol dentro del cliente').selectOption('CLIENT_REVIEWER')
    await page.getByRole('button', { name: 'Enviar invitación' }).click()
    await expect(page.getByText('Invitación enviada')).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()

    await logout(page)

    const link = lastEmailLink(/http:\/\/127\.0\.0\.1:\d+\/invitacion\/[A-Za-z0-9_-]+/)
    expect(link).toBeTruthy()

    await page.goto(link as string)
    await expect(page.getByRole('heading', { name: 'Activá tu cuenta' })).toBeVisible()
    await page.getByLabel('Tu nombre').fill('Invitada E2E')
    await page.getByLabel('Contraseña').fill('Invitada.Segura.2026')
    await page.getByRole('button', { name: 'Activar mi cuenta' }).click()
    await expect(page).toHaveURL(/\/portal/)

    // El mismo enlace ya no sirve.
    await logout(page)
    await page.goto(link as string)
    await expect(page.getByText('Esta invitación no está disponible')).toBeVisible()
  })
})

test.describe('Límites de intentos', () => {
  test('el login se corta después de varios intentos fallidos', async ({ page }) => {
    await resetRateLimits()
    let blocked = false
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await login(page, USERS.accountManager, 'incorrecta-a-proposito')
      const alert = await formAlert(page).innerText()
      if (/Demasiados intentos/i.test(alert)) {
        blocked = true
        break
      }
    }
    expect(blocked).toBe(true)
    await resetRateLimits()
  })
})

test.describe('Interfaz', () => {
  test('la app funciona en pantalla chica', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page, USERS.agencyAdmin)
    await expect(page).toHaveURL(/\/panel/)
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await expect(page.getByRole('link', { name: 'Campañas' })).toBeVisible()
  })

  test('las cabeceras de seguridad están puestas', async ({ page }) => {
    const response = await page.goto('/login')
    const headers = response?.headers() ?? {}
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['x-powered-by']).toBeUndefined()
  })

  test('la cookie de sesión es HttpOnly y SameSite Lax', async ({ page, context }) => {
    await login(page, USERS.agencyAdmin)
    await expect(page).toHaveURL(/\/panel/)
    const cookies = await context.cookies()
    const session = cookies.find((cookie) => cookie.name === 'jc_session')
    expect(session).toBeTruthy()
    expect(session?.httpOnly).toBe(true)
    expect(session?.sameSite).toBe('Lax')
  })
})
