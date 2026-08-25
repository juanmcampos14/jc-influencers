import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

/**
 * Cliente Prisma único.
 *
 * Se conecta con el rol de aplicación (`jc_app`), que NO tiene BYPASSRLS: las
 * políticas de Row-Level Security se aplican de verdad.
 *
 * En Vercel cada instancia serverless es efímera y puede haber muchas a la vez,
 * así que el pool local es chico y se apoya en el pooler de Supabase. El pooler
 * en modo transacción es compatible con `SET LOCAL`, que es lo que usa
 * `withScope` para fijar el alcance: la transacción entera vive en una sola
 * conexión del servidor.
 */
const globalForPrisma = globalThis as unknown as { __jcPrisma?: PrismaClient }

const isServerless = Boolean(process.env.VERCEL)

function create(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('Falta DATABASE_URL')

  const pool = new Pool({
    connectionString,
    // Con pooler externo no tiene sentido acumular conexiones acá.
    max: isServerless ? 1 : 10,
    idleTimeoutMillis: isServerless ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    // Supabase exige TLS; su certificado no encadena a una CA pública.
    ssl: /supabase\.(com|co)/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
    application_name: 'jc-influencers',
  })

  const adapter = new PrismaPg(pool)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const prisma: PrismaClient = globalForPrisma.__jcPrisma ?? create()

if (process.env.NODE_ENV !== 'production') globalForPrisma.__jcPrisma = prisma
