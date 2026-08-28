import { z } from 'zod'

/**
 * Validación de entorno. Falla al arrancar si falta algo crítico,
 * en vez de fallar a mitad de un request.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3100'),
  APP_TIMEZONE: z.string().default('America/Argentina/Buenos_Aires'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET debe tener al menos 32 caracteres'),
  EMAIL_DRIVER: z.enum(['console', 'smtp']).default('console'),
  EMAIL_FROM: z.string().default('JC Influencers <no-reply@jcmarketing.digital>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  // Por defecto en la base: es lo único que funciona igual en desarrollo y en
  // producción sin configurar nada aparte. 'local' sigue disponible para
  // desarrollo, y 's3' para cuando los archivos justifiquen un bucket.
  STORAGE_DRIVER: z.enum(['db', 'local', 's3']).default('db'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  // Scouting con proveedor externo. Sin token, la función se muestra deshabilitada.
  BRIGHTDATA_API_TOKEN: z.string().optional(),
  BRIGHTDATA_DATASET_INSTAGRAM_PROFILES: z.string().optional(),
  BRIGHTDATA_DATASET_INSTAGRAM_DISCOVER: z.string().optional(),
  BRIGHTDATA_DATASET_TIKTOK_PROFILES: z.string().optional(),
  BRIGHTDATA_DATASET_TIKTOK_DISCOVER: z.string().optional(),
  BRIGHTDATA_DATASET_YOUTUBE_PROFILES: z.string().optional(),
  BRIGHTDATA_DATASET_YOUTUBE_DISCOVER: z.string().optional(),

  /*
   * Qué proveedor usa el scouting. La aplicación depende de la interfaz, no de
   * ninguno de los dos: cambiar de uno a otro es cambiar esta variable.
   */
  /*
   * El preferido. Por defecto influencers.club: es el motor principal de
   * descubrimiento, cubre cinco redes y es el único que filtra por audiencia.
   *
   * Cambiar esto es seguro: si el preferido no está configurado --o no puede
   * hacer esa combinación de red y modo--, el ruteo recorre el resto en orden.
   * Sin la clave de influencers.club, todo sigue funcionando con los scrapers
   * exactamente como antes.
   */
  SCOUTING_PROVIDER: z
    .enum(['brightdata', 'apify', 'hypeauditor', 'influencers-club'])
    .default('influencers-club'),
  /*
   * Se aceptan los dos nombres: Apify llama "API token" al suyo y es fácil
   * cargarlo como APIFY_API_TOKEN. Fallar por el nombre de la variable, con el
   * valor correcto adentro, sería una pérdida de tiempo evitable.
   */
  APIFY_TOKEN: z.string().optional(),
  APIFY_API_TOKEN: z.string().optional(),
  APIFY_ACTOR_INSTAGRAM_PROFILES: z.string().optional(),
  APIFY_ACTOR_INSTAGRAM_DISCOVER: z.string().optional(),
  APIFY_ACTOR_TIKTOK_PROFILES: z.string().optional(),
  APIFY_ACTOR_TIKTOK_DISCOVER: z.string().optional(),
  APIFY_ACTOR_YOUTUBE_PROFILES: z.string().optional(),
  APIFY_ACTOR_YOUTUBE_DISCOVER: z.string().optional(),
  APIFY_COST_PER_RECORD_USD: z.coerce.number().nonnegative().default(0.004),
  /** Costo por registro entregado. Se usa para el tope de gasto y el aviso previo. */
  BRIGHTDATA_COST_PER_RECORD_USD: z.coerce.number().nonnegative().default(0.0015),
  /** Tope mensual global de la agencia, en dólares. */
  /*
   * influencers.club: el motor principal de descubrimiento.
   *
   * Filtra en el origen por quién SIGUE al creador --país, edad, género e
   * intereses del público, y cuánto de esa audiencia es real--, que es lo único
   * que un scraper no puede contestar.
   *
   * La clave se saca sola desde su panel; no hace falta hablar con nadie.
   */
  INFLUENCERS_CLUB_API_KEY: z.string().optional(),
  /*
   * Qué sale un crédito, en dólares. Descubrir cuesta 0,01 créditos por creador
   * devuelto, así que esto define el costo por perfil. Sin valor por defecto a
   * propósito: su precio cambia según el plan --arranca en US$ 0,23-- y sin
   * saberlo el tope mensual deja de ser un tope. Sin esto cargado el proveedor
   * se declara no configurado.
   */
  INFLUENCERS_CLUB_COST_PER_CREDIT_USD: z.coerce.number().nonnegative().optional(),

  /*
   * HypeAuditor. A diferencia de los scrapers, filtra por AUDIENCIA --país,
   * edad y género de los seguidores-- y por calidad de esa audiencia.
   *
   * Las credenciales las entrega HypeAuditor: un Client ID y un token, que
   * viajan en X-Auth-Id y X-Auth-Token.
   */
  HYPEAUDITOR_AUTH_ID: z.string().optional(),
  HYPEAUDITOR_API_TOKEN: z.string().optional(),
  /*
   * Qué cuesta UNA consulta, que devuelve una página de 20 perfiles. No tiene
   * valor por defecto a propósito: sin saber el precio no se puede controlar el
   * tope mensual, y un cero haría creer que buscar es gratis. Sin esto cargado
   * el proveedor se declara no configurado.
   */
  HYPEAUDITOR_COST_PER_CALL_USD: z.coerce.number().nonnegative().optional(),
  /** Usar el entorno de prueba de HypeAuditor en vez del real. */
  HYPEAUDITOR_SANDBOX: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),

  SCOUTING_MONTHLY_LIMIT_USD: z.coerce.number().nonnegative().default(50),

  // Análisis con IA. Sin clave, la función se muestra deshabilitada.
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5'),
  /** Tope mensual de gasto en IA, en dólares. */
  AI_MONTHLY_LIMIT_USD: z.coerce.number().nonnegative().default(50),
})

export type Env = z.infer<typeof schema>

let cached: Env | null = null

export function env(): Env {
  if (cached) return cached
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Configuración de entorno inválida → ${detail}`)
  }
  if (parsed.data.EMAIL_DRIVER === 'smtp' && !parsed.data.SMTP_HOST) {
    throw new Error('EMAIL_DRIVER=smtp requiere SMTP_HOST')
  }
  if (parsed.data.STORAGE_DRIVER === 's3' && !parsed.data.S3_BUCKET) {
    throw new Error('STORAGE_DRIVER=s3 requiere S3_BUCKET')
  }
  cached = parsed.data
  return cached
}

export const isProduction = () => env().NODE_ENV === 'production'
