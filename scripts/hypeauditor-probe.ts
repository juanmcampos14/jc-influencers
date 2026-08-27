/**
 * Prueba la conexión con HypeAuditor sin tocar la aplicación.
 *
 * Corre contra el entorno de PRUEBA (`auditor.searchSandbox`) salvo que se le
 * pida lo contrario, así se puede verificar la integración entera antes de
 * gastar una consulta real.
 *
 *   npx tsx scripts/hypeauditor-probe.ts
 *   npx tsx scripts/hypeauditor-probe.ts --real     ← consulta de verdad, cuesta
 */
import 'dotenv/config'
import { cuerpoDeBusqueda, leerCreador, leerSobre } from '../src/lib/ports/hypeauditor-consulta'

const real = process.argv.includes('--real')
const authId = process.env.HYPEAUDITOR_AUTH_ID ?? ''
const token = process.env.HYPEAUDITOR_API_TOKEN ?? ''

async function main(): Promise<void> {
  if (!authId || !token) {
    console.log('Faltan credenciales.\n')
    console.log('Cargá en .env:')
    console.log('  HYPEAUDITOR_AUTH_ID=<Client ID>')
    console.log('  HYPEAUDITOR_API_TOKEN=<API token>')
    console.log('\nLas entrega HypeAuditor. Hasta el entorno de prueba las pide.')
    process.exitCode = 1
    return
  }

  const cuerpo = cuerpoDeBusqueda({
    platform: 'INSTAGRAM',
    palabras: ['gastronomia'],
    filtros: { seguidoresDesde: 10_000, seguidoresHasta: 200_000, pais: 'AR' },
    audiencia: { paisDelPublico: { pais: 'AR', porcentajeMinimo: 50 }, calidadMinima: 60 },
    pagina: 1,
  })

  const metodo = real ? 'auditor.search' : 'auditor.searchSandbox'
  console.log(`→ ${metodo}${real ? '  (CONSULTA REAL: esto se cobra)' : '  (entorno de prueba)'}`)
  console.log(JSON.stringify(cuerpo, null, 2))

  const respuesta = await fetch(`https://hypeauditor.com/api/method/${metodo}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth-Id': authId, 'X-Auth-Token': token },
    body: JSON.stringify(cuerpo),
  })

  const texto = await respuesta.text()
  console.log(`\n← HTTP ${respuesta.status}`)

  let json: unknown
  try {
    json = JSON.parse(texto)
  } catch {
    console.log('La respuesta no es JSON:\n', texto.slice(0, 600))
    process.exitCode = 1
    return
  }

  const sobre = leerSobre(json)
  if (!sobre.ok) {
    console.log(`\nHypeAuditor rechazó la consulta: ${sobre.mensaje}`)
    console.log('\nCrudo:', JSON.stringify(json).slice(0, 800))
    process.exitCode = 1
    return
  }

  console.log(`\nCreadores devueltos: ${sobre.creadores.length}`)
  if (sobre.consultasRestantes !== null) console.log(`Consultas restantes: ${sobre.consultasRestantes}`)

  const leidos = sobre.creadores.map((c) => leerCreador('INSTAGRAM', c))
  const validos = leidos.filter((c) => c !== null)
  console.log(`Se pudieron leer: ${validos.length} de ${sobre.creadores.length}`)

  if (validos.length < sobre.creadores.length) {
    console.log('\nOJO: hay filas que no se pudieron leer. La forma de la respuesta cambió.')
    const perdida = sobre.creadores[leidos.findIndex((c) => c === null)]
    console.log('Ejemplo:', JSON.stringify(perdida).slice(0, 600))
  }

  for (const c of validos.slice(0, 5)) {
    console.log(`  @${c.handle} — ${c.followers ?? 'sin dato'} seg. — ER ${c.engagementRate ?? 'sin dato'}`)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
