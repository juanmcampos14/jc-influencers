import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'

/** Deja la base de desarrollo con los datos de demostración antes de los E2E. */
export default function globalSetup(): void {
  if (existsSync('.env')) process.loadEnvFile('.env')
  if (existsSync('.mail')) rmSync('.mail', { recursive: true, force: true })
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit' })
  execFileSync('npx', ['tsx', '--conditions=react-server', 'prisma/seed.ts'], { stdio: 'inherit' })
}
