import { cache } from 'react'
import { headers } from 'next/headers'
import { buildAuthContext, requireAuth, type AuthContext } from '@/lib/authz/context'
import { readSessionCookie } from './session'

function firstIp(value: string | null): string | null {
  if (!value) return null
  const first = value.split(',')[0]
  return first ? first.trim() : null
}

/** Contexto de la request actual. Cacheado por render para no repetir consultas. */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const [token, headerList] = await Promise.all([readSessionCookie(), headers()])
  return buildAuthContext(token, {
    ip: firstIp(headerList.get('x-forwarded-for')) ?? headerList.get('x-real-ip'),
    userAgent: headerList.get('user-agent'),
    correlationId: headerList.get('x-correlation-id') ?? undefined,
  })
})

export async function requireContext(): Promise<AuthContext> {
  return requireAuth(await getAuthContext())
}

/** Metadatos de la request para auditoría, sin necesidad de sesión. */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const headerList = await headers()
  return {
    ip: firstIp(headerList.get('x-forwarded-for')) ?? headerList.get('x-real-ip'),
    userAgent: headerList.get('user-agent'),
  }
}
