# Matriz de roles y permisos

> Generado desde el código con `npm run docs:permisos`. No editar a mano.

La autorización se pregunta siempre por una **capacidad**, nunca comparando roles sueltos.

## Roles de agencia

| Capacidad | Superadministrador de plataforma | Administrador de agencia | Account manager | Scouting / colaborador | Finanzas |
| --- | --- | --- | --- | --- | --- |
| `platform.admin` — Administración técnica de plataforma | sí | — | — | — | — |
| `client.view` — Ver clientes | sí | sí | sí | sí | sí |
| `client.manage` — Administrar clientes | sí | sí | — | — | — |
| `campaign.view` — Ver campañas | sí | sí | sí | sí | sí |
| `campaign.create` — Crear campañas | sí | sí | sí | — | — |
| `campaign.update` — Editar campañas | sí | sí | sí | — | — |
| `campaign.delete` — Archivar/eliminar campañas | sí | sí | — | — | — |
| `brief.view` — Ver brief | sí | sí | sí | sí | sí |
| `brief.manage` — Editar brief y criterios | sí | sí | sí | — | — |
| `influencer.view` — Ver base de influencers | sí | sí | sí | sí | sí |
| `influencer.manage` — Crear y editar influencers | sí | sí | sí | sí | — |
| `influencer.contact.view` — Ver datos de contacto de influencers | sí | sí | sí | — | — |
| `candidate.view` — Ver candidaturas | sí | sí | sí | sí | sí |
| `candidate.manage` — Gestionar candidaturas y estados | sí | sí | sí | sí | — |
| `candidate.approve` — Aprobar, rechazar o pedir revisión | sí | sí | — | — | — |
| `feedback.create` — Dejar feedback | sí | sí | sí | — | — |
| `feedback.internal.create` — Escribir notas internas | sí | sí | sí | sí | — |
| `internal_notes.view` — Ver notas internas | sí | sí | sí | sí | sí |
| `budget.view` — Ver presupuestos y cachés | sí | sí | sí | — | sí |
| `budget.manage` — Editar presupuestos y cachés | sí | sí | — | — | sí |
| `user.invite` — Invitar usuarios | sí | sí | — | — | — |
| `membership.manage` — Asignar roles y clientes | sí | sí | — | — | — |
| `audit.view` — Ver auditoría | sí | sí | — | — | — |
| `export.create` — Generar exportaciones | sí | sí | sí | sí | sí |
| `import.run` — Ejecutar importaciones | sí | sí | sí | — | — |
| `catalog.manage` — Administrar catálogos y configuración | sí | sí | — | — | — |
| `brand.manage` — Configurar la identidad visual de un cliente | sí | sí | sí | — | — |
| `scouting.run` — Ejecutar scouting con el proveedor externo (tiene costo) | sí | sí | sí | sí | — |
| `scouting.budget.manage` — Fijar el tope de gasto de scouting | sí | sí | — | — | sí |
| `ai.run` — Generar análisis con IA (tiene costo) | sí | sí | sí | sí | — |
| `ai.view` — Ver análisis generados con IA | sí | sí | sí | sí | sí |

## Roles de cliente

| Capacidad | Administrador del cliente | Revisor del cliente | Lector del cliente |
| --- | --- | --- | --- |
| `client.view` — Ver clientes | sí | sí | sí |
| `campaign.view` — Ver campañas | sí | sí | sí |
| `brief.view` — Ver brief | sí | sí | sí |
| `candidate.view` — Ver candidaturas | sí | sí | sí |
| `candidate.approve` — Aprobar, rechazar o pedir revisión | sí | sí | — |
| `feedback.create` — Dejar feedback | sí | sí | — |
| `membership.manage` — Asignar roles y clientes | sí | — | — |
| `export.create` — Generar exportaciones | sí | sí | sí |
| `ai.view` — Ver análisis generados con IA | sí | sí | sí |

## Cerrojo contra escalada de privilegios

Estas capacidades se eliminan de cualquier usuario del lado cliente, aunque alguien las
escriba a mano en su membresía o las intente otorgar en una invitación:

- `ai.run` — Generar análisis con IA (tiene costo)
- `audit.view` — Ver auditoría
- `brand.manage` — Configurar la identidad visual de un cliente
- `brief.manage` — Editar brief y criterios
- `budget.manage` — Editar presupuestos y cachés
- `budget.view` — Ver presupuestos y cachés
- `campaign.create` — Crear campañas
- `campaign.delete` — Archivar/eliminar campañas
- `campaign.update` — Editar campañas
- `candidate.manage` — Gestionar candidaturas y estados
- `catalog.manage` — Administrar catálogos y configuración
- `client.manage` — Administrar clientes
- `feedback.internal.create` — Escribir notas internas
- `import.run` — Ejecutar importaciones
- `influencer.contact.view` — Ver datos de contacto de influencers
- `influencer.manage` — Crear y editar influencers
- `influencer.view` — Ver base de influencers
- `internal_notes.view` — Ver notas internas
- `platform.admin` — Administración técnica de plataforma
- `scouting.budget.manage` — Fijar el tope de gasto de scouting
- `scouting.run` — Ejecutar scouting con el proveedor externo (tiene costo)

## Permisos extra otorgables

Se conceden por membresía, encima del rol base. Nadie puede otorgar una capacidad que no tiene.

**A un empleado de agencia:**

- `user.invite` — Invitar usuarios
- `membership.manage` — Asignar roles y clientes
- `budget.view` — Ver presupuestos y cachés
- `budget.manage` — Editar presupuestos y cachés
- `audit.view` — Ver auditoría
- `influencer.contact.view` — Ver datos de contacto de influencers
- `import.run` — Ejecutar importaciones
- `brand.manage` — Configurar la identidad visual de un cliente
- `scouting.run` — Ejecutar scouting con el proveedor externo (tiene costo)
- `scouting.budget.manage` — Fijar el tope de gasto de scouting
- `ai.run` — Generar análisis con IA (tiene costo)

**A un usuario de cliente:**

- `user.invite` — Invitar usuarios
- `export.create` — Generar exportaciones

`user.invite` de un usuario de cliente sólo tiene efecto si la agencia habilitó
`allowClientUserInvites` para ese cliente. `export.create` depende de `allowClientExports`.

## Reglas que no son una capacidad

- **Alcance por cliente**: un `AGENCY_ADMIN` o `PLATFORM_SUPERADMIN` accede a todos los clientes.
  Un `ACCOUNT_MANAGER`, `SCOUT` o `FINANCE` sólo a los que tenga asignados (`agency_client_assignments`).
- **Visibilidad de la candidatura**: el cliente sólo ve las candidaturas con `clientVisible = true`.
  No es una decisión de la interfaz: está en el `where` de la consulta y en la política de RLS.
- **Finanzas y presupuesto**: `FINANCE` puede editar importes de una campaña o candidatura sin
  poder tocar el resto de sus campos.
- **Sólo un superadministrador** puede crear o desactivar a otro superadministrador.
