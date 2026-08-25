import 'server-only'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { env } from '@/lib/env'
import { withSystemScope } from '@/lib/db/scope'

export type EmailMessage = {
  to: string
  subject: string
  text: string
  html?: string
}

/**
 * Puerto de envío de email. La app depende de esta interfaz, no de un proveedor.
 * Ver `docs/07-integraciones.md` para conectar un proveedor real.
 */
export interface EmailSender {
  readonly name: string
  send(message: EmailMessage): Promise<void>
}

/** Desarrollo y tests: escribe a ./.mail y deja registro en `email_outbox`. */
class ConsoleEmailSender implements EmailSender {
  readonly name = 'console'
  async send(message: EmailMessage): Promise<void> {
    const record = await withSystemScope((tx) =>
      tx.emailOutbox.create({
        data: { to: message.to, subject: message.subject, bodyText: message.text, bodyHtml: message.html ?? null },
      }),
    )
    /*
     * El archivo .eml es una comodidad de desarrollo: se abre con doble clic y
     * se ve el mail. En un servidor sin disco de escritura (Vercel) el intento
     * fallaba y hacía fracasar la invitación entera, cuando lo que importa --
     * el registro en `email_outbox` -- ya estaba guardado.
     */
    try {
      const dir = join(process.cwd(), '.mail')
      await mkdir(dir, { recursive: true })
      const body = [
        `To: ${message.to}`,
        `From: ${env().EMAIL_FROM}`,
        `Subject: ${message.subject}`,
        '',
        message.text,
      ].join('\n')
      await writeFile(join(dir, `${record.id}.eml`), body, 'utf8')
    } catch {
      /* sin disco de escritura: alcanza con el registro en la base */
    }
    await withSystemScope((tx) => tx.emailOutbox.update({ where: { id: record.id }, data: { sentAt: new Date() } }))
    if (process.env.NODE_ENV !== 'test') {
      console.info(`[email:console] -> ${message.to} | ${message.subject} | .mail/${record.id}.eml`)
    }
  }
}

class SmtpEmailSender implements EmailSender {
  readonly name = 'smtp'
  async send(message: EmailMessage): Promise<void> {
    const config = env()
    const record = await withSystemScope((tx) =>
      tx.emailOutbox.create({
        data: { to: message.to, subject: message.subject, bodyText: message.text, bodyHtml: message.html ?? null },
      }),
    )
    try {
      const nodemailer = await import('nodemailer')
      const transport = nodemailer.default.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
        auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? '' } : undefined,
      })
      await transport.sendMail({
        from: config.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      })
      await withSystemScope((tx) => tx.emailOutbox.update({ where: { id: record.id }, data: { sentAt: new Date() } }))
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'error desconocido'
      await withSystemScope((tx) => tx.emailOutbox.update({ where: { id: record.id }, data: { error: detail } }))
      throw error
    }
  }
}

let cached: EmailSender | null = null

export function emailSender(): EmailSender {
  if (cached) return cached
  cached = env().EMAIL_DRIVER === 'smtp' ? new SmtpEmailSender() : new ConsoleEmailSender()
  return cached
}
