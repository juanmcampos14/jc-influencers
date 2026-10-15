import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

// Parámetros OWASP para scrypt (N=2^17, r=8, p=1).
const PARAMS = { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }
const KEYLEN = 64
const SALT_BYTES = 16

/** Hashea una contraseña. Formato: `scrypt$N$r$p$saltB64$hashB64`. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const derived = await scrypt(plain.normalize('NFKC'), salt, KEYLEN, PARAMS)
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$')
}

/** Verifica una contraseña en tiempo constante. Nunca lanza por formato inválido. */
export async function verifyPassword(plain: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  const saltB64 = parts[4]
  const hashB64 = parts[5]
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || !saltB64 || !hashB64) return false
  try {
    const expected = Buffer.from(hashB64, 'base64')
    const derived = await scrypt(plain.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
      N,
      r,
      p,
      maxmem: 256 * 1024 * 1024,
    })
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/**
 * El largo mínimo. Se exporta porque el texto de `claveCorta` lo nombra: hay
 * un test que falla si uno cambia sin el otro.
 */
export const MIN_LENGTH = 12

/** Política de contraseñas. Devuelve la lista de problemas encontrados. */
/**
 * Qué le falta a una contraseña, como claves de traducción.
 *
 * Las frases viajan como clave porque terminan en `fieldErrors`, debajo del
 * campo, y eso lo lee una persona en su idioma. El valor del mínimo va adentro
 * de la clave que lo necesita.
 */
export function passwordProblems(plain: string): string[] {
  const problems: string[] = []
  if (plain.length < MIN_LENGTH) problems.push('claveCorta')
  if (!/[a-z]/.test(plain)) problems.push('claveSinMinuscula')
  if (!/[A-Z]/.test(plain)) problems.push('claveSinMayuscula')
  if (!/[0-9]/.test(plain)) problems.push('claveSinNumero')
  if (/^(.)\1+$/.test(plain)) problems.push('claveRepetida')
  return problems
}
