/**
 * Prepara una base de producción recién migrada:
 * carga los catálogos y crea UNA cuenta de administrador de agencia.
 *
 * A diferencia del seed, no crea clientes ni influencers de demostración.
 *
 *   DATABASE_URL="..." ADMIN_EMAIL="vos@dominio" ADMIN_NAME="Tu Nombre" \
 *     npm run db:bootstrap
 *
 * Si no se pasa ADMIN_PASSWORD, se genera una y se imprime una sola vez.
 * Es idempotente: correrlo de nuevo no duplica nada ni cambia la contraseña.
 */
import '../src/lib/bootstrap-env'
import { randomBytes } from 'node:crypto'
import { withSystemScope } from '../src/lib/db/scope'
import { hashPassword, passwordProblems } from '../src/lib/auth/password'
import { normalizeEmail } from '../src/lib/auth/tokens'
import { CANDIDACY_STATUS_SEED, NICHE_SEED } from '../src/lib/domain/statuses'

const TAGS = [
  { key: 'prioritario', label: 'Prioritario', color: 'emerald' },
  { key: 'auditar-engagement', label: 'Auditar engagement', color: 'amber' },
  { key: 'trabajo-previo', label: 'Trabajó con nosotros', color: 'blue' },
  { key: 'excepcion-rango', label: 'Excepción al rango', color: 'violet' },
]

function generarClave(): string {
  // Sin símbolos ambiguos, para poder dictarla sin errores.
  const alfabeto = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(24)
  return `Jc.${[...bytes].map((b) => alfabeto[b % alfabeto.length]).join('')}.26`
}

async function main(): Promise<void> {
  const email = normalizeEmail(process.env.ADMIN_EMAIL ?? '')
  if (!email) throw new Error('Falta ADMIN_EMAIL')
  const nombre = process.env.ADMIN_NAME?.trim() || 'Administrador'
  const clave = process.env.ADMIN_PASSWORD ?? generarClave()

  const problemas = passwordProblems(clave)
  if (problemas.length > 0) throw new Error(`La contraseña no cumple la política: ${problemas.join(' ')}`)

  const passwordHash = await hashPassword(clave)

  const { creado } = await withSystemScope(
    async (tx) => {
      for (const [index, niche] of NICHE_SEED.entries()) {
        await tx.niche.upsert({
          where: { key: niche.key },
          create: { key: niche.key, label: niche.label, order: index },
          update: { label: niche.label, order: index },
        })
      }
      for (const status of CANDIDACY_STATUS_SEED) {
        await tx.candidacyStatusDef.upsert({ where: { key: status.key }, create: status, update: {} })
      }
      for (const tag of TAGS) {
        await tx.tag.upsert({ where: { key: tag.key }, create: tag, update: {} })
      }

      const existente = await tx.user.findUnique({ where: { email } })
      if (existente) {
        await tx.agencyMembership.upsert({
          where: { userId: existente.id },
          create: { userId: existente.id, role: 'AGENCY_ADMIN' },
          update: { role: 'AGENCY_ADMIN' },
        })
        return { creado: false }
      }

      const user = await tx.user.create({
        data: { email, name: nombre, passwordHash, passwordSetAt: new Date(), status: 'ACTIVE' },
      })
      await tx.agencyMembership.create({ data: { userId: user.id, role: 'AGENCY_ADMIN' } })
      return { creado: true }
    },
    { timeoutMs: 120_000 },
  )

  console.info('')
  console.info('Catálogos cargados (estados de candidatura, nichos y etiquetas).')
  if (creado) {
    console.info(`Administrador de agencia creado: ${email}`)
    if (!process.env.ADMIN_PASSWORD) {
      console.info('')
      console.info('  Contraseña (se muestra una sola vez):')
      console.info(`  ${clave}`)
      console.info('')
      console.info('  Guardala en tu gestor de contraseñas antes de cerrar esta ventana.')
    }
  } else {
    console.info(`El usuario ${email} ya existía. Se le confirmó el rol de administrador de agencia.`)
    console.info('La contraseña quedó como estaba.')
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
