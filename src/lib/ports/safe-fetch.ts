import 'server-only'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Descarga de recursos externos indicados por el usuario.
 *
 * Traer una URL que escribe otra persona desde nuestro servidor es un vector de
 * SSRF: apuntando a `169.254.169.254` o a `localhost` se llega a la red interna
 * y a los metadatos del proveedor de hosting. Acá se resuelve el nombre primero,
 * se rechaza cualquier IP privada, se siguen los redirects a mano revisando cada
 * salto, y se cortan tamaño y tiempo.
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata.goog'])

/** Rangos que nunca deben alcanzarse desde una URL provista por el usuario. */
function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const value = address.toLowerCase()
    if (value === '::1' || value === '::') return true
    if (value.startsWith('fe80') || value.startsWith('fc') || value.startsWith('fd')) return true
    // IPv4 embebido en IPv6.
    const embedded = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (embedded?.[1]) return isPrivateAddress(embedded[1])
    return false
  }

  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a = 0, b = 0] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true // metadatos de la nube
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast y reservado
  return false
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new UnsafeUrlError('Esa dirección apunta a la red interna.')
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new UnsafeUrlError('Esa dirección apunta a la red interna.')
    return
  }
  let addresses: Array<{ address: string }>
  try {
    addresses = await lookup(host, { all: true })
  } catch {
    throw new UnsafeUrlError('No se pudo resolver ese dominio.')
  }
  if (addresses.length === 0) throw new UnsafeUrlError('No se pudo resolver ese dominio.')
  for (const entry of addresses) {
    if (isPrivateAddress(entry.address)) throw new UnsafeUrlError('Esa dirección apunta a la red interna.')
  }
}

export type SafeFetchOptions = {
  maxBytes?: number
  timeoutMs?: number
  maxRedirects?: number
  accept?: string
}

export type SafeFetchResult = {
  finalUrl: string
  status: number
  contentType: string
  body: Buffer
  truncated: boolean
}

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 12_000

/** Normaliza y valida una URL pública antes de tocarla. */
export function parsePublicUrl(input: string): URL {
  const raw = input.trim()
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    throw new UnsafeUrlError('No es una dirección válida.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Sólo se admiten direcciones http o https.')
  }
  if (url.username || url.password) throw new UnsafeUrlError('La dirección no puede llevar credenciales.')
  if (url.port && !['80', '443', ''].includes(url.port)) {
    throw new UnsafeUrlError('Sólo se admiten los puertos estándar 80 y 443.')
  }
  return url
}

export async function safeFetch(input: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const maxRedirects = options.maxRedirects ?? 4
  let url = parsePublicUrl(input)

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublicHost(url.hostname)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          // Identificarse es lo correcto: el dueño del sitio puede bloquearnos si quiere.
          'User-Agent': 'JCInfluencersBot/1.0 (+https://influencers.jcmarketing.digital)',
          Accept: options.accept ?? '*/*',
          'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
        },
      })
    } catch (error) {
      clearTimeout(timer)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new UnsafeUrlError('El sitio tardó demasiado en responder.')
      }
      throw new UnsafeUrlError('No se pudo conectar con ese sitio.')
    }
    clearTimeout(timer)

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new UnsafeUrlError('El sitio redirige a ninguna parte.')
      // Cada salto se vuelve a validar: el redirect es otro vector de SSRF.
      url = new URL(location, url)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new UnsafeUrlError('El sitio redirige a un protocolo no permitido.')
      }
      continue
    }

    const chunks: Buffer[] = []
    let total = 0
    let truncated = false
    if (response.body) {
      const reader = response.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        total += value.byteLength
        if (total > maxBytes) {
          chunks.push(Buffer.from(value.slice(0, Math.max(0, maxBytes - (total - value.byteLength)))))
          truncated = true
          await reader.cancel().catch(() => undefined)
          break
        }
        chunks.push(Buffer.from(value))
      }
    }

    return {
      finalUrl: url.toString(),
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      body: Buffer.concat(chunks),
      truncated,
    }
  }

  throw new UnsafeUrlError('El sitio redirige demasiadas veces.')
}
