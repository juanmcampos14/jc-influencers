# ADR-007 · Integraciones que cuestan plata: aviso previo y corte duro

**Fecha:** 2026-08-25 · **Estado:** aceptada

## Contexto

Se suman dos integraciones que se pagan por uso: **Bright Data** para scouting y **Anthropic** para
análisis con IA. El pedido fue explícito: *"que solo la agencia tenga permiso para ejecutar eso para
que no tengamos gastos inesperados del cliente"*.

## El problema real

Un permiso mal asignado, un usuario de cliente con un rol de más, o alguien de la agencia que aprieta
un botón sin saber que cuesta: cualquiera de las tres termina en una factura que hay que explicar.
Que sea improbable no alcanza.

## Decisión

Cuatro barreras, en este orden:

1. **Prohibición por lado, no por rol.** `scouting.run` y `ai.run` están en
   `CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE`. Esa lista se aplica al resolver el contexto de
   autorización: aunque alguien escriba la capacidad a mano en la membresía de un usuario de cliente,
   se elimina al construir la sesión. No depende de que el rol esté bien configurado.

2. **Aviso previo obligatorio.** El scouting es un flujo de dos tiempos: *previsualizar* calcula
   cuántos registros y cuánto cuesta **sin llamar al proveedor**, y *ejecutar* es una acción separada
   con confirmación que dice el número en pesos antes de disparar.

3. **Tope mensual con corte duro.** Global de agencia y opcional por cliente. Se comprueba dos veces:
   al previsualizar (para avisar) y **justo antes de gastar** (para cortar). Cuando no entra, la
   ejecución falla con un error; no es una advertencia que se pueda ignorar.

4. **Reserva y ajuste.** Al disparar se reserva el costo estimado. Al terminar se ajusta a lo realmente
   entregado. Si el trabajo falla o se cancela, se libera. Así dos corridas simultáneas no pueden
   pasarse del tope entre las dos.

Además: rate limiting propio, y todo auditado con actor, parámetros y costo.

## Sobre la IA en particular

Dos reglas adicionales, que no son de costo sino de honestidad:

- **El modelo sólo razona sobre datos que tenemos.** El material que recibe incluye explícitamente qué
  falta y qué está desactualizado, y los esquemas de salida tienen un campo `datosFaltantes`. Un
  análisis que completa un hueco con una cifra inventada es peor que no tener análisis: se lee igual de
  seguro y no se puede distinguir.
- **Todo resultado se guarda con su procedencia** (modelo, versión del prompt, qué datos entraron) y se
  muestra con esa información al pie.

Y una de control: **el cliente no ve ningún análisis hasta que la agencia lo comparte**, uno por uno.

## Sin proveedor configurado

La función se muestra **deshabilitada y lo dice**. No devuelve datos de ejemplo ni análisis simulados.
Un dato falso que parece real es la peor falla posible en un producto cuyo valor es la confianza en lo
que muestra.

## Consecuencias

- Un gasto inesperado deja de ser improbable y pasa a ser imposible sin cambiar el tope a propósito.
- **Costo:** dos clics en vez de uno para lanzar un scouting. Es deliberado.
- El tope se calcula con el precio por registro que está en la configuración. Si el contrato con el
  proveedor cambia de precio, hay que actualizarlo: el sistema no lo descubre solo.
