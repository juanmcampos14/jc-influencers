# Plan técnico y funcional

## Producto
`influencers.jcmarketing.digital` — plataforma multitenant de marketing de influencers para JC.
Reemplaza el Excel `_INTERNO JC - KAST Propuesta de perfiles`.

## Stack (repo vacío → stack preferido)
Next.js 15 (App Router) · TypeScript strict · PostgreSQL 16 · Prisma · Tailwind v4 · Radix (shadcn-style) · Zod · Vitest · Playwright · Docker Compose · storage S3-compatible (MinIO local).

### Desvío justificado: autenticación
No se usa Auth.js. Motivo técnico: con el proveedor *credentials* Auth.js sólo soporta sesión JWT, y JWT **no permite revocar accesos ni desactivar usuarios en el acto**, que son requisitos explícitos. Se implementa una capa de sesión con primitivas maduras: token opaco de 256 bits, guardado **hasheado** (SHA-256) en base, cookie `HttpOnly/Secure/SameSite=Lax`, expiración, rotación, revocación individual y masiva. Hash de contraseña con `scrypt` (Node core, sin dependencias nativas). Ver `docs/adr/ADR-002`.

## Arquitectura en capas
```
app/            presentación (RSC + server actions)  ← nunca importa Prisma
  └ actions/    contratos tipados (Zod) + authorize() + audit()
lib/auth/       sesión, contraseñas, invitaciones, rate limit
lib/authz/      capacidades, matriz de roles, resolución de alcance, guards
lib/db/         cliente Prisma + apertura de transacción con GUCs para RLS
lib/repos/      acceso a datos (único lugar que habla con Prisma)
lib/domain/     reglas puras (normalización, transiciones de estado, redacción)
lib/import/     importador de Excel (lectura real del .xlsx)
lib/ports/      EmailSender, FileStorage (adaptadores local/S3, SMTP)
```

## Multitenancy: 3 barreras
1. **Alcance desde la sesión**: `resolveScope(session)` lee las membresías **de la base**, nunca del navegador. Todo `clientId`/`campaignId` que llega del cliente se valida contra el alcance antes de tocar datos.
2. **Repositorios con filtro obligatorio**: ningún repo expone un `findById` sin `clientId`. Un recurso fuera de alcance devuelve `null` → **404**, nunca 403 con detalle (no se revela existencia).
3. **Row-Level Security en Postgres**: la app se conecta con un rol sin `BYPASSRLS`; cada request abre transacción y hace `SET LOCAL app.client_ids`, `app.role`, `app.user_id`. Las políticas filtran por `client_id`. Es la red de seguridad si la capa 1 o 2 falla.

## Modelo de dominio (resumen)
- **Identidad**: `User`, `Session`, `Invitation`, `PasswordReset`, `AgencyMembership`, `ClientMembership`
- **Tenants**: `Client` (tenant), `Campaign`, `CampaignAssignment`
- **Brief**: `CampaignBrief`, `BriefCluster` (cluster + % objetivo, configurable por campaña), `BriefKeyword`, `BriefNiche`
- **Base global**: `Influencer` (única, propiedad de agencia), `SocialProfile`, `MetricSnapshot`, `Tag`, `InfluencerDuplicate`
- **Participación**: `Candidacy` (influencer × campaña) — cluster, ranking, estado, fit, justificación, idea de contenido, entregables, presupuesto pedido/negociado, moneda, caché, canje, disponibilidad, contacto, negociación, aprobación cliente, shortlist + orden, responsable, fechas, motivo de baja
- **Trazabilidad**: `CandidacyStatusEvent`, `Comment` (4 visibilidades), `SourceReference`, `AuditLog`, `ImportRun`, `ImportRowLog`
- **Config**: `CandidacyStatusDef` (estados configurables), `Niche`, `SavedView`

## Roles → capacidades
8 roles (5 de agencia, 3 de cliente) con capacidades explícitas. Ver `docs/03-roles-y-permisos.md`.

## Etapas
1. Inspección Excel + repo ✅
2. Modelo de dominio + modelo de amenazas
3. Auth, tenants, permisos, RLS
4. Migraciones + datos demo
5. Clientes y campañas
6. Base de influencers y scouting
7. Portal del cliente
8. Importador del Excel
9. Auditoría y exportaciones
10. Tests + revisión de seguridad
11. Documentación
