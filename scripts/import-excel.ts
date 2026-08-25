/**
 * Importador del Excel por línea de comandos.
 *
 *   npm run import:excel -- --file "ruta/al.xlsx" --client kast            (previsualiza)
 *   npm run import:excel -- --file "ruta/al.xlsx" --client kast --confirm  (aplica)
 *
 * Lee el .xlsx de verdad: no hay influencers escritos en el código.
 */
import '../src/lib/bootstrap-env'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { withSystemScope } from '../src/lib/db/scope'
import { createSession } from '../src/lib/auth/session'
import { buildAuthContext } from '../src/lib/authz/context'
import { previewImport, confirmImport } from '../src/lib/import/runner'
import { slugify } from '../src/lib/domain/normalize'

type Args = { file?: string; client?: string; as?: string; confirm: boolean; run?: string }

function parseArgs(argv: string[]): Args {
  const args: Args = { confirm: false }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--confirm') args.confirm = true
    else if (flag === '--file' && value) { args.file = value; i += 1 }
    else if (flag === '--client' && value) { args.client = value; i += 1 }
    else if (flag === '--as' && value) { args.as = value; i += 1 }
    else if (flag === '--run' && value) { args.run = value; i += 1 }
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!args.file) {
    console.error('Falta --file "ruta/al/archivo.xlsx"')
    process.exit(1)
  }
  const clientSlug = args.client ?? 'kast'
  const actorEmail = args.as ?? 'admin@jcmarketing.digital'

  const data = await readFile(args.file)

  const clientId = await withSystemScope(async (tx) => {
    const existing = await tx.client.findUnique({ where: { slug: clientSlug } })
    if (existing) return existing.id
    const created = await tx.client.create({
      data: {
        slug: slugify(clientSlug),
        name: clientSlug.toUpperCase(),
        country: 'ARG',
        markets: ['ARG'],
        defaultCurrency: 'USD',
        description: `Cliente creado por el importador desde ${basename(args.file as string)}.`,
      },
    })
    console.info(`Cliente "${clientSlug}" creado.`)
    return created.id
  })

  const token = await withSystemScope(async (tx) => {
    const user = await tx.user.findUnique({ where: { email: actorEmail } })
    if (!user) throw new Error(`No existe el usuario ${actorEmail}. Corré primero: npm run db:seed`)
    const session = await createSession(tx, user.id, { ip: 'cli', userAgent: 'import-excel-cli' })
    return session.token
  })

  const ctx = await buildAuthContext(token, { ip: 'cli', userAgent: 'import-excel-cli' })
  if (!ctx) throw new Error('No se pudo construir el contexto de autorización.')

  if (args.run && args.confirm) {
    const result = await confirmImport(ctx, args.run)
    console.info('Importación aplicada:', result)
    return
  }

  console.info(`Leyendo ${basename(args.file)} …`)
  const summary = await previewImport(ctx, { clientId, filename: basename(args.file), data })

  console.info('')
  console.info('── HOJAS ─────────────────────────────────────────────')
  for (const sheet of summary.sheets) {
    console.info(` ${sheet.handled ? 'OK ' : '-- '} ${sheet.name.padEnd(34)} ${sheet.note}`)
  }
  console.info('')
  console.info('── RESUMEN ───────────────────────────────────────────')
  console.table(summary.counts)
  console.info('')
  console.info('── CAMPAÑAS QUE SE CREARÍAN ──────────────────────────')
  for (const campaign of summary.campaigns) console.info(` ${campaign.name.padEnd(38)} ${campaign.people} perfiles`)
  console.info('')
  console.info('── DECISIONES DE MAPEO ───────────────────────────────')
  for (const decision of summary.decisions.slice(0, 40)) console.info(` · ${decision}`)
  console.info('')
  console.info('── POSIBLES DUPLICADOS (no se fusionan solos) ────────')
  for (const duplicate of summary.duplicates.slice(0, 25)) {
    console.info(` · ${duplicate.sheetName} f.${duplicate.rowNumber} "${duplicate.name}" → ${duplicate.reason}`)
  }
  console.info('')
  console.info('── FILAS CON PROBLEMAS ───────────────────────────────')
  for (const issue of summary.issues.slice(0, 30)) {
    console.info(` [${issue.outcome}] ${issue.sheetName} f.${issue.rowNumber}: ${issue.message}`)
  }
  console.info('')
  console.info(`Importación en modo previsualización: ${summary.importRunId}`)

  if (args.confirm) {
    const result = await confirmImport(ctx, summary.importRunId)
    console.info('')
    console.info('── APLICADO ──────────────────────────────────────────')
    console.table(result)
  } else {
    console.info('Para aplicarla: agregá --confirm')
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
