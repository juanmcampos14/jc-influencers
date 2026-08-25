# Modelo de amenazas

## Qué protegemos

1. **La información comercial de un cliente frente a otro cliente.** Es el riesgo número uno: dos marcas
   competidoras pueden ser clientes al mismo tiempo.
2. **Lo interno de la agencia frente a los clientes**: márgenes, cachés, notas de scouting, criterios.
3. **Los datos de contacto de los influencers**, que son datos personales de terceros.
4. **La integridad del registro de decisiones**: quién aprobó qué y cuándo.

## Las tres barreras de aislamiento

Cada una funciona sola. Para que se filtre un dato entre tenants tienen que fallar las tres.

### Barrera 1 — El alcance se resuelve desde la sesión

`buildAuthContext()` lee de la base las membresías del usuario y arma la lista de `clientId` accesibles.
**Ningún `clientId`, `campaignId` ni rol que llegue del navegador se usa sin validarlo primero contra
esa lista.** `assertClientInScope()` es explícito en cada operación.

### Barrera 2 — Los repositorios son el único acceso a datos

Los componentes de interfaz nunca importan Prisma. Todo pasa por `src/lib/repos/`, donde cada función
verifica alcance y capacidad antes de tocar la base. Un recurso fuera de alcance devuelve **404**, no 403:
cambiar un id en la URL no permite descubrir que el recurso existe.

### Barrera 3 — Row-Level Security en PostgreSQL

La aplicación se conecta con el rol `jc_app`, que **no tiene `BYPASSRLS`**. Cada request abre una
transacción y fija `app.user_id`, `app.scope`, `app.client_ids` y `app.all_clients`. Las políticas filtran
por `clientId`.

El test `tenant-isolation.test.ts` consulta a propósito **sin pasar por los repositorios**, con un `where`
vacío, y comprueba que la base devuelve sólo las filas del tenant en alcance. Un `updateMany` sin `where`
alcanza una sola fila.

## Amenazas y respuestas

| Amenaza | Respuesta | Verificado en |
| --- | --- | --- |
| Cambiar un id en la URL para ver otro cliente | 404 desde el repositorio + RLS | `tenant-isolation`, E2E |
| Mandar un `clientId` ajeno en el payload de una acción | `assertClientInScope` antes de tocar datos | `tenant-isolation` |
| Mezclar un id ajeno en un lote (visibilidad, shortlist) | La operación falla entera, no parcialmente | `tenant-isolation` |
| Asignar un cluster de otra campaña | Validación explícita + FK compuesta en base | `tenant-isolation` |
| Un revisor lee notas internas o márgenes | Los DTO se construyen por lista blanca: la clave no existe | `permissions` |
| Un usuario de cliente se otorga permisos de agencia | `CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE` se aplica al resolver el contexto | `permissions` |
| Un lector aprueba o comenta | Capacidad `candidate.approve` / `feedback.create` | `permissions`, E2E |
| Un ex empleado usa su cookie vieja | Desactivar revoca todas las sesiones al instante | `access`, E2E |
| Reusar un enlace de invitación | Un solo uso, con vencimiento, verificado dentro de la transacción | `access`, E2E |
| Fuerza bruta contra el login | Rate limit por IP y por email + bloqueo temporal a los 10 fallos | `access`, E2E |
| Averiguar qué emails existen | Mensaje idéntico y verificación contra un hash falso para igualar el tiempo | `access`, E2E |
| Robar la base para conseguir tokens | Sesiones, invitaciones y reseteos se guardan hasheados | `access` |
| CSRF desde otro sitio | `SameSite=Lax` + validación de `Origin` + token derivado por HMAC | E2E (cabeceras y cookie) |
| Exportar datos que no se pueden ver | Las columnas del CSV se arman con las mismas capacidades que la pantalla | `export-and-audit` |
| Inyección de fórmulas en el CSV | Se prefijan las celdas que empiezan con `=`, `+`, `-`, `@` | `normalize` |
| Adulterar la auditoría | `REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM jc_app` | `export-and-audit` |
| Subir un archivo peligroso | Lista blanca de tipo, coherencia con la extensión, límite de 10 MB, nombre saneado | `storage.ts` |
| Salir del directorio con `..` en la clave | La ruta resuelta se valida contra la raíz | `storage.ts` |
| XSS | React escapa por defecto; no se usa `dangerouslySetInnerHTML` en ningún lado; CSP con nonce por respuesta, sin `unsafe-inline` en producción | `src/middleware.ts`, `src/lib/security/csp.ts` |
| Clickjacking | `X-Frame-Options: DENY` + `frame-ancestors 'none'` | E2E |
| Un cliente genera gasto en scouting o IA | Ambas capacidades están prohibidas para el lado cliente, y hay tope con corte duro | `scouting-ai-brand` |
| Gasto inesperado por un error del equipo | Aviso previo obligatorio con el costo, y tope mensual que corta antes de llamar al proveedor | `scouting-ai-brand` |
| SSRF con la URL del sitio de un cliente | Se resuelve el dominio, se rechaza toda IP privada o de metadatos, y cada redirect se revalida | `safe-fetch` |
| XSS con un SVG subido como logo | Los SVG se rasterizan a PNG; nunca se almacena ni se sirve el original | `brand-extractor` |
| Inyección por el nombre de una tipografía | Lista blanca aplicada sobre el valor original, no sobre el valor "limpiado" | `color` |
| Una marca deja el panel del cliente ilegible | El contraste se calcula en el servidor y bloquea la aprobación cuando no hay forma de respetar la marca | `color`, `scouting-ai-brand` |
| El cliente ve un análisis que la agencia no quiso mostrarle | Los análisis nacen privados; compartirlos es una acción explícita y auditada | `scouting-ai-brand` |
| La IA inventa un dato y termina en un reporte al cliente | El material declara qué falta y qué está desactualizado; la salida tiene un campo de datos faltantes | `scouting-ai-brand` |

## Lo que este modelo NO cubre

- **Un administrador de agencia deshonesto.** Tiene acceso legítimo a todos los clientes. La defensa es
  la auditoría inmutable, no la prevención.
- **Compromiso del servidor o de la base.** RLS no protege contra alguien que se conecta como `jc_owner`.
- **Ingeniería social sobre la casilla de correo del invitado.** Quien controla ese email puede aceptar
  la invitación.
- **Denegación de servicio.** El rate limiting cubre los formularios sensibles, no un ataque volumétrico.
  Eso corresponde al proxy o al CDN.
- **Que la IA se equivoque.** El sistema garantiza que trabaje sólo con datos reales y que se pueda
  auditar de dónde salió cada recomendación. No garantiza que la recomendación sea buena: es un insumo
  para una persona, no un reemplazo.
- **Que un proveedor externo cobre distinto de lo previsto.** El tope se calcula con el costo por
  registro que se configura en `BRIGHTDATA_COST_PER_RECORD_USD`. Si el precio real del contrato cambia,
  hay que actualizarlo; el sistema no lo descubre solo.
- **Multi-factor.** No está implementado. Ver el checklist de seguridad.
