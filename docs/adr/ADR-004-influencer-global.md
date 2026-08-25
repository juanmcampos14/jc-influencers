# ADR-004 · El influencer es global, la participación es del tenant

**Fecha:** 2026-08-25 · **Estado:** aceptada

## Contexto

El brief lo pide explícitamente: "Un influencer puede existir una sola vez en la base global de la agencia
y participar en múltiples campañas. La información específica de una campaña no debe guardarse
directamente en el registro maestro del influencer."

## Decisión

`Influencer` **no tiene `clientId`**. Es de la agencia.
`Candidacy` es la participación de un influencer en una campaña, y sí lleva `clientId`.

| Dato | Entidad |
| --- | --- |
| Nombre, país, idioma, nichos, contacto, notas internas | `Influencer` |
| Seguidores, engagement, links | `SocialProfile` + `MetricSnapshot` |
| Estado, fit, presupuesto, entregables, feedback, shortlist | `Candidacy` |

## El problema que esto abre

Si el influencer es global, ¿cómo hace RLS para que un usuario de cliente vea sólo los que le mostraron?

La política de `influencers` resuelve: la agencia ve todo; un usuario de cliente ve un influencer sólo si
existe una `Candidacy` **con `clientVisible = true`** en una campaña de alguno de sus clientes.

Además, `searchInfluencers` y `getInfluencer` rechazan de plano a cualquier usuario que no sea de agencia:
la base global no es una superficie del portal del cliente.

## Consecuencias

- El historial de un creador es real: se ve en qué campañas participó y con qué resultado.
- La detección de duplicados tiene sentido, porque hay una sola base donde buscar.
- **Costo:** un dato del influencer corregido para un cliente queda corregido para todos. Es el
  comportamiento correcto, pero hay que tenerlo presente.
