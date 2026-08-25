import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** Token opaco de 256 bits en base64url. Es lo único que viaja al usuario. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** En base sólo se guarda el hash. Robar la base no da tokens usables. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Normaliza un email para comparaciones y almacenamiento. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
