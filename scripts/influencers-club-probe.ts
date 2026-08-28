/**
 * Prueba la conexión con influencers.club y verifica el contrato.
 *
 *   npm run ic:probe            ← saldo y una búsqueda chica (cuesta ~0,05 créditos)
 *   npm run ic:probe -- --saldo ← sólo el saldo, no cuesta nada
 *
 * Cobra 0,01 créditos por creador DEVUELTO, así que la búsqueda de prueba pide
 * 5 y no más. Con los 10 créditos del plan de prueba alcanza de sobra.
 */
import 'dotenv/config'
import { cuerpoDeBusqueda, leerCreador, leerSobre } from '../src/lib/ports/influencers-club-consulta'

const BASE = 'https://api-dashboard.influencers.club'
const key = process.env.INFLUENCERS_CLUB_API_KEY ?? ''
const soloSaldo = process.argv.includes('--saldo')

async function pedir(path: string, init?: RequestInit): Promise<{ status: number; json: unknown; texto: string }> {
  const respuesta = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...(init?.headers ?? {}) },
  })
  const texto = await respuesta.text()
  try {
    return { status: respuesta.status, json: JSON.parse(texto), texto }
  } catch {
    return { status: respuesta.status, json: null, texto }
  }
}

async function main(): Promise<void> {
  if (!key) {
    console.log('Falta la clave.\n')
    console.log('Cargá en .env:')
    console.log('  INFLUENCERS_CLUB_API_KEY=<la clave del panel>')
    console.log('  INFLUENCERS_CLUB_COST_PER_CREDIT_USD=<lo que te sale un crédito, ej 0.23>')
    process.exitCode = 1
    return
  }

  console.log('→ saldo')
  const saldo = await pedir('/public/v1/account/credits')
  console.log(`← HTTP ${saldo.status}`)
  console.log(saldo.json ? JSON.stringify(saldo.json, null, 2).slice(0, 800) : saldo.texto.slice(0, 400))
  if (saldo.status !== 200) {
    console.log('\nLa clave no funciona o el endpoint cambió. No sigo: una búsqueda con clave mala no aporta nada.')
    process.exitCode = 1
    return
  }
  if (soloSaldo) return

  const cuerpo = cuerpoDeBusqueda({
    platform: 'INSTAGRAM',
    palabras: [],
    filtros: { pais: 'AR', seguidoresDesde: 10_000, seguidoresHasta: 100_000 },
    audiencia: { paisDelPublico: { pais: 'AR', porcentajeMinimo: 50 } },
    pagina: 1,
    limite: 5,
  })

  console.log('\n→ POST /public/v1/discovery/  (5 creadores ≈ 0,05 créditos)')
  console.log(JSON.stringify(cuerpo, null, 2))

  const busqueda = await pedir('/public/v1/discovery/', { method: 'POST', body: JSON.stringify(cuerpo) })
  console.log(`\n← HTTP ${busqueda.status}`)

  const sobre = leerSobre(busqueda.json)
  if (!sobre.ok) {
    console.log(`\nRechazó la consulta: ${sobre.mensaje}`)
    console.log('Crudo:', busqueda.texto.slice(0, 1200))
    process.exitCode = 1
    return
  }

  console.log(`\nCreadores devueltos: ${sobre.creadores.length}`)
  if (sobre.total !== null) console.log(`Coinciden en total: ${sobre.total}`)
  if (sobre.creditosRestantes !== null) console.log(`Créditos restantes: ${sobre.creditosRestantes}`)

  const leidos = sobre.creadores.map((c) => leerCreador('INSTAGRAM', c))
  const validos = leidos.filter((c) => c !== null)
  console.log(`Se pudieron leer: ${validos.length} de ${sobre.creadores.length}`)

  if (validos.length < sobre.creadores.length) {
    console.log('\nOJO: hay filas que no se pudieron leer. La forma de la respuesta cambió.')
    console.log('Ejemplo:', JSON.stringify(sobre.creadores[leidos.findIndex((c) => c === null)]).slice(0, 800))
  }

  for (const c of validos) {
    console.log(`  @${c.handle} — ${c.followers ?? 'sin dato'} seg. — ER ${c.engagementRate ?? 'sin dato'} — ${c.displayName ?? 'sin nombre'}`)
  }

  /*
   * La pregunta que ningún vendedor contesta: ¿cuánta gente argentina de
   * verdad hay? El total de coincidencias vale más que los cinco de la muestra.
   */
  console.log('\n--- lo que importa decidir ---')
  console.log(`Argentinos de 10k a 100k con audiencia mayormente argentina: ${sobre.total ?? 'no lo informó'}`)
  console.log('Si ese número es chico, la base no sirve para nuestros clientes por más que tenga 340 millones.')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
