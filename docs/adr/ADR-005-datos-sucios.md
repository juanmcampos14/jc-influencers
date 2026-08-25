# ADR-005 · Preservar el dato original y nunca inventar

**Fecha:** 2026-08-25 · **Estado:** aceptada

## Contexto

El Excel de origen trae, en la misma columna: `78,9k`, `10 k`, `7,2M`, `176.000`, `42,327`, `A verificar`,
`83.4`, `Likes ocultos`, `Instagram: 3.500` (que es un número de seguidores en la columna de engagement).

Además tiene dos filas con la misma URL y distinto nombre, filas que describen a dos personas, títulos de
bloque mezclados con datos, celdas combinadas y al menos un hipervínculo que apunta a un perfil distinto
del que muestra el texto.

## Decisión

**Regla: el sistema no inventa un valor. Si no puede interpretarlo, lo dice.**

Cada métrica se guarda tres veces:

| Campo | Contenido |
| --- | --- |
| `followers` | Entero normalizado, o `NULL` |
| `followersRaw` | El texto tal cual venía. Nunca se pierde |
| `followersUnparsed` | `true` si había algo escrito que no se pudo interpretar |

Casos concretos:

- `83.4` sin sufijo es ambiguo (¿83.400 u 83,4 mil?) → **no se normaliza**, se reporta la fila.
- Un valor sin `%` en la columna de engagement **no es** un engagement rate → se rechaza y se reporta.
- `A verificar`, `—`, `Likes ocultos` son **ausencia de dato**, no error. Se distinguen.
- Texto y enlace en desacuerdo → **manda el texto visible**, y la contradicción se reporta como `CONFLICT`.
- Fila con dos personas → **no se parte sola**. Se reporta como `MULTI_PERSON` para que la separe una persona.
- Misma URL con nombre claramente distinto → **no se fusiona**. Entran las dos y el par queda marcado.

## Consecuencias

- La importación del archivo real reporta, sobre 249 filas de personas: **21 posibles duplicados,
  55 filas incompletas, 5 valores no normalizables, 3 contradicciones del origen y 4 filas con más de
  una persona**. Cada una con su hoja y su número de fila.
- El equipo ve el estado real de sus datos en vez de una base que parece limpia y no lo está.
- **Costo:** el reporte previo es largo. Es la intención: es información, no ruido.
