# ADR-001 · Stack y arquitectura en capas

**Fecha:** 2026-08-25 · **Estado:** aceptada

## Contexto

Repositorio vacío. El brief propone Next.js con App Router, TypeScript estricto, PostgreSQL, Prisma,
Tailwind, Zod, Vitest, Playwright, almacenamiento S3-compatible y Docker Compose.

## Decisión

Se adopta ese stack. Se agrega una separación en capas explícita:

```
app/        presentación (RSC + server actions) — nunca importa Prisma
lib/authz/  capacidades, roles, contexto, guards
lib/auth/   sesión, contraseñas, tokens, invitaciones, rate limiting
lib/db/     cliente Prisma y apertura de transacción con el alcance
lib/repos/  acceso a datos — el ÚNICO lugar que habla con Prisma
lib/domain/ reglas puras: normalización, estados, serializadores
lib/ports/  integraciones externas detrás de una interfaz
```

## Consecuencias

- Cambiar una regla de autorización se hace en un solo lugar.
- El dominio se testea sin base de datos ni navegador.
- Cuesta un poco más escribir una pantalla nueva: hay que pasar por el repositorio.
- Prisma 7 exige adaptador de driver y `prisma.config.ts`; el cliente se genera en `src/generated/prisma`.
