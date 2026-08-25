import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

// Prisma 7 ya no carga `.env` automáticamente.
if (existsSync('.env')) process.loadEnvFile('.env')

/**
 * La URL de migraciones es opcional a propósito.
 *
 * Este archivo lo carga TODO comando de Prisma, incluido `prisma generate`, que
 * corre en el build de Vercel donde no hay variables de base de datos cargadas.
 * Exigirla acá rompía el build entero por un comando que no la necesita.
 *
 * Los comandos que sí la necesitan (`migrate`, `studio`) fallan solos, con el
 * mensaje de Prisma, si no está.
 */
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx --conditions=react-server prisma/seed.ts' },
  ...(url ? { datasource: { url } } : {}),
})
