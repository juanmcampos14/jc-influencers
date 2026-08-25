import 'server-only'
import '../src/lib/bootstrap-env'

/**
 * Chequea la configuración de scouting antes de gastar.
 *
 *   npm run scouting:check
 *
 * Valida el proveedor ACTIVO (`SCOUTING_PROVIDER`) y, si el otro también está
 * configurado, lo valida igual: tener el reemplazo listo y roto no sirve de
 * nada el día que haya que cambiar.
 *
 * Ninguna de estas comprobaciones dispara una recolección, así que no cuesta.
 */

type Check = { nombre: string; ok: boolean; detalle: string }

const activo = process.env.SCOUTING_PROVIDER ?? 'brightdata'

async function chequearBrightData(): Promise<Check[]> {
  const salida: Check[] = []
  const token = process.env.BRIGHTDATA_API_TOKEN
  if (!token) return [{ nombre: 'Bright Data', ok: false, detalle: 'Sin BRIGHTDATA_API_TOKEN.' }]

  const pedir = (path: string) =>
    fetch(`https://api.brightdata.com/datasets/v3${path}`, { headers: { Authorization: `Bearer ${token}` } })

  const sonda = await pedir('/snapshots?dataset_id=gd_token_probe_0000&limit=1')
  salida.push(
    sonda.status === 401 || sonda.status === 403
      ? { nombre: 'Bright Data · token', ok: false, detalle: `Rechazado (${sonda.status}). ¿Es el token de API y no el de proxy?` }
      : { nombre: 'Bright Data · token', ok: true, detalle: 'Aceptado.' },
  )

  const datasets: Array<[string, string | undefined]> = [
    ['Instagram · perfiles', process.env.BRIGHTDATA_DATASET_INSTAGRAM_PROFILES],
    ['Instagram · descubrir', process.env.BRIGHTDATA_DATASET_INSTAGRAM_DISCOVER],
    ['TikTok · perfiles', process.env.BRIGHTDATA_DATASET_TIKTOK_PROFILES],
    ['TikTok · descubrir', process.env.BRIGHTDATA_DATASET_TIKTOK_DISCOVER],
    ['YouTube · perfiles', process.env.BRIGHTDATA_DATASET_YOUTUBE_PROFILES],
    ['YouTube · descubrir', process.env.BRIGHTDATA_DATASET_YOUTUBE_DISCOVER],
  ]

  for (const [nombre, id] of datasets) {
    if (!id) {
      // Instagram no tiene búsqueda de perfiles por palabra clave en Bright
      // Data. No es algo que falte cargar: no existe. Marcarlo como pendiente
      // mandaría a buscar un dataset que nadie va a encontrar.
      const inexistente = nombre === 'Instagram · descubrir'
      salida.push({
        nombre,
        ok: inexistente,
        detalle: inexistente
          ? 'Bright Data no busca perfiles de Instagram por palabra clave. Para eso está Apify.'
          : 'Sin configurar: esa combinación queda deshabilitada.',
      })
      continue
    }
    if (!/^gd_[a-z0-9]+$/i.test(id)) {
      salida.push({ nombre, ok: false, detalle: `"${id}" no tiene forma de dataset (empiezan con gd_).` })
      continue
    }
    const r = await pedir(`/snapshots?dataset_id=${encodeURIComponent(id)}&limit=1`)
    salida.push(
      r.ok
        ? { nombre, ok: true, detalle: `${id} — reconocido.` }
        : { nombre, ok: false, detalle: `${id} — el proveedor respondió ${r.status}.` },
    )
  }
  return salida
}

