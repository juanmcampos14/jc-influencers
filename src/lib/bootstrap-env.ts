import { existsSync } from 'node:fs'

/**
 * Carga `.env` para procesos fuera de Next (seed, importador, tests).
 * Debe importarse ANTES que cualquier módulo que lea `process.env`.
 * No pisa variables ya definidas en el entorno.
 */
const file = process.env.ENV_FILE ?? '.env'
if (existsSync(file)) process.loadEnvFile(file)

export {}
