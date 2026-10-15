# Despliegue en Vercel + Neon

Destino: **influencers.jcmarketing.digital**
Repositorio: **github.com/juanmcampos14/jc-influencers**

> **Historia, para que no sorprenda.** Esto corría sobre Neon hasta octubre de 2026, cuando
> ese proyecto se eliminó y se perdieron los datos. Se migró a **Neon** porque la aplicación sólo
> necesita Postgres --tiene su propio login, sus propias sesiones y guarda los archivos como bytes
> en una tabla-- y porque el plan free de Neon sólo admite 2 proyectos por cuenta.

---

## 1. Base de datos en Neon

### 1.1 Crear el proyecto

Un proyecto **nuevo**, no compartido con otro producto.

**Región: `AWS US West 2 (Oregon)`.** No es indistinto: las funciones de Vercel de este proyecto
corren en `pdx1`, que es Oregon. Con la base en otra región cada consulta cruza el país y se
agregan ~60 ms por viaje, varios por pantalla. **La región de un proyecto de Neon no se puede
cambiar después**: si se elige mal, hay que crear otro proyecto.

### 1.2 Crear el rol de aplicación

Con el usuario dueño (`neondb_owner`), correr `db/setup.sql` reemplazando `CAMBIAR_ESTA_CLAVE`
por una contraseña larga y aleatoria:

```bash
openssl rand -hex 32
```

**Esto no es opcional, y en Neon hay una trampa.** El dueño de la base trae `BYPASSRLS`
--verificado: `neondb_owner` lo tiene--, así que si la aplicación se conectara con él, las
políticas de Row-Level Security no se aplicarían y el aislamiento entre clientes desaparecería
**sin un solo síntoma**: todo andaría igual, sólo que cada cliente vería lo de los demás.

La trampa: **un rol creado desde la consola web de Neon hereda `neon_superuser`, que también trae
`BYPASSRLS`.** Hay que crearlo con SQL, como hace `db/setup.sql`.

Comprobación obligatoria --tiene que dar `false`--:

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'jc_app';
```

### 1.3 Las dos cadenas de conexión

Neon da varias. Hacen falta dos, y son distintas a propósito:

| Para qué | Cuál | Por qué |
| --- | --- | --- |
| La aplicación (`DATABASE_URL`) | **Transaction pooler**, puerto `6543` | Vercel abre y cierra funciones todo el tiempo; sin pooler se agotan las conexiones |
| Las migraciones (`MIGRATION_DATABASE_URL`) | **Conexión directa**, puerto `5432` | El pooler en modo transacción no soporta el DDL ni los locks que usa Prisma |

Reemplazar el usuario `postgres` por `jc_app` y la contraseña por la del paso anterior:

```
DATABASE_URL=postgresql://jc_app:LA_CLAVE@ep-xxxx-pooler.us-west-2.aws.neon.tech/neondb?sslmode=verify-full
MIGRATION_DATABASE_URL=postgresql://neondb_owner:CLAVE@ep-xxxx.us-west-2.aws.neon.tech/neondb?sslmode=verify-full
```

> El pooler en modo transacción **sí** es compatible con `SET LOCAL`, que es lo que usa `withScope`
> para fijar el alcance de RLS: la transacción entera vive en una sola conexión del servidor.

### 1.4 Aplicar las migraciones

Desde tu máquina, **no** desde el build de Vercel:

```bash
MIGRATION_DATABASE_URL="postgresql://...:5432/postgres?sslmode=require" npx prisma migrate deploy
```

Después correr `db/after-migrate.sql` en el SQL Editor para sellar los permisos y volver a
revocar la escritura sobre el log de auditoría.

### 1.5 Verificar antes de seguir

```bash
DATABASE_URL="postgresql://jc_app:...@...:6543/postgres?sslmode=require" npm run db:check
```

Tiene que dar **todo OK**. Si alguna verificación falla, no desplegar: el script explica cuál.

---

## 2. Variables de entorno en Vercel

En **Settings → Environment Variables**, para Production (y Preview si se usa):

| Variable | Valor | Obligatoria |
| --- | --- | --- |
| `DATABASE_URL` | Endpoint *pooled* de Neon (host con `-pooler`), usuario `jc_app` | **sí** |
| `SESSION_SECRET` | `openssl rand -base64 48`. **Distinto** al de desarrollo | **sí** |
| `APP_URL` | `https://influencers.jcmarketing.digital` | **sí** |
| `EMAIL_DRIVER` | `smtp` | sí, para invitaciones |
| `EMAIL_FROM` | `JC Influencers <no-reply@jcmarketing.digital>` | sí |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | del proveedor de correo | sí |
| `STORAGE_DRIVER` | `s3` | **sí** |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | del bucket | **sí** |
| `BRIGHTDATA_API_TOKEN` | token de Bright Data | no (sin él, scouting deshabilitado) |
| `BRIGHTDATA_DATASET_*` | ids de dataset | no |
| `BRIGHTDATA_COST_PER_RECORD_USD` | costo real por registro | no (por defecto 0.0015) |
| `SCOUTING_MONTHLY_LIMIT_USD` | tope duro mensual | no (por defecto 50) |
| `ANTHROPIC_API_KEY` | clave de Anthropic | no (sin ella, IA deshabilitada) |
| `AI_MONTHLY_LIMIT_USD` | tope duro mensual | no (por defecto 50) |

