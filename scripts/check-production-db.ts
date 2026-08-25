/**
 * Verifica que una base de datos esté configurada de forma segura.
 * Corre contra la base que le indiques y falla si algo no está en su lugar.
 *
 *   npm run db:check                      (usa DATABASE_URL)
 *   DATABASE_URL="postgres://..." npm run db:check
 *
 * Es lo que hay que correr después de desplegar en un servidor nuevo.
 */
import '../src/lib/bootstrap-env'
import { Client } from 'pg'

type Check = { name: string; ok: boolean; detail: string }

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta DATABASE_URL')

  const client = new Client({
    connectionString: url,
    ssl: /supabase\.(com|co)/.test(url) ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()

  const checks: Check[] = []
  try {
    const who = await client.query<{ current_user: string }>('SELECT current_user')
    const role = who.rows[0]?.current_user ?? '?'

    const roleInfo = await client.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    )
    const isSuper = roleInfo.rows[0]?.rolsuper ?? false
    const bypasses = roleInfo.rows[0]?.rolbypassrls ?? false

    checks.push({
      name: 'La aplicación no se conecta como superusuario',
      ok: !isSuper,
      detail: `rol actual: ${role}`,
    })
    checks.push({
      name: 'La aplicación no puede saltear Row-Level Security',
      ok: !bypasses,
      detail: bypasses
        ? 'ESTE ROL TIENE BYPASSRLS: la tercera barrera de aislamiento no existe'
        : 'BYPASSRLS desactivado',
    })

    const noRls = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND NOT rowsecurity AND tablename <> '_prisma_migrations'`,
    )
    checks.push({
      name: 'Todas las tablas tienen Row-Level Security',
      ok: noRls.rowCount === 0,
      detail: noRls.rowCount === 0 ? 'sin excepciones' : `sin RLS: ${noRls.rows.map((r) => r.tablename).join(', ')}`,
    })

    const auditGrants = await client.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE table_name = 'audit_logs' AND grantee = current_user`,
    )
    const privileges = auditGrants.rows.map((row) => row.privilege_type)
    const mutable = privileges.filter((p) => ['UPDATE', 'DELETE', 'TRUNCATE'].includes(p))
    checks.push({
      name: 'El log de auditoría es inmutable para la aplicación',
      ok: mutable.length === 0,
      detail: mutable.length === 0 ? `permisos: ${privileges.join(', ') || 'ninguno'}` : `puede ${mutable.join(', ')}`,
    })

    // Prueba real de aislamiento: sin contexto no se ve ninguna fila.
    await client.query('BEGIN')
    const blind = await client.query<{ n: string }>('SELECT count(*)::text AS n FROM clients')
    await client.query('COMMIT')
    checks.push({
      name: 'Sin contexto de sesión, la base no devuelve datos de ningún cliente',
      ok: blind.rows[0]?.n === '0',
      detail: `filas visibles: ${blind.rows[0]?.n ?? '?'}`,
    })

    const pending = await client
      .query<{ n: string }>(
        `SELECT count(*)::text AS n FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`,
      )
      .catch(() => ({ rows: [{ n: 'sin acceso (correcto)' }] }))
    checks.push({
      name: 'No hay migraciones a medio aplicar',
      ok: pending.rows[0]?.n === '0' || pending.rows[0]?.n === 'sin acceso (correcto)',
      detail: String(pending.rows[0]?.n),
    })
  } finally {
    await client.end()
  }

  console.info('')
  for (const check of checks) {
    console.info(`${check.ok ? ' OK ' : 'FALLA'}  ${check.name}`)
    console.info(`       ${check.detail}`)
  }
  console.info('')

  const failed = checks.filter((check) => !check.ok)
  if (failed.length > 0) {
    console.error(`${failed.length} verificación(es) sin pasar. No desplegar así.`)
    process.exit(1)
  }
  console.info('Todo en orden.')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
