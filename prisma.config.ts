import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

// Prisma 7 ya no carga `.env` automáticamente.
if (existsSync('.env')) process.loadEnvFile('.env')

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
if (!url) throw new Error('Falta MIGRATION_DATABASE_URL (o DATABASE_URL) para ejecutar migraciones.')

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url },
})
