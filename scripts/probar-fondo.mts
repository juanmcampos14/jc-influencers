/**
 * Qué encontraría el estudio de marca en un sitio, sin tocar la base.
 *
 * Sirve para responder "¿por qué eligió esa imagen?" antes de configurar un
 * cliente, y para probar cambios en la detección contra sitios reales.
 *
 *   npx tsx --conditions=react-server scripts/probar-fondo.mts https://lamarca.com
 */
import { extractFromWebsite } from '../src/lib/ports/brand-extractor'

const sitio = process.argv[2]
if (!sitio) {
  console.error('Pasá la dirección del sitio.')
  process.exit(1)
}

const r = await extractFromWebsite(sitio, 'DARK')
console.log('\nSitio:', r.siteTitle)
console.log('Logo:', r.logo?.url ?? 'no encontrado')
console.log('Colores:', r.colors.slice(0, 4).map((c) => c.hex).join(' '))
console.log('\nFondos encontrados:', r.backdrops.length)
for (const f of r.backdrops) {
  console.log(`  ${f.width}x${f.height} ${f.isDark ? 'oscura' : 'clara'} ${Math.round(f.data.byteLength / 1024)}KB`)
  console.log(`    ${f.url.slice(0, 110)}`)
}
if (r.warnings.length > 0) console.log('\nAvisos:', r.warnings.join(' | '))
