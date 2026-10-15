import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * TLS hacia la base de datos.
 *
 * **Hoy la base está en Neon**, cuyos certificados los firma una autoridad
 * pública: alcanza con el almacén de confianza del sistema, y la verificación
 * de identidad la pide la propia cadena de conexión con `sslmode=verify-full`.
 * Para esos hosts esta función devuelve `undefined` a propósito --no hay nada
 * que fijar-- y el driver verifica igual.
 *
 * El caso de Supabase se mantiene porque su pooler presenta un certificado
 * firmado por su propia CA, que no está entre las del sistema. La salida fácil
 * habría sido `rejectUnauthorized: false`, pero eso acepta CUALQUIER
 * certificado y deja la conexión abierta a un intermediario; en vez de eso se
 * fija la CA correcta y se sigue verificando.
 *
 * Si esa CA rota, se puede pasar la nueva por `DATABASE_CA_CERT` sin desplegar.
 */

const CA_FILE = 'supabase-root-2021.crt'
let cached: string | null | undefined

function loadBundledCa(): string | null {
  // `process.cwd()` es la raíz del proyecto tanto en desarrollo como en Vercel.
  for (const candidate of [join(process.cwd(), 'certs', CA_FILE), join(process.cwd(), '..', 'certs', CA_FILE)]) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      continue
    }
  }
  return null
}

export function databaseCa(): string | null {
  if (cached !== undefined) return cached
  const fromEnv = process.env.DATABASE_CA_CERT?.trim()
  cached = fromEnv && fromEnv.includes('BEGIN CERTIFICATE') ? fromEnv : loadBundledCa()
  return cached
}

export type SslConfig = { ca: string; rejectUnauthorized: true } | undefined

/**
 * Configuración TLS para una cadena de conexión.
 *
 * Sólo fija una CA propia para Supabase. Contra Neon y contra un Postgres local
 * devuelve `undefined`: en el primero verifica el sistema --con el
 * `sslmode=verify-full` de la cadena-- y en el segundo no hay TLS que verificar.
 */
export function sslFor(connectionString: string): SslConfig {
  if (!/supabase\.(com|co)/.test(connectionString)) return undefined
  const ca = databaseCa()
  if (!ca) {
    // Preferible fallar ruidosamente a conectarse sin verificar.
    throw new Error(
      `Falta el certificado de la CA de Supabase (certs/${CA_FILE} o la variable DATABASE_CA_CERT). ` +
        'Sin él no se puede verificar la identidad del servidor de base de datos.',
    )
  }
  return { ca, rejectUnauthorized: true }
}
