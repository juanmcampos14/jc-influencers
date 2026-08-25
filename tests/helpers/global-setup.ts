import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

/**
 * Prepara la base de test una sola vez: aplica todas las migraciones,
 * incluida la de Row-Level Security.
 */
export default function setup(): void {
  if (existsSync('.env')) process.loadEnvFile('.env')
  const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL ?? process.env.TEST_DATABASE_URL
  if (!migrationUrl) throw new Error('Falta TEST_MIGRATION_DATABASE_URL')

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, MIGRATION_DATABASE_URL: migrationUrl },
    stdio: 'inherit',
  })
}