async function chequearApify(): Promise<Check[]> {
  const salida: Check[] = []
  const token = process.env.APIFY_TOKEN ?? process.env.APIFY_API_TOKEN
  if (!token) return [{ nombre: 'Apify', ok: false, detalle: 'Sin APIFY_TOKEN (ni APIFY_API_TOKEN).' }]

  const pedir = (path: string) =>
    fetch(`https://api.apify.com/v2${path}`, { headers: { Authorization: `Bearer ${token}` } })

  const yo = await pedir('/users/me')
  salida.push(
    yo.ok
      ? { nombre: 'Apify · token', ok: true, detalle: 'Aceptado.' }
      : { nombre: 'Apify · token', ok: false, detalle: `Rechazado (${yo.status}).` },
  )

  const actores: Array<[string, string | undefined]> = [
    ['Instagram · perfiles', process.env.APIFY_ACTOR_INSTAGRAM_PROFILES],
    ['Instagram · descubrir', process.env.APIFY_ACTOR_INSTAGRAM_DISCOVER],
    ['TikTok · perfiles', process.env.APIFY_ACTOR_TIKTOK_PROFILES],
    ['TikTok · descubrir', process.env.APIFY_ACTOR_TIKTOK_DISCOVER],
    ['YouTube · perfiles', process.env.APIFY_ACTOR_YOUTUBE_PROFILES],
    ['YouTube · descubrir', process.env.APIFY_ACTOR_YOUTUBE_DISCOVER],
  ]

  for (const [nombre, actor] of actores) {
    if (!actor) {
      salida.push({ nombre, ok: false, detalle: 'Sin configurar: esa combinación queda deshabilitada.' })
      continue
    }
    // Los actores se piden por `usuario~nombre`; la barra rompe la ruta.
    const r = await pedir(`/acts/${encodeURIComponent(actor)}`)
    salida.push(
      r.ok
        ? { nombre, ok: true, detalle: `${actor} — existe y es accesible.` }
        : {
            nombre,
            ok: false,
            detalle:
              r.status === 404
                ? `${actor} — no existe o no es público. Los actores de la comunidad cambian de nombre.`
                : `${actor} — Apify respondió ${r.status}.`,
          },
    )
  }
  return salida
}

async function main(): Promise<void> {
  console.log(`Proveedor activo: ${activo}\n`)

  const bloques: Array<[string, Check[]]> = []
  const hayApify = Boolean(process.env.APIFY_TOKEN ?? process.env.APIFY_API_TOKEN)
  const hayBright = Boolean(process.env.BRIGHTDATA_API_TOKEN)

  if (hayBright || activo === 'brightdata') bloques.push(['BRIGHT DATA', await chequearBrightData()])
  if (hayApify || activo === 'apify') bloques.push(['APIFY', await chequearApify()])

  for (const [titulo, checks] of bloques) {
    const esActivo = titulo.toLowerCase().replace(' ', '') === activo
    console.log(`── ${titulo}${esActivo ? '  (en uso)' : '  (de respaldo)'}`)
    const ancho = Math.max(...checks.map((c) => c.nombre.length))
    for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.nombre.padEnd(ancho)}  ${c.detalle}`)
    console.log('')
  }

  const costo = activo === 'apify' ? process.env.APIFY_COST_PER_RECORD_USD : process.env.BRIGHTDATA_COST_PER_RECORD_USD
  console.log(`Costo por registro: US$ ${costo ?? '(por defecto del código)'}`)
  console.log(`Tope mensual: US$ ${process.env.SCOUTING_MONTHLY_LIMIT_USD ?? '(por defecto del código)'} por cliente`)
  console.log('Si el costo cargado es menor que el real, el tope de gasto miente.')

  // Sólo el proveedor en uso decide el resultado: que el de respaldo esté a
  // medias es información, no un fallo.
  const activos = bloques.find(([titulo]) => titulo.toLowerCase().replace(' ', '') === activo)?.[1] ?? []
  const fallan = activos.filter((c) => !c.ok)
  console.log('')
  if (fallan.length === 0) {
    console.log('El proveedor en uso está listo.')
  } else {
    console.log(`${fallan.length} punto(s) a resolver en el proveedor en uso.`)
    process.exitCode = 1
  }
}

await main()
