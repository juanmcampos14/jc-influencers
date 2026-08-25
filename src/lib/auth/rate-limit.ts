import { RateLimitError } from '@/lib/authz/errors'
import { withSystemScope } from '@/lib/db/scope'

export type RateLimitRule = { limit: number; windowSeconds: number }

/** Límites por acción sensible. */
export const RATE_LIMITS = {
  login: { limit: 8, windowSeconds: 15 * 60 },
  loginPerEmail: { limit: 6, windowSeconds: 15 * 60 },
  passwordReset: { limit: 5, windowSeconds: 60 * 60 },
  invitation: { limit: 30, windowSeconds: 60 * 60 },
  invitationAccept: { limit: 10, windowSeconds: 15 * 60 },
  exportCreate: { limit: 30, windowSeconds: 60 * 60 },
  importRun: { limit: 10, windowSeconds: 60 * 60 },
  scoutingRun: { limit: 20, windowSeconds: 60 * 60 },
  aiRun: { limit: 60, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>

export type RateLimitName = keyof typeof RATE_LIMITS

function windowStart(windowSeconds: number, now: Date): Date {
  const ms = windowSeconds * 1000
  return new Date(Math.floor(now.getTime() / ms) * ms)
}

/**
 * Ventana fija persistida en base (sirve con varias instancias de la app).
 * Lanza RateLimitError cuando se supera el límite.
 */
export async function consumeRateLimit(
  name: RateLimitName,
  discriminator: string,
  now: Date = new Date(),
): Promise<void> {
  const rule = RATE_LIMITS[name]
  const bucket = `${name}:${discriminator}`
  const start = windowStart(rule.windowSeconds, now)
  const expiresAt = new Date(start.getTime() + rule.windowSeconds * 1000)

  const counter = await withSystemScope((tx) =>
    tx.rateLimitCounter.upsert({
      where: { bucket_windowStart: { bucket, windowStart: start } },
      create: { bucket, windowStart: start, count: 1, expiresAt },
      update: { count: { increment: 1 } },
    }),
  )

  if (counter.count > rule.limit) {
    const retryAfter = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000))
    throw new RateLimitError(retryAfter)
  }
}

/** Limpieza de contadores vencidos. Se puede llamar desde un cron. */
export async function purgeExpiredRateLimits(now: Date = new Date()): Promise<number> {
  const result = await withSystemScope((tx) => tx.rateLimitCounter.deleteMany({ where: { expiresAt: { lt: now } } }))
  return result.count
}
