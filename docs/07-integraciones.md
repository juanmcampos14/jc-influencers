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

## Scouting con Bright Data

Interfaz: `ScoutingProvider` en `src/lib/ports/scouting.ts`.

Adaptador: **Bright Data Web Scraper API** (los datasets ya armados de Instagram y TikTok).

```bash
BRIGHTDATA_API_TOKEN=...
BRIGHTDATA_DATASET_INSTAGRAM_PROFILES=gd_...
BRIGHTDATA_DATASET_INSTAGRAM_DISCOVER=gd_...
BRIGHTDATA_DATASET_TIKTOK_PROFILES=gd_...
BRIGHTDATA_DATASET_TIKTOK_DISCOVER=gd_...
BRIGHTDATA_COST_PER_RECORD_USD=0.0015
SCOUTING_MONTHLY_LIMIT_USD=50
```

Los identificadores de dataset se copian del panel de Bright Data. Cada dataset tiene el suyo, así que
no vienen precargados.

### Cómo funciona

Bright Data es asíncrono: se dispara un trabajo, se consulta el avance y después se descarga el
resultado. La aplicación hace lo mismo en tres pasos, que además es lo que permite mostrar el costo
antes de gastar:

1. **Previsualizar** — calcula cuántos registros y cuánto cuesta. **No llama al proveedor.**
2. **Ejecutar** — vuelve a comprobar el tope y recién ahí dispara el trabajo.
3. **Consultar** — la pantalla pregunta cada 10 segundos; al terminar, guarda los resultados.

Los resultados **no entran a la base de influencers** hasta que alguien los elige. Lo que se importa
queda con `metricSource` apuntando al proveedor, `verificationStatus: UNVERIFIED` y un snapshot con su
origen.

### Control de gasto

Está pensado alrededor de una idea: **que un gasto inesperado sea imposible, no improbable.**

- **Sólo la agencia.** `scouting.run` está en la lista de capacidades prohibidas para el lado cliente:
  un usuario de cliente no puede dispararlo aunque alguien le asigne el permiso por error.
- **Aviso previo obligatorio.** Nunca se ejecuta sin que alguien haya visto cuánto cuesta y confirmado.
- **Tope mensual con corte duro.** Global de agencia y opcional por cliente. Cuando se agota, la
  ejecución falla; no es una advertencia.
- **Reserva y ajuste.** Al disparar se reserva el costo estimado; al terminar se ajusta a lo realmente
  entregado. Si el trabajo falla, se libera.
- **Todo auditado**: quién, cuándo, con qué parámetros y cuánto costó.

Sin token configurado, la pantalla lo dice y deja armar la búsqueda para ver el costo, pero no ejecuta.
**Nunca devuelve datos simulados.**

## Análisis con IA (Anthropic)

Interfaz: `AiProvider` en `src/lib/ports/ai.ts`. Modelo por defecto: **Claude Opus 5**.

```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-5
AI_MONTHLY_LIMIT_USD=50
```

### Qué hace

| Análisis | Dónde | Qué devuelve |
| --- | --- | --- |
| Perfil contra el brief | Ficha de una candidatura | Fit de 1 a 5, razones, riesgos, ideas de contenido, **qué datos faltan** |
| Ideas creativas | Pestaña Análisis IA | Concepto general, ideas por formato y cluster, qué evitar |
| Cómo viene la campaña | Pestaña Análisis IA | Qué va bien, qué preocupa, desvíos del brief, próximos pasos |
| Reporte de campaña | Pestaña Análisis IA | Documento en Markdown, para la agencia o para el cliente |

### Dos reglas de diseño

**1. El modelo sólo razona sobre datos que tenemos.** Cada llamada recibe un bloque explícito con lo
que hay cargado, incluyendo lo que falta y lo que está desactualizado, y la instrucción de decir "no
hay dato" en lugar de completarlo. Los esquemas de salida tienen un campo `datosFaltantes` que existe
justamente para eso. Un análisis que inventa seguidores es peor que no tener análisis.

**2. Todo resultado se guarda con su procedencia**: modelo, versión del prompt y qué datos entraron.
Cada análisis se muestra con esa información al pie, así se puede discutir de dónde salió una
recomendación.

### Control de gasto y de qué ve el cliente

- `ai.run` también está prohibida para el lado cliente.
- Tope mensual con corte duro (`AI_MONTHLY_LIMIT_USD`).
- El costo real de cada análisis se calcula con los tokens que devuelve la API y se guarda.
- **El cliente no ve ningún análisis hasta que la agencia lo comparte explícitamente**, con un
  interruptor por análisis.
- El reporte "para el cliente" se genera con instrucciones distintas: sin márgenes, sin costos internos
  y sin notas internas.

Sin clave configurada, la función se muestra deshabilitada. Nunca inventa un análisis.

## Lo que deliberadamente NO se integró

**APIs oficiales de Instagram, TikTok y YouTube.** Requieren aprobación de app por plataforma, tienen
cuotas estrictas y no exponen el engagement de cuentas de terceros. Para eso está Bright Data, que es
justamente lo que resuelve ese problema.

Si más adelante se contrata además un proveedor de métricas de audiencia (Modash, HypeAuditor), el
lugar natural es otro adaptador del mismo puerto `ScoutingProvider`, o un `MetricsProvider` que alimente
`MetricSnapshot`. El modelo ya está preparado: `SourceReference` existe para eso.
