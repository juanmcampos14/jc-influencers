import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { env } from '@/lib/env'
import { withScope, withSystemScope, type Tx } from '@/lib/db/scope'

export type StoredFile = { key: string; size: number; contentType: string; filename: string; sha256: string }

/** Puerto de almacenamiento de archivos. Adaptadores: base de datos, S3/MinIO y disco local. */
export type PutInput = {
  filename: string
  contentType: string
  data: Buffer
  prefix?: string
  /** Dueño del archivo. Es lo que permite que RLS filtre los bytes. */
  clientId?: string | null
}

/**
 * El cliente dueño del archivo. No es un dato de conveniencia: viaja hasta la
 * consulta para que la política de la base vuelva a comprobar la pertenencia.
 * Una clave robada de otro espacio no devuelve nada.
 */
export type Owner = { clientId?: string | null }

export interface FileStorage {
  readonly name: string
  put(input: PutInput): Promise<StoredFile>
  get(key: string, owner?: Owner): Promise<Buffer>
  remove(key: string, owner?: Owner): Promise<void>
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

const ALLOWED_CONTENT_TYPES = new Map<string, string[]>([
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['.xlsx']],
  ['application/vnd.ms-excel', ['.xls']],
  ['text/csv', ['.csv']],
  ['application/pdf', ['.pdf']],
  ['image/png', ['.png']],
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/webp', ['.webp']],
])

export class UnsupportedFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedFileError'
  }
}

// Caracteres de control (C0 + DEL). Se construye desde string para no escribirlos literalmente.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]', 'g')

/** Sanitiza el nombre: sin rutas, sin caracteres de control, longitud acotada. */
export function sanitizeFilename(filename: string): string {
  const base = filename.replace(/\\/g, '/').split('/').pop() ?? 'archivo'
  const cleaned = base
    .replace(CONTROL_CHARS, '')
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .replace(/\s+/g, ' ')
    .trim()
  const safe = cleaned.replace(/^\.+/, '').slice(0, 120)
  return safe.length > 0 ? safe : 'archivo'
}

/** Valida tamaño, tipo declarado y coherencia con la extensión. */
export function assertUploadAllowed(filename: string, contentType: string, size: number): void {
  if (size <= 0) throw new UnsupportedFileError('El archivo está vacío.')
  if (size > MAX_UPLOAD_BYTES) {
    throw new UnsupportedFileError(`El archivo supera el máximo de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`)
  }
  const extensions = ALLOWED_CONTENT_TYPES.get(contentType)
  if (!extensions) throw new UnsupportedFileError(`Tipo de archivo no permitido (${contentType}).`)
  const ext = extname(sanitizeFilename(filename)).toLowerCase()
  if (!extensions.includes(ext)) {
    throw new UnsupportedFileError(`La extensión ${ext || '(ninguna)'} no coincide con el tipo ${contentType}.`)
  }
}

function buildKey(prefix: string | undefined, filename: string): string {
  const safe = sanitizeFilename(filename)
  const folder = (prefix ?? 'misc').replace(/[^a-zA-Z0-9/_-]/g, '')
  return `${folder}/${randomUUID()}-${safe}`
}

class LocalFileStorage implements FileStorage {
  readonly name = 'local'
  private readonly root = resolve(process.cwd(), env().STORAGE_LOCAL_DIR)

  private pathFor(key: string): string {
    const target = resolve(this.root, key)
    // Impide salir del directorio raíz mediante `..` en la clave.
    if (!target.startsWith(this.root + '/')) throw new UnsupportedFileError('Ruta de archivo inválida.')
    return target
  }

  async put(input: PutInput): Promise<StoredFile> {
    assertUploadAllowed(input.filename, input.contentType, input.data.byteLength)
    const key = buildKey(input.prefix, input.filename)
    const target = this.pathFor(key)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, input.data)
    return {
      key,
      size: input.data.byteLength,
      contentType: input.contentType,
      filename: sanitizeFilename(input.filename),
      sha256: createHash('sha256').update(input.data).digest('hex'),
    }
  }

  // El disco no sabe de clientes: acá el único cerrojo es el de la aplicación.
  // Otra razón para no usar este adaptador fuera de desarrollo.
  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key))
  }

  async remove(key: string): Promise<void> {
    await unlink(this.pathFor(key)).catch(() => undefined)
  }
}

