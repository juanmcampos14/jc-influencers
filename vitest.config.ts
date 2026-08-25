import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

if (existsSync('.env')) process.loadEnvFile('.env')

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (!testDatabaseUrl) {
  throw new Error('Falta TEST_DATABASE_URL en .env para correr los tests de integración.')
}

export default defineConfig({
  resolve: {
    // `server-only` sólo resuelve a un módulo vacío bajo esta condición.
    conditions: ['react-server', 'node', 'import'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'next/headers': fileURLToPath(new URL('./tests/helpers/next-headers-stub.ts', import.meta.url)),
      'next/cache': fileURLToPath(new URL('./tests/helpers/next-cache-stub.ts', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/helpers/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Los tests de integración comparten una base: se corre un archivo por vez.
    fileParallelism: false,
    globalSetup: ['./tests/helpers/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      SESSION_SECRET: process.env.SESSION_SECRET ?? 'secreto-de-test-suficientemente-largo-1234567890',
      APP_URL: 'http://localhost:3100',
      EMAIL_DRIVER: 'console',
      STORAGE_DRIVER: 'db',
      STORAGE_LOCAL_DIR: './.test-storage',
    },
  },
})
