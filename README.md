# JC Influencers

Plataforma multitenant para gestionar campañas de marketing de influencers de la agencia JC.
Reemplaza el flujo que hoy vive en el Excel `_INTERNO JC - KAST Propuesta de perfiles`.

Pensada para `influencers.jcmarketing.digital`.

---

## Puesta en marcha

Requisitos: **Node 20+**, **Docker** (para PostgreSQL) y **npm**.

```bash
npm install
cp .env.example .env          # completar SESSION_SECRET
npm run db:up                 # levanta PostgreSQL (y MinIO) en Docker
npm run db:migrate            # aplica migraciones, incluida Row-Level Security
npm run db:seed               # catálogos + usuarios y tenants de demostración
npm run dev                   # http://localhost:3100
```

Un `SESSION_SECRET` nuevo:

```bash
openssl rand -base64 48
```

Atajo que hace todo lo anterior:

```bash
npm run setup
```

### Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo en el puerto 3100 |
| `npm run build` / `npm start` | Compilación y arranque de producción |
| `npm run verify` | Lint + TypeScript + tests unitarios y de integración |
| `npm run verify:build` | Comprueba que compile **sin** variables de entorno, que es como compila Vercel |
| `npm test` | Vitest (unitarios + integración contra PostgreSQL real) |
| `npm run test:e2e` | Playwright de punta a punta |
| `npm run db:migrate` | Aplica migraciones pendientes |
| `npm run db:seed` | Datos de demostración (idempotente) |
| `npm run db:studio` | Prisma Studio |
| `npm run import:excel` | Importador del `.xlsx` por línea de comandos |
| `npm run docs:permisos` | Regenera la matriz de permisos desde el código |

---

## Usuarios de demostración

Todos usan la contraseña de `SEED_DEMO_PASSWORD` (por defecto `Demo.2026!seguro`).

### Agencia

| Email | Rol | Alcance |
| --- | --- | --- |
| `superadmin@jcmarketing.digital` | Superadministrador de plataforma | Todos los clientes |
| `admin@jcmarketing.digital` | Administrador de agencia | Todos los clientes |
| `account@jcmarketing.digital` | Account manager | Sólo Nordika Pay |
| `scout@jcmarketing.digital` | Scouting | Nordika Pay y Aurora Retail |
| `finanzas@jcmarketing.digital` | Finanzas | Nordika Pay y Aurora Retail |

### Clientes

| Email | Rol | Cliente |
| --- | --- | --- |
| `admin@nordika.demo` | Administrador del cliente | Nordika Pay |
| `revisor@nordika.demo` | Revisor | Nordika Pay |
| `lector@nordika.demo` | Lector | Nordika Pay |
| `admin@aurora.demo` | Administrador del cliente | Aurora Retail |
| `revisor@aurora.demo` | Revisor | Aurora Retail |
| `desactivado@nordika.demo` | Revisor **desactivado** | Nordika Pay — sirve para probar la revocación |

Los clientes, campañas e influencers del seed son **ficticios**. Los datos reales entran por el importador.

---

## Importar el Excel

### Desde la interfaz

`Importación` → elegir cliente → subir el `.xlsx` → **se muestra un reporte previo** (hojas leídas,
altas nuevas, posibles duplicados, filas incompletas, valores que no se pudieron normalizar,
contradicciones del origen y decisiones de mapeo) → confirmar o cancelar.

### Desde la línea de comandos

```bash
npm run import:excel -- --file "/ruta/al/archivo.xlsx" --client kast
```

Eso **previsualiza**. Para aplicarlo:

```bash
npm run import:excel -- --file "/ruta/al/archivo.xlsx" --client kast --confirm
```

Notas:

- Lee el `.xlsx` de verdad. No hay influencers escritos en el código ni en el seed.
- Es **idempotente**: correrlo dos veces no duplica influencers, perfiles, candidaturas ni snapshots.
- Toda la aplicación ocurre dentro de una transacción.
- Conserva hoja y fila de origen en cada candidatura y en el log por fila.
- Nunca fusiona duplicados dudosos: los marca para que decida una persona.

---

## Documentación

