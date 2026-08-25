import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { env } from '@/lib/env'

export type StoredFile = { key: string; size: number; contentType: string; filename: string; sha256: string }

/** Puerto de almacenamiento de archivos. Adaptadores: local (dev) y S3/MinIO. */
export interface FileStorage {
  readonly name: string
  put(input: { filename: string; contentType: string; data: Buffer; prefix?: string }): Promise<StoredFile>
  get(key: string): Promise<Buffer>
  remove(key: string): Promise<void>
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

  async put(input: { filename: string; contentType: string; data: Buffer; prefix?: string }): Promise<StoredFile> {
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

  async put(input: { filename: string; contentType: string; data: Buffer; prefix?: string }): Promise<StoredFile> {
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

let cached: FileStorage | null = null

export function fileStorage(): FileStorage {
  if (cached) return cached
  cached = env().STORAGE_DRIVER === 's3' ? new S3FileStorage() : new LocalFileStorage()
  return cached
}
