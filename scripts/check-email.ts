import 'server-only'
import '../src/lib/bootstrap-env'
import { emailSender } from '../src/lib/ports/email'
import { withSystemScope } from '../src/lib/db/scope'

/**
 * Manda un mail de prueba de verdad.
 *
 *   npm run mail:check -- juan@ejemplo.com
 *
 * Existe porque "la invitación se generó" y "la invitación llegó" son dos cosas
 * distintas, y la primera no sirve de nada. Un fallo de SMTP aparece recién
 * cuando alguien espera un mail que nunca sale.
 */

const destino = process.argv[2]
if (!destino || !destino.includes('@')) {
  console.error('Uso: npm run mail:check -- alguien@dominio.com')
  process.exit(1)
}

const driver = process.env.EMAIL_DRIVER ?? 'console'
const remitente = process.env.EMAIL_FROM ?? '(por defecto del código)'

console.log(`Driver: ${driver}`)
console.log(`Remitente: ${remitente}`)
if (driver === 'smtp') {
  console.log(`Servidor: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? '(por defecto)'}`)
  console.log(`Usuario: ${process.env.SMTP_USER ?? '(sin autenticación)'}`)
} else {
  console.log('AVISO: con driver "console" el mail NO sale. Queda registrado en email_outbox.')
}
console.log('')

const asunto = 'Prueba de envío · JC Influencers'
try {
  await emailSender().send({
    to: destino,
    subject: asunto,
    text: [
      'Este es un mail de prueba de JC Influencers.',
      '',
      'Si te llegó, las invitaciones y la recuperación de contraseña van a funcionar.',
      '',
      `Enviado desde: ${remitente}`,
    ].join('\n'),
  })
  console.log(`Enviado a ${destino}.`)
} catch (error) {
  console.error(`FALLÓ: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}

// Lo que quedó registrado, que es lo que la aplicación va a poder mostrar.
const ultimo = await withSystemScope((tx) =>
  tx.emailOutbox.findFirst({ where: { subject: asunto }, orderBy: { createdAt: 'desc' } }),
)
if (ultimo) {
  console.log('')
  console.log(`Registro: ${ultimo.id}`)
  console.log(`  enviado: ${ultimo.sentAt ? ultimo.sentAt.toISOString() : 'no'}`)
  if (ultimo.error) console.log(`  error: ${ultimo.error}`)
}
