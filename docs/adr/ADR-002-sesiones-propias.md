# ADR-002 · Sesiones propias en vez de Auth.js

**Fecha:** 2026-08-25 · **Estado:** aceptada

## Contexto

El brief sugiere Auth.js "o una solución equivalente madura", y a la vez exige:

- revocar accesos,
- desactivar usuarios sin borrar su historial,
- que un usuario desactivado pierda el acceso **en el acto**.

## Problema

Auth.js con el proveedor *credentials* **sólo soporta sesión JWT**. Un JWT es válido hasta que vence:
no se puede revocar sin agregar por fuera una lista de revocación en base, que es exactamente la mitad
del trabajo de una sesión en base, con la complejidad de Auth.js encima.

## Decisión

Se implementa la capa de sesión con primitivas maduras del propio Node:

| Aspecto | Implementación |
| --- | --- |
| Token | 256 bits de `crypto.randomBytes`, base64url |
| Almacenamiento | Sólo `sha256(token)` en la tabla `sessions` |
| Cookie | `HttpOnly`, `SameSite=Lax`, `Secure` en producción |
| Duración | 12 horas, con refresco de `lastSeenAt` |
| Revocación | Individual y masiva, inmediata |
| Contraseñas | `scrypt` de Node (N=2^17, r=8, p=1), sin dependencias nativas |
| CSRF | Token derivado por HMAC del token de sesión + validación de `Origin` |

## Consecuencias

- Se cumple el requisito de revocación inmediata, verificado por test.
- No se hereda la superficie de una librería de autenticación completa.
- **Costo:** si mañana se quiere Google o Microsoft como proveedor de identidad, hay que agregarlo.
  El modelo lo permite (`User` no exige `passwordHash`), pero es trabajo nuevo.
- `scrypt` de Node es más lento que argon2id nativo. Se eligió igual para no depender de un binario
  compilado. Con los parámetros elegidos, un login tarda unos 100 ms, aceptable para el volumen del producto.
