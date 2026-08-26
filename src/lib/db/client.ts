import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { sslFor } from './ssl'

/**
 * Cliente Prisma único.
 *
 * Se conecta con el rol de aplicación (`jc_app`), que NO tiene BYPASSRLS: las
 * políticas de Row-Level Security se aplican de verdad.
 *
 * En Vercel el pool local es chico y se apoya en el pooler de Supabase. El
 * pooler en modo transacción es compatible con `SET LOCAL`, que es lo que usa
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
    /*
     * Con Fluid Compute una misma instancia atiende VARIOS pedidos a la vez.
     * Con una sola conexión, esos pedidos hacían cola entre ellos: dos personas
     * usando la app al mismo tiempo se esperaban mutuamente, y cada `scoped()`
     * ocupa la conexión durante toda su transacción.
     *
     * Cinco es chico a propósito: el pooler de Supabase es quien acumula
     * conexiones de verdad, y pasarse acá multiplica por cada instancia viva.
     */
    max: isServerless ? 5 : 10,
    /*
     * Diez segundos era demasiado poco. La conexión moría entre una pantalla y
     * la siguiente, y cada pedido volvía a pagar el saludo TLS contra el pooler
     * --que está en otra región--: unas cuatro idas y vueltas antes de la
     * primera consulta. Con Fluid Compute la instancia sobrevive entre pedidos,
     * así que la conexión también puede.
     */
    idleTimeoutMillis: isServerless ? 120_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    // Supabase firma con su propia CA: se verifica contra ella, no se saltea.
    ssl: sslFor(connectionString),
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
