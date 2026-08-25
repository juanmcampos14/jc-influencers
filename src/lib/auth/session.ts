import { createHmac } from 'node:crypto'
import { cookies } from 'next/headers'
import { env, isProduction } from '@/lib/env'
import { withSystemScope, type Tx } from '@/lib/db/scope'
import { generateToken, hashToken, safeEquals } from './tokens'

export const SESSION_COOKIE = 'jc_session'
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 12 horas
const SLIDING_REFRESH_MS = 30 * 60 * 1000 // refrescar lastSeenAt como máximo cada 30 min

export type SessionCookieOptions = {
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: string
  maxAge?: number
  expires?: Date
}

export function sessionCookieOptions(expires?: Date): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    ...(expires ? { expires } : {}),
  }
}

/**
 * Token CSRF derivado del token de sesión (double-submit firmado).
 * No se puede calcular sin la cookie de sesión, que es HttpOnly.
 */
export function deriveCsrfToken(sessionToken: string): string {
  return createHmac('sha256', env().SESSION_SECRET).update(`csrf:${sessionToken}`).digest('base64url')
}

export function verifyCsrfToken(sessionToken: string, submitted: string | null | undefined): boolean {
  if (!submitted) return false
  return safeEquals(deriveCsrfToken(sessionToken), submitted)
}

export type CreatedSession = { id: string; token: string; csrfToken: string; expiresAt: Date }

export async function createSession(
  tx: Tx,
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null },
  now: Date = new Date(),
): Promise<CreatedSession> {
  const token = generateToken(32)
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
  const session = await tx.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    },
  })
  return { id: session.id, token, csrfToken: deriveCsrfToken(token), expiresAt }
}

export type LoadedSession = {
  sessionId: string
  token: string
  activeClientId: string | null
  expiresAt: Date
  userId: string
}

/** Busca la sesión por su token. Devuelve null si no existe, venció o fue revocada. */
export async function loadSessionByToken(token: string, now: Date = new Date()): Promise<LoadedSession | null> {
  const record = await withSystemScope((tx) =>
    tx.session.findUnique({ where: { tokenHash: hashToken(token) } }),
  )
  if (!record) return null
  if (record.revokedAt) return null
  if (record.expiresAt.getTime() <= now.getTime()) return null

  if (now.getTime() - record.lastSeenAt.getTime() > SLIDING_REFRESH_MS) {
    await withSystemScope((tx) =>
      tx.session.update({ where: { id: record.id }, data: { lastSeenAt: now } }),
    ).catch(() => undefined)
  }

  return {
    sessionId: record.id,
    token,
    activeClientId: record.activeClientId,
    expiresAt: record.expiresAt,
    userId: record.userId,
  }
}

export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  await withSystemScope((tx) =>
    tx.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    }),
  )
}

export async function revokeAllSessionsForUser(userId: string, reason: string): Promise<number> {
  const result = await withSystemScope((tx) =>
    tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    }),
  )
  return result.count
}

export async function setActiveClient(sessionId: string, clientId: string | null): Promise<void> {
  await withSystemScope((tx) => tx.session.update({ where: { id: sessionId }, data: { activeClientId: clientId } }))
}

export async function readSessionCookie(): Promise<string | null> {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value ?? null
}
