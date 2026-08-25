# Integraciones externas

Las dos integraciones externas están detrás de un **puerto**: la aplicación depende de la interfaz, no
del proveedor. Cambiar de proveedor es escribir un adaptador, no tocar el producto.

## Email

Interfaz: `EmailSender` en `src/lib/ports/email.ts`.

```ts
interface EmailSender {
  readonly name: string
  send(message: { to: string; subject: string; text: string; html?: string }): Promise<void>
}
```

### Adaptador de desarrollo (por defecto)

`EMAIL_DRIVER=console`

- Escribe cada mensaje en `./.mail/{id}.eml`
- Deja registro en la tabla `email_outbox` con fecha de envío o error
- No necesita credenciales

Es lo que usan los tests E2E para leer el enlace de invitación: el flujo real se prueba de punta a punta
sin depender de un proveedor.

### Adaptador SMTP (producción)

```bash
EMAIL_DRIVER=smtp
EMAIL_FROM="JC Influencers <no-reply@jcmarketing.digital>"
SMTP_HOST=smtp.proveedor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASSWORD=...
```

Funciona con cualquier SMTP: Amazon SES, Resend, Postmark, Brevo o el correo de Donweb.

Antes de producción hay que configurar **SPF, DKIM y DMARC** para el dominio remitente. Sin eso, las
invitaciones van a spam y el producto parece roto.

### Agregar otro proveedor

Implementar `EmailSender`, agregar el valor al enum `EMAIL_DRIVER` en `src/lib/env.ts` y devolverlo desde
`emailSender()`. Nada más del código cambia.

## Almacenamiento de archivos

Interfaz: `FileStorage` en `src/lib/ports/storage.ts`.

### Adaptador local (por defecto)

`STORAGE_DRIVER=local` y `STORAGE_LOCAL_DIR=./storage`

Sirve para desarrollo y para un despliegue de un solo servidor con disco persistente.

### Adaptador S3

```bash
STORAGE_DRIVER=s3
S3_ENDPOINT=https://s3.amazonaws.com     # o el endpoint de MinIO
S3_REGION=us-east-1
S3_BUCKET=jc-influencers
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true                 # true para MinIO, false para S3 de AWS
```

`docker-compose.yml` incluye MinIO para probar el adaptador S3 en local:

```bash
docker compose up -d minio
# Consola en http://localhost:59001 (jc_minio_admin / jc_minio_dev_password)
```

**El bucket no debe ser público.** Los objetos se suben sin ACL y siempre se sirven desde la aplicación,
después de verificar la autorización.

### Límites aplicados en el servidor

- Máximo 10 MB por archivo
- Tipos permitidos: `.xlsx`, `.xls`, `.csv`, `.pdf`, `.png`, `.jpg`, `.webp`
- El tipo declarado tiene que coincidir con la extensión
- El nombre se sanea: sin rutas, sin caracteres de control, máximo 120 caracteres
- Las claves no pueden salir del directorio raíz

## Lo que deliberadamente NO se integró

**APIs de Instagram, TikTok y YouTube.** Los números de seguidores y engagement se cargan a mano o vienen
de la importación, y **siempre** quedan con su fuente y su fecha. Cuando un dato tiene más de 45 días, la
interfaz lo muestra como desactualizado en vez de presentarlo como fresco.

Es una decisión, no una omisión: esas APIs requieren aprobación de app por plataforma, tienen cuotas
estrictas y no exponen el engagement de cuentas de terceros. Prometer datos automáticos que después no
llegan sería peor que pedirlos a mano.

Si más adelante se contrata un proveedor de métricas (Modash, HypeAuditor, Heepsy), el lugar natural es un
tercer puerto `MetricsProvider` que alimente `MetricSnapshot` con `source` y `sourceUrl`. El modelo ya
está preparado: `SourceReference` existe justamente para eso.
