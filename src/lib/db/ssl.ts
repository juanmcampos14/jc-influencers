import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * TLS hacia la base de datos.
 *
 * El pooler de Supabase presenta un certificado firmado por su propia CA, que no
 * está entre las de confianza del sistema. La salida fácil sería
 * `rejectUnauthorized: false`, pero eso acepta CUALQUIER certificado y deja la
 * conexión abierta a un intermediario. En vez de eso se fija la CA de Supabase:
 * el certificado se sigue verificando, sólo que contra la CA correcta.
 *
 * Si la CA rota, se puede pasar la nueva por `DATABASE_CA_CERT` sin desplegar.
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
 * Sólo se aplica a Supabase; contra un Postgres local no hay TLS que verificar.
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
