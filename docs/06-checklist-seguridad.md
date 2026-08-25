# Checklist de seguridad

Estado al cierre de esta entrega. Lo que no está hecho figura como tal, sin adornos.

## Autenticación

- [x] Sin registro público: el acceso se habilita por invitación
- [x] Contraseñas con `scrypt` (N=2^17, r=8, p=1), sal por contraseña, comparación en tiempo constante
- [x] Política de contraseña validada **en el servidor** (12+ caracteres, mayúscula, minúscula, número)
- [x] Mensajes idénticos para email inexistente y contraseña incorrecta
- [x] Verificación contra un hash falso cuando el email no existe, para igualar el tiempo de respuesta
- [x] Bloqueo temporal de 15 minutos a los 10 intentos fallidos
- [x] Rate limiting en login (por IP y por email), recuperación, invitaciones, importación y exportación
- [x] Recuperación con token de un solo uso que vence en una hora
- [x] Cambiar la contraseña cierra todas las sesiones
- [ ] **Segundo factor (TOTP o WebAuthn)** — recomendado para roles de agencia. No implementado.
- [ ] **Detección de credenciales filtradas** (contraste contra listas conocidas). No implementado.

## Sesiones

- [x] Token opaco de 256 bits; en base sólo el `sha256`
- [x] Cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción, `Path=/`
- [x] Vencimiento a 12 horas
- [x] Revocación individual y masiva, efectiva de inmediato
- [x] Desactivar un usuario o cambiarle el rol revoca sus sesiones
- [ ] **Limpieza periódica de sesiones vencidas** — hay que agendar un cron. Ver `purgeExpiredRateLimits`.

## Autorización

- [x] Capacidades explícitas; nada de comparar roles sueltos repartidos por el código
- [x] Alcance resuelto **siempre** desde la base, nunca desde el navegador
- [x] Autorización en cada consulta, acción y endpoint
- [x] Fuera de alcance devuelve 404, no 403: no se revela la existencia del recurso
- [x] Cerrojo que elimina capacidades internas de cualquier usuario del lado cliente
- [x] Nadie puede otorgar una capacidad que no tiene
- [x] Sólo un superadministrador crea o desactiva a otro superadministrador
- [x] La interfaz nunca es la única defensa: ocultar un botón no autoriza nada

## Aislamiento entre tenants

- [x] `clientId` en toda entidad que pertenece a un tenant
- [x] Claves foráneas **compuestas** `(id, clientId)` que impiden referencias cruzadas en la base
- [x] Row-Level Security activo en **todas** las tablas del esquema
- [x] La aplicación se conecta con un rol sin `SUPERUSER` y sin `BYPASSRLS`
- [x] Tests que consultan salteando los repositorios y comprueban que la base filtra igual
- [x] Identificadores no secuenciales (CUID)

## Datos sensibles

- [x] Los DTO se construyen por **lista blanca**: un campo interno directamente no existe en la respuesta
- [x] Notas internas, presupuestos y observaciones privadas nunca se serializan hacia el cliente
- [x] El filtro de visibilidad de comentarios está en el `where` de la consulta, no en el render
- [x] Las exportaciones usan las mismas capacidades que la pantalla
- [x] Datos de contacto de influencers detrás de una capacidad separada
- [x] La auditoría redacta contraseñas, tokens y datos de contacto antes de guardarlos

## Entrada y salida

- [x] Validación con Zod en **todas** las server actions, del lado servidor
- [x] Longitudes máximas en todos los campos de texto
- [x] Subidas: lista blanca de tipo, coherencia con la extensión, límite de 10 MB, nombre saneado
- [x] Protección contra salir del directorio con `..` en las claves de archivo
- [x] Protección contra inyección de fórmulas en el CSV
- [x] Sin `dangerouslySetInnerHTML` en ningún componente
- [x] Enlaces externos con `rel="noopener noreferrer"` y validación de protocolo
- [ ] **Análisis antivirus de los archivos subidos** — recomendado si se van a subir documentos de terceros.

## Cabeceras y transporte

- [x] `X-Content-Type-Options: nosniff`
- [x] `X-Frame-Options: DENY` y `frame-ancestors 'none'`
- [x] `Referrer-Policy: strict-origin-when-cross-origin`
- [x] `Permissions-Policy` restrictiva
- [x] Content-Security-Policy (sin `unsafe-eval` ni `unsafe-inline` para scripts en producción)
- [x] `Strict-Transport-Security` en producción
- [x] `X-Powered-By` desactivado
- [ ] **TLS y renovación de certificado**: responsabilidad del proxy en Donweb.

## CSRF

- [x] `SameSite=Lax` en la cookie de sesión
- [x] Validación de `Origin` en cada server action
- [x] Token CSRF derivado por HMAC del token de sesión, imposible de calcular sin la cookie

## Auditoría

- [x] Login, logout e intentos fallidos
- [x] Invitaciones creadas, aceptadas y revocadas
- [x] Altas, bajas y cambios de rol
- [x] Alta y modificación de clientes y campañas
- [x] Cambios de presupuesto con su propio evento
- [x] Transiciones de estado, aprobaciones y rechazos
- [x] Importaciones y exportaciones (con las columnas entregadas)
- [x] Actor, tenant, acción, entidad, fecha, antes/después, IP, user-agent y correlation id
- [x] **Inmutable en la base**: el rol de aplicación no tiene `UPDATE`, `DELETE` ni `TRUNCATE`
- [ ] **Retención y archivado** del log a largo plazo. Definir política.

## Secretos

- [x] Ningún secreto en el repositorio
- [x] `.env` en `.gitignore`, `.env.example` versionado
- [x] Validación de entorno al arrancar: falla temprano y claro
- [x] `SESSION_SECRET` con mínimo de 32 caracteres
- [ ] **Rotación de secretos**: definir frecuencia y procedimiento.

## Dependencias

- [x] `npm audit --omit=dev`: 0 vulnerabilidades al cierre
- [x] Next.js en versión parcheada (no la 15.1.x afectada por CVE-2025-66478)
- [ ] **Auditoría automática en CI** con bloqueo ante vulnerabilidades altas.

## Pendientes priorizados

1. Segundo factor para roles de agencia.
2. Cron de limpieza (sesiones vencidas, contadores de rate limit, invitaciones vencidas).
3. `npm audit` en integración continua.
4. Antivirus para archivos subidos, si se habilita la carga de documentos de terceros.
5. Política de retención del log de auditoría.
