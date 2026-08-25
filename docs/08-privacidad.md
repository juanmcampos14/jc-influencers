# Privacidad y datos personales

> Este documento describe **qué hace el sistema**. No afirma cumplimiento de ninguna normativa.
> Lo que hay que validar con un asesor legal está listado al final.

## Qué datos personales se guardan

### De los usuarios de la plataforma

| Dato | Para qué | Quién lo ve |
| --- | --- | --- |
| Email | Identificación y acceso | La agencia; los compañeros del mismo cliente |
| Nombre | Atribución de comentarios y decisiones | Igual que el email |
| Hash de contraseña | Autenticación | Nadie: nunca se expone |
| IP y user-agent | Auditoría y seguridad | Sólo roles con `audit.view` |
| Último acceso | Higiene de cuentas | La agencia |

### De los influencers (datos de terceros)

Son personas que **no son usuarias del sistema** y que en general no dieron su consentimiento directo.
Es el punto más sensible del producto.

| Dato | Acceso |
| --- | --- |
| Nombre público, handle, país, ciudad, nichos, bio | Cualquier rol de agencia con `influencer.view` |
| Seguidores, engagement, audiencia | Igual |
| **Email, teléfono y notas de contacto** | **Sólo con `influencer.contact.view`** |
| Base legal declarada para el contacto | Campo `contactLegalBasis`, junto al dato |

Los usuarios de cliente **nunca** acceden a los datos de contacto. Ni por interfaz, ni por API, ni por
exportación. Está verificado con tests.

## Minimización

- Los datos de contacto son opcionales y viven detrás de una capacidad separada.
- No se guarda fecha de nacimiento: sólo `adultStatus` (confirmada, no confirmada, no aplica), que es lo
  único que la operación necesita saber.
- La auditoría **redacta** contraseñas, tokens, emails y teléfonos de contacto antes de guardarlos.
- No se guardan datos de audiencia individualizados, sólo agregados por perfil.

## Qué está implementado

- [x] Acceso a contacto restringido por capacidad
- [x] Campo de base legal declarada junto al dato de contacto
- [x] Redacción de datos sensibles en el log de auditoría
- [x] Auditoría de exportaciones, con el detalle de qué columnas se entregaron
- [x] Desactivación de usuarios **sin borrar** su historial
- [x] Exportación de los datos de una campaña en CSV
- [x] Aislamiento estricto entre clientes

## Qué falta y hay que decidir

- [ ] **Retención configurable.** Hoy no hay borrado automático. Hay que definir cuánto se conserva el
      contacto de un influencer que nunca se contrató, y de uno con quien se trabajó.
- [ ] **Anonimización.** Falta una operación que reemplace nombre y contacto de un influencer conservando
      las métricas históricas agregadas, para cuando alguien pida ser borrado.
- [ ] **Exportación de datos de una persona** (no de una campaña), para responder un pedido de acceso.
- [ ] **Registro de consentimiento** cuando el influencer sí lo dio explícitamente. Hoy sólo hay un campo
      de texto libre con la base legal declarada por la agencia.
- [ ] **Auditoría de lectura** de datos de contacto. Hoy se auditan las exportaciones, no cada consulta
      individual.
- [ ] **Cifrado en reposo a nivel columna** para email y teléfono de contacto, además del cifrado del disco.

## Lo que la agencia y un asesor legal tienen que validar

1. **Base legal para guardar contacto de influencers sin su consentimiento previo.** En Argentina aplica
   la Ley 25.326; si hay creadores o marcas de la UE, además el GDPR. Es una decisión legal, no técnica.
2. **Plazos de retención** por tipo de dato.
3. **Cómo se responde un pedido de acceso, rectificación o supresión**, y en qué plazo.
4. **Si corresponde designar un responsable de tratamiento** y registrar la base de datos.
5. **Qué se le comunica al cliente** sobre el origen de los datos que ve en la plataforma.
6. **Transferencia internacional** si el hosting o el bucket están fuera del país.
7. **Contrato de encargado de tratamiento** con los proveedores de email y almacenamiento.

Ninguno de estos puntos se puede resolver desde el código. El sistema está preparado para implementar
lo que se decida, pero la decisión es de la agencia.