> **`STORAGE_DRIVER=local` no sirve en Vercel.** El disco de una función es efímero: los logos de
> marca y los Excel importados desaparecerían entre despliegues. Hace falta un bucket S3-compatible.
> Sirve el Storage de Neon (expone API compatible con S3), Cloudflare R2 o AWS S3.

**El bucket no debe ser público.** Los archivos se sirven desde la aplicación después de verificar
la autorización.

---

## 3. Subdominio

El subdominio ya está apuntado. Verificar en **Settings → Domains** que
`influencers.jcmarketing.digital` figure como *Valid Configuration* y que el certificado esté emitido.

Si el DNS está en Donweb, el registro es un `CNAME` hacia `cname.vercel-dns.com`.

**HTTPS es obligatorio**: la cookie de sesión usa `Secure` en producción. Sin TLS no hay sesión.

---

## 3.bis Antes de pushear

```bash
npm run verify        # lint, tipos y tests
npm run verify:build  # que compile SIN variables de entorno
```

El segundo importa más de lo que parece: Vercel compila **antes** de que existan las variables de
entorno de ejecución. Dos veces se rompió el build por código que necesitaba `DATABASE_URL` en tiempo
de compilación. Ese comando reproduce esa condición.

## 4. Primer despliegue

```bash
git push origin main
```

Vercel construye con `npm run build`, que corre `prisma generate && next build`.

**Las migraciones no corren solas en el build**, a propósito: un despliegue no debería poder
modificar el esquema de la base sin que alguien lo decida. Se corren a mano (paso 1.4).

### Crear el primer usuario

No hay registro público, así que la primera cuenta se crea desde la base:

```bash
DATABASE_URL="postgresql://jc_app:...@...:6543/postgres?sslmode=require" \
SEED_DEMO_PASSWORD="una-clave-larga-y-tuya" \
npx tsx --conditions=react-server prisma/seed.ts
```

El seed es idempotente y crea los catálogos (estados, nichos) además de los usuarios. **Después de
entrar, desactivá los usuarios de demostración que no vayas a usar** desde `Usuarios`.

Si preferís no cargar datos de demo, creá sólo tu usuario:

```sql
-- En el SQL Editor, con el hash generado por la app.
-- Más simple: corré el seed y borrá lo que no quieras.
```

---

## 5. Después de cada despliegue

```bash
DATABASE_URL="..." npm run db:check
```

Y una comprobación a mano: entrar con un usuario de cliente y confirmar que ve **sólo** sus campañas.

---

## 6. Qué hacer si algo falla

| Síntoma | Causa más probable |
| --- | --- |
| `role "jc_app" does not exist` | Falta correr `db/setup.sql` |
| Todo devuelve vacío pero hay datos | La app se conecta con un rol sin permisos, o falta `after-migrate.sql` |
| Un cliente ve datos de otro | `db:check` va a decir que el rol tiene `BYPASSRLS`. Revisar el usuario de `DATABASE_URL` |
| No se mantiene la sesión | Falta HTTPS, o `APP_URL` no coincide con el dominio real |
| `too many connections` | `DATABASE_URL` apunta al puerto 5432 en vez del pooler 6543 |
| Las invitaciones no llegan | `EMAIL_DRIVER` sigue en `console`, o falta SPF/DKIM en el dominio |
| Los logos desaparecen | `STORAGE_DRIVER` quedó en `local` |
| `The deployment was blocked because <usuario> does not have a Vercel account linked` | El **autor del commit** es un usuario de GitHub distinto al de la cuenta de Vercel. Se arregla con `git config user.email` correcto en el repo, o desactivando *Git Author Verification* en Vercel |
| `Command "npm run build" exited with 1` | Algo del build necesita variables que todavía no están. `npm run verify:build` lo reproduce local |
