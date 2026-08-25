# ADR-008 · Un tema por cliente sin duplicar la interfaz

**Fecha:** 2026-08-25 · **Estado:** aceptada

## Contexto

Cada cliente tiene que ver su espacio con su marca: logo, colores y tipografía. Configurable desde el
panel, indicando el sitio web, el Instagram o subiendo un archivo.

## Decisión

**Toda la interfaz consume variables CSS y los tokens de Tailwind salen de esas variables.** El tema
del cliente sobrescribe `--jc-*` en un contenedor y con eso cambia todo lo que hay adentro.

```css
:root { --jc-primary: #3b5bdb; --jc-bg: #f8f9fb; /* … */ }

@theme inline {
  --color-brand-600: var(--jc-primary);
  --color-ink-50: var(--jc-bg);
  --color-surface: var(--jc-surface);
}
```

No hay hojas de estilo por cliente, ni componentes duplicados, ni condicionales de marca repartidos por
el código. Un componente nuevo queda temado sin que quien lo escribe tenga que saber que existe el
concepto de marca.

La rampa completa de grises **se deriva** de la paleta en vez de fijarse a mano, así una marca oscura y
una clara producen jerarquías coherentes sin listas de excepciones.

## Alternativas descartadas

- **Una hoja de estilos por cliente.** Se desincroniza con el producto en la primera pantalla nueva.
- **Clases condicionales por marca.** Ensucia cada componente y no escala más allá de dos o tres marcas.
- **Un iframe con el portal del cliente.** Aísla el estilo pero rompe la navegación y la accesibilidad.

## El riesgo que trae, y cómo se acota

Dejar que un tercero elija los colores de una interfaz es dejar que la rompa. Un cliente con un amarillo
de marca puede producir texto ilegible.

Por eso todo color pasa por una validación de contraste **en el servidor**, con la fórmula de WCAG 2.1,
antes de poder aprobarse. Lo que no llega al mínimo se corrige solo.

La parte interesante es qué hacer cuando corregirlo funciona pero desvirtúa la marca. Un amarillo que
para leerse sobre blanco hay que llevar casi a marrón ya no es el amarillo del cliente. La decisión:
**si el ajuste necesario supera el 45% del camino hacia el negro o el blanco, no se puede aprobar**.
Ahí quedan dos caminos honestos: elegir otros colores, o el **modo seguro**, que conserva el logo y usa
la paleta neutra.

Entregar el marrón y llamarlo "el amarillo de la marca" sería la tercera opción, y es la que no se toma.

## Alcance

El tema se aplica al **portal del cliente**, no al panel interno. El equipo de la agencia salta entre
clientes todo el día y una interfaz que cambia de color en cada salto desorienta. El cliente, que vive
en un solo espacio, sí lo ve suyo.

La pantalla de configuración incluye una vista previa que usa **las mismas variables** que el portal
real: lo que se ve ahí es lo que va a ver el cliente, no una maqueta que se desincroniza.

## Consecuencias

- Una pantalla nueva queda temada sola.
- **Costo:** hay que usar los tokens (`bg-surface`, `text-ink-900`, `bg-brand-600`) y no colores
  literales. Un `bg-white` suelto no se tema.
- Los colores fuera del sistema (rojo de error, verde de éxito) siguen siendo fijos a propósito: el
  significado de "esto falló" no debería depender de la marca del cliente.
