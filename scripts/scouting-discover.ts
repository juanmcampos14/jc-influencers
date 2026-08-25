import 'server-only'
import '../src/lib/bootstrap-env'
import type { Platform } from '../src/generated/prisma/enums'
import { scoutingProvider } from '../src/lib/ports/scouting'

/**
 * Descubre perfiles de verdad con el proveedor configurado.
 *
 *   npm run scouting:descubrir -- YOUTUBE "fitness argentina" 8
 *
 * GASTA: hasta `tope` registros. El tope se manda al proveedor, no se aplica
 * después: un descubrimiento sin tope devolvió 387 registros en una prueba.
 */
const plataforma = (process.argv[2] ?? 'YOUTUBE').toUpperCase() as Platform
const palabra = process.argv[3] ?? 'fitness argentina'
const tope = Number(process.argv[4] ?? 8)

const provider = scoutingProvider()
if (!provider.configured) {
  console.error('El proveedor no está configurado. Corré primero: npm run scouting:check')
  process.exit(1)
}
if (!provider.supports(plataforma, 'DISCOVER')) {
  console.error(`${provider.name} no descubre perfiles en ${plataforma}.`)
  process.exit(1)
}

console.log(`Proveedor: ${provider.name} · ${plataforma} · "${palabra}" · tope ${tope}`)
console.log(`Costo máximo: US$ ${(provider.unitCostUsd(plataforma) * tope).toFixed(4)}`)

const job = await provider.startDiscover({ platform: plataforma, keywords: [palabra], limit: tope, country: 'AR' })
const inicio = Date.now()
for (;;) {
  const progreso = await provider.poll(job)
  if (progreso.status === 'RUNNING') {
    console.log(`  … ${progreso.collected} recolectados · ${Math.round((Date.now() - inicio) / 1000)}s`)
    await new Promise((r) => setTimeout(r, 12_000))
    continue
  }
  if (progreso.status === 'FAILED') {
    console.error(`FALLÓ: ${progreso.message}`)
    process.exit(1)
  }
  console.log(`\n${progreso.records.length} perfiles distintos en ${Math.round((Date.now() - inicio) / 1000)}s:\n`)
  for (const r of progreso.records) {
    const seg = r.followers === null ? '—' : r.followers.toLocaleString('es-AR')
    console.log(`  ${(r.handle ?? '?').padEnd(24)} ${seg.padStart(12)}  ${(r.displayName ?? '').slice(0, 28).padEnd(30)} ${r.url}`)
  }
  break
}
