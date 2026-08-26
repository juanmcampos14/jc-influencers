import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client as PgClient } from 'pg'
import type { Locator, Page } from '@playwright/test'

export const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo.2026!seguro'

export const USERS = {
  agencyAdmin: 'admin@jcmarketing.digital',
  accountManager: 'account@jcmarketing.digital',
  finance: 'finanzas@jcmarketing.digital',
  clientReviewer: 'revisor@nordika.demo',
  clientViewer: 'lector@nordika.demo',
  otherTenantAdmin: 'admin@aurora.demo',
  disabled: 'desactivado@nordika.demo',
} as const

export async function login(page: Page, email: string, password: string = DEMO_PASSWORD): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  // Espera a que la navegación resuelva (panel, portal) o a que aparezca el error.
  await Promise.race([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 }),
    page.locator('main').getByRole('alert').first().waitFor({ state: 'visible', timeout: 15_000 }),
  ]).catch(() => undefined)
}

/**
 * Alertas del formulario. Se acota a `main` porque Next inserta su propio
 * `role="alert"` (el anunciador de rutas) fuera del contenido de la página.
 */
export function formAlert(page: Page): Locator {
  return page.locator('main').getByRole('alert').first()
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await page.waitForURL('**/login')
}

/** Recupera el último enlace escrito por el driver de email de desarrollo. */
export function lastEmailLink(pattern: RegExp): string | null {
  const dir = join(process.cwd(), '.mail')
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    return null
  }
  const contents = files
    .map((file) => ({ file, body: readFileSync(join(dir, file), 'utf8') }))
    .filter((entry) => pattern.test(entry.body))
  const last = contents.at(-1)
  if (!last) return null
  const match = last.body.match(pattern)
  return match ? match[0] : null
}

/**
 * Limpia los contadores de rate limiting entre tests.
 *
 * El límite de 8 intentos de login por IP es real y deseado en producción; en
 * la suite, todos los tests salen de la misma IP y lo agotarían. Se limpia el
 * contador en vez de aflojar el límite, para no tener un producto distinto en
 * desarrollo y en producción.
 */
export async function resetRateLimits(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) return
  const client = new PgClient({ connectionString: url })
  await client.connect()
  try {
    await client.query('DELETE FROM rate_limit_counters')
    await client.query('UPDATE users SET "failedLoginCount" = 0, "lockedUntil" = NULL')
  } finally {
    await client.end()
  }
}

/**
 * Devuelve las candidaturas de una campaña al estado "esperando decisión".
 *
 * La suite corre en serie contra una única base sembrada, así que un test que
 * aprueba deja sin pendientes al siguiente. Cada test del portal arranca desde
 * su propio punto de partida en vez de depender del orden.
 */
/**
 * Borra las preferencias de vista.
 *
 * La preferencia se guarda a propósito y sobrevive entre tests, así que sin
 * esto un test que cambia de vista le rompe el default al siguiente. Es la
 * función funcionando, no un efecto raro.
 */
export async function resetVistasGuardadas(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) return
  const client = new PgClient({ connectionString: url })
  await client.connect()
  try {
    await client.query(`DELETE FROM saved_views WHERE resource = 'campaign_view'`)
  } finally {
    await client.end()
  }
}

export async function resetAprobaciones(campaignName: string): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) return
  const client = new PgClient({ connectionString: url })
  await client.connect()
  try {
    await client.query(
      `UPDATE candidacies SET "clientApproval" = 'PENDING', "clientApprovalAt" = NULL
       WHERE "campaignId" IN (SELECT id FROM campaigns WHERE name = $1)`,
      [campaignName],
    )
  } finally {
    await client.end()
  }
}
