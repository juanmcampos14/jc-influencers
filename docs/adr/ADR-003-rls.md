# ADR-003 · Row-Level Security como segunda barrera

**Fecha:** 2026-08-25 · **Estado:** aceptada

## Contexto

El brief pide RLS "si PostgreSQL y la infraestructura elegida lo permiten", aclarando que la autorización
de aplicación sigue siendo obligatoria.

## Decisión

Se activa RLS en **todas** las tablas del esquema. La aplicación se conecta con el rol `jc_app`,
creado explícitamente `NOSUPERUSER NOBYPASSRLS`.

El contexto de seguridad viaja por GUCs de sesión, fijadas con `SET LOCAL` dentro de la transacción:

```sql
app.user_id     -- id del usuario de la sesión
app.scope       -- 'agency' | 'client' | 'none'
app.client_ids  -- ids accesibles, separados por coma
app.all_clients -- 'on' para roles de agencia con alcance total
app.system      -- 'on' SÓLO para autenticación y bootstrap
```

Toda operación pasa por `withScope(ctx.db, fn)`, que abre una transacción y fija los GUCs antes de ejecutar.

## Alternativas descartadas

- **Una base por cliente.** Aislamiento perfecto, pero migraciones y operación se multiplican por la
  cantidad de clientes. Desproporcionado para el volumen de una agencia.
- **Un esquema por cliente.** Mismo problema en menor escala, y complica las consultas de la agencia que
  cruzan clientes.
- **Sólo autorización de aplicación.** Es lo que el brief pide reforzar, precisamente.

## Consecuencias

- Un `where` incompleto en un repositorio ya no filtra datos de otro tenant: la base lo corta.
  Verificado con tests que consultan salteando los repositorios.
- **Costo:** cada request abre una transacción. Para un producto interno de agencia es irrelevante.
- **Escape controlado:** `app.system` desactiva el filtro. Lo usan sólo el login, la aceptación de
  invitaciones, el seed y el rate limiting, que necesitan operar sin sesión. Está acotado a
  `withSystemScope` y es rastreable con una búsqueda.
- El log de auditoría además tiene `REVOKE UPDATE, DELETE, TRUNCATE ... FROM jc_app`: es inmutable
  incluso para la aplicación.
