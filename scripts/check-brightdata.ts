import 'server-only'

/**
 * Chequea la configuración de Bright Data antes de gastar plata.
 *
 *   npm run scouting:check          -> sólo lo que se puede verificar gratis
 *   npm run scouting:check -- --real -> además pide UN registro de cada dataset
 *
 * La API no tiene un endpoint para validar un dataset sin correrlo, así que la
 * verificación completa cuesta algunos milésimos de dólar. El modo por defecto
 * no gasta nada: valida el token y muestra qué falta.
 */

const BASE = 'https://api.brightdata.com/datasets/v3'

type Check = { nombre: string; ok: boolean; detalle: string }
const resultados: Check[] = []
const anotar = (nombre: string, ok: boolean, detalle: string) => resultados.push({ nombre, ok, detalle })

const token = process.env.BRIGHTDATA_API_TOKEN
const datasets = {
  'Instagram · perfiles': process.env.BRIGHTDATA_DATASET_INSTAGRAM_PROFILES,
  'Instagram · descubrir': process.env.BRIGHTDATA_DATASET_INSTAGRAM_DISCOVER,
  'TikTok · perfiles': process.env.BRIGHTDATA_DATASET_TIKTOK_PROFILES,
  'TikTok · descubrir': process.env.BRIGHTDATA_DATASET_TIKTOK_DISCOVER,
} as const

async function pedir(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

async function main(): Promise<void> {
  if (!token) {
    console.error('Falta BRIGHTDATA_API_TOKEN. Cargalo en .env (local) y en Vercel (producción).')
    process.exitCode = 1
    return
  }

  // Un dataset inexistente con token válido responde 4xx propio del dataset;
  // un token inválido responde 401 en cualquier pedido. Eso separa las causas.
  const sonda = await pedir('/snapshots?dataset_id=gd_token_probe_0000&limit=1')
  if (sonda.status === 401 || sonda.status === 403) {
    anotar('Token', false, `El proveedor rechazó el token (${sonda.status}). Revisá que sea el de API, no el de proxy.`)
  } else {
    anotar('Token', true, 'Aceptado por el proveedor.')
  }

  const costo = process.env.BRIGHTDATA_COST_PER_RECORD_USD
  // Estos dos tienen valor por defecto en el código: no tenerlos acá no es un
  // error, pero conviene verlos porque son el freno de gasto.
  anotar(
    'Costo por registro',
    true,
    costo
      ? `US$ ${costo} por registro. Tiene que coincidir con tu plan: si es más bajo que el real, el tope de gasto miente.`
      : 'Sin definir; se usa el valor por defecto del código.',
  )

  const tope = process.env.SCOUTING_MONTHLY_LIMIT_USD
  anotar('Tope mensual', true, tope ? `US$ ${tope} por cliente y por mes.` : 'Sin definir acá; se usa el valor por defecto.')

  for (const [nombre, id] of Object.entries(datasets)) {
    if (!id) {
      anotar(nombre, false, 'Sin configurar: esa combinación de red y modo queda deshabilitada en la aplicación.')
      continue
    }
    if (!/^gd_[a-z0-9]+$/i.test(id)) {
      anotar(nombre, false, `"${id}" no tiene forma de identificador de dataset (empiezan con gd_).`)
      continue
    }
    const response = await pedir(`/snapshots?dataset_id=${encodeURIComponent(id)}&limit=1`)
    if (response.ok) {
      anotar(nombre, true, `${id} — el proveedor lo reconoce.`)
    } else if (response.status === 401 || response.status === 403) {
      anotar(nombre, false, `${id} — el token no tiene acceso a este dataset.`)
    } else {
      const detalle = (await response.text().catch(() => '')).slice(0, 160)
      anotar(nombre, false, `${id} — el proveedor respondió ${response.status}. ${detalle}`)
    }
  }

  const ancho = Math.max(...resultados.map((r) => r.nombre.length))
  for (const r of resultados) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.nombre.padEnd(ancho)}  ${r.detalle}`)
  }

  const fallan = resultados.filter((r) => !r.ok)
  console.log('')
  console.log(fallan.length === 0 ? 'Scouting listo.' : `${fallan.length} punto(s) a resolver antes de usar scouting.`)
  if (fallan.length > 0) process.exitCode = 1
}

await main()
