import { chromium } from '@playwright/test'
const BASE = 'http://127.0.0.1:3100'
const OUT = process.argv[2] ?? 'antes'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'es-AR' })
await page.goto(`${BASE}/login`)
await page.screenshot({ path: `/tmp/${OUT}-login.png` })
await page.getByLabel('Email').fill('admin@jcmarketing.digital')
await page.getByLabel('Contraseña').fill('Demo.2026!seguro')
await page.getByRole('button', { name: 'Ingresar' }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })
for (const [nombre, ruta] of [['panel','/'],['campanas','/campanas'],['influencers','/influencers'],['clientes','/clientes']]) {
  await page.goto(`${BASE}${ruta}`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `/tmp/${OUT}-${nombre}.png`, fullPage: false })
}
// una campaña con datos
await page.goto(`${BASE}/campanas`)
const link = page.locator('main a[href^="/campanas/"]').first()
if (await link.count()) { await link.click(); await page.waitForLoadState('networkidle'); await page.screenshot({ path: `/tmp/${OUT}-campana.png` }) }
await browser.close()
console.log('listo', OUT)
