import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

/**
 * Cliente Prisma único. Se conecta con el rol de aplicación (`jc_app`),
 * que NO tiene BYPASSRLS: las políticas de la base se aplican de verdad.
 */
const globalForPrisma = globalThis as unknown as { __jcPrisma?: PrismaClient }

function create(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('Falta DATABASE_URL')
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const prisma: PrismaClient = globalForPrisma.__jcPrisma ?? create()

if (process.env.NODE_ENV !== 'production') globalForPrisma.__jcPrisma = prisma