class S3FileStorage implements FileStorage {
  readonly name = 's3'

  private async client() {
    const { S3Client } = await import('@aws-sdk/client-s3')
    const config = env()
    return new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials:
        config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }
          : undefined,
    })
  }

  async put(input: PutInput): Promise<StoredFile> {
    assertUploadAllowed(input.filename, input.contentType, input.data.byteLength)
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    const key = buildKey(input.prefix, input.filename)
    const client = await this.client()
    await client.send(
      new PutObjectCommand({
        Bucket: env().S3_BUCKET,
        Key: key,
        Body: input.data,
        ContentType: input.contentType,
        // Sin ACL pública: el acceso se sirve siempre desde la app, autorizado.
      }),
    )
    return {
      key,
      size: input.data.byteLength,
      contentType: input.contentType,
      filename: sanitizeFilename(input.filename),
      sha256: createHash('sha256').update(input.data).digest('hex'),
    }
  }

  async get(key: string): Promise<Buffer> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.client()
    const response = await client.send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }))
    const bytes = await response.Body?.transformToByteArray()
    if (!bytes) throw new Error(`No se pudo leer el objeto ${key}`)
    return Buffer.from(bytes)
  }

  async remove(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.client()
    await client.send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: key }))
  }
}

/**
 * Guarda los archivos en la misma base que el resto del producto.
 *
 * Es el adaptador por defecto, y a propósito: el disco del servidor no
 * persiste en Vercel, y depender de un bucket externo significa que el
 * producto no arranca hasta que alguien lo cree. Los archivos que maneja son
 * chicos y acotados -- un logo, un Excel de hasta 10 MB -- así que la base los
 * aguanta sin problema, y de yapa quedan cubiertos por RLS, por los backups y
 * por el borrado en cascada cuando se elimina un cliente.
 *
 * Si algún día los archivos crecen, se cambia por el adaptador S3 sin tocar
 * nada más: el resto de la aplicación depende de la interfaz, no de esto.
 */
class DatabaseFileStorage implements FileStorage {
  readonly name = 'db'

  /**
   * Corre la consulta con el alcance del cliente dueño, no con permisos de
   * sistema. Así la política de la base es un cerrojo de verdad y no un adorno
   * que el propio adaptador esquiva.
   */
  private async run<T>(owner: Owner | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const clientId = owner?.clientId
    if (!clientId) return withSystemScope(fn)
    return withScope({ userId: null, scope: 'client', clientIds: [clientId], allClients: false }, fn)
  }

  async put(input: PutInput): Promise<StoredFile> {
    assertUploadAllowed(input.filename, input.contentType, input.data.byteLength)
    const key = buildKey(input.prefix, input.filename)
    const stored: StoredFile = {
      key,
      size: input.data.byteLength,
      contentType: input.contentType,
      filename: sanitizeFilename(input.filename),
      sha256: createHash('sha256').update(input.data).digest('hex'),
    }
    await this.run({ clientId: input.clientId }, (tx) =>
      tx.storedBlob.create({
        data: {
          key,
          clientId: input.clientId ?? null,
          filename: stored.filename,
          contentType: stored.contentType,
          size: stored.size,
          sha256: stored.sha256,
          // Prisma pide Uint8Array; Buffer lo es, pero su tipo declara un
          // ArrayBufferLike más amplio. La copia es de la vista, no de los bytes.
          data: new Uint8Array(input.data),
        },
      }),
    )
    return stored
  }

  async get(key: string, owner?: Owner): Promise<Buffer> {
    const row = await this.run(owner, (tx) =>
      tx.storedBlob.findUnique({ where: { key }, select: { data: true } }),
    )
    if (!row) throw new UnsupportedFileError('El archivo ya no está disponible.')
    return Buffer.from(row.data)
  }

  async remove(key: string, owner?: Owner): Promise<void> {
    await this.run(owner, (tx) => tx.storedBlob.deleteMany({ where: { key } }))
  }
}

let cached: FileStorage | null = null

export function fileStorage(): FileStorage {
  if (cached) return cached
  const driver = env().STORAGE_DRIVER
  cached = driver === 's3' ? new S3FileStorage() : driver === 'local' ? new LocalFileStorage() : new DatabaseFileStorage()
  return cached
}
