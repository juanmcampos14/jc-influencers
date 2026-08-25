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

function instance(): PrismaClient {
  if (!globalForPrisma.__jcPrisma) globalForPrisma.__jcPrisma = create()
  return globalForPrisma.__jcPrisma
}

/**
 * El cliente se construye la primera vez que se USA, no al importar el módulo.
 *
 * Durante `next build` se evalúan los módulos de todas las rutas sin que haya
 * base de datos: si el cliente se creara al importar, el build fallaría con
 * "Falta DATABASE_URL" antes de compilar nada. Importar tiene que ser inocuo;
 * lo que necesita credenciales es conectarse.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(instance() as object, property, receiver) as unknown
  },
  set(_target, property, value) {
    return Reflect.set(instance() as object, property, value)
  },
  has(_target, property) {
    return Reflect.has(instance() as object, property)
  },
})