| Documento | Contenido |
| --- | --- |
| [Inspección del Excel](docs/00-inspeccion-excel.md) | Hoja por hoja, columnas, listas y problemas de calidad de dato |
| [Plan técnico](docs/01-plan.md) | Stack, arquitectura y etapas |
| [Modelo de datos](docs/02-modelo-datos.md) | Diagrama y decisiones del esquema |
| [Roles y permisos](docs/03-roles-y-permisos.md) | Matriz completa, generada desde el código |
| [Invitaciones y acceso](docs/04-invitaciones.md) | Ciclo de vida de una invitación |
| [Backups y restauración](docs/05-backups-y-restauracion.md) | Política, comandos y prueba de restauración |
| [Checklist de seguridad](docs/06-checklist-seguridad.md) | Qué está implementado y qué queda por hacer |
| [Integraciones](docs/07-integraciones.md) | Email y almacenamiento: cómo conectar los proveedores reales |
| [Privacidad](docs/08-privacidad.md) | Datos personales, retención y qué debe validar un asesor legal |
| [Modelo de amenazas](docs/09-modelo-amenazas.md) | Qué se defiende y cómo |
| [Despliegue en Vercel + Neon](docs/10-despliegue-vercel-neon.md) | Paso a paso para producción |
| [Identidad visual por cliente](docs/11-identidad-visual.md) | Cómo se personaliza el espacio de cada cliente |
| [Decisiones técnicas (ADR)](docs/adr/) | Por qué cada decisión importante |

---

## Arquitectura en una pantalla

```
src/app/                 presentación: RSC + server actions. Nunca importa Prisma.
src/app/(auth)/          login, invitación, recuperación
src/app/(app)/           panel interno de la agencia
src/app/(portal)/        portal del cliente
src/app/api/exportar/    descargas autorizadas

src/lib/authz/           capacidades, matriz de roles, contexto y guards
src/lib/auth/            sesión, contraseñas, tokens, invitaciones, rate limiting
src/lib/db/              cliente Prisma + apertura de transacción con el alcance para RLS
src/lib/repos/           acceso a datos: el ÚNICO lugar que habla con Prisma
src/lib/domain/          reglas puras: normalización, estados, serializadores
src/lib/import/          lectura del Excel y aplicación de la importación
src/lib/ports/           EmailSender y FileStorage con adaptadores intercambiables
```

Las tres barreras de aislamiento entre clientes están explicadas en
[docs/09-modelo-amenazas.md](docs/09-modelo-amenazas.md).

---

## Despliegue en `influencers.jcmarketing.digital`

1. PostgreSQL 16 con dos roles: `jc_owner` (dueño, corre migraciones) y `jc_app`
   (**sin** `SUPERUSER` y **sin** `BYPASSRLS`, es el que usa la aplicación).
   Ver `docker/postgres-init/01-roles.sql`.
2. Variables de entorno según `.env.example`. `SESSION_SECRET` nuevo y distinto al de desarrollo.
3. `npm ci && npm run build`
4. `MIGRATION_DATABASE_URL=... npx prisma migrate deploy`
5. `npm start` detrás de un proxy con TLS. La cookie de sesión usa `Secure` cuando `NODE_ENV=production`,
   así que **el sitio tiene que servirse por HTTPS** o no habrá sesión.
6. Configurar el proxy para que pase `X-Forwarded-For` y `X-Forwarded-Proto` (se usan para auditoría y
   para la validación de origen).
7. Email: `EMAIL_DRIVER=smtp` con los datos del proveedor. Sin esto, las invitaciones sólo se escriben
   en `./.mail` y en la tabla `email_outbox`.
8. Archivos: `STORAGE_DRIVER=s3` apuntando al bucket. El bucket **no** debe ser público.

---

## Lo que este proyecto NO hace

- No hay registro público: el acceso lo habilita la agencia por invitación.
- No trae métricas de Instagram, TikTok ni YouTube por API. Los números se cargan a mano o por
  importación, y siempre quedan con su fuente y su fecha.
- No fusiona influencers duplicados por su cuenta.
- No afirma cumplimiento legal de ninguna normativa. Ver [docs/08-privacidad.md](docs/08-privacidad.md).
