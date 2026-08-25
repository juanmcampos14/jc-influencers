import 'server-only'
import '../src/lib/bootstrap-env'
import { scoutingProvider } from '../src/lib/ports/scouting'

/**
 * Trae UN perfil real del proveedor y muestra cómo quedó interpretado.
 *
 *   npm run scouting:smoke -- https://www.instagram.com/nasa
 *
 * GASTA: un registro (hoy US$ 0,0015). Es la única forma de comprobar que lo
 * que devuelve el proveedor entra bien en nuestro modelo; el resto de los
 * chequeos son gratis y no prueban el parseo.
 */

const url = process.argv[2] ?? 'https://www.instagram.com/nasa'

const provider = scoutingProvider()
if (!provider.configured) {
  console.error('El proveedor no está configurado. Corré primero: npm run scouting:check')
  process.exit(1)
}

console.log(`Proveedor: ${provider.name} · costo estimado: US$ ${provider.unitCostUsd('INSTAGRAM').toFixed(4)}`)
console.log(`Pidiendo: ${url}`)

const job = await provider.startEnrich({ platform: 'INSTAGRAM', urls: [url] })
console.log(`Trabajo: ${job.jobId}`)

const inicio = Date.now()
for (;;) {
  const progreso = await provider.poll(job)
  if (progreso.status === 'RUNNING') {
    console.log(`  … en curso (${progreso.collected} recolectados, ${Math.round((Date.now() - inicio) / 1000)}s)`)
    await new Promise((r) => setTimeout(r, 10_000))
    continue
  }
  if (progreso.status === 'FAILED') {
    console.error(`FALLÓ: ${progreso.message}`)
    process.exit(1)
  }
  console.log('')
  for (const registro of progreso.records) {
    const { raw: _raw, ...limpio } = registro
    console.log(limpio)
  }
  console.log('')
  console.log(`${progreso.records.length} registro(s) en ${Math.round((Date.now() - inicio) / 1000)}s.`)
  break
}
