# Identidad visual por cliente

Cada cliente ve su espacio con su propia marca. Lo configura la agencia desde
`Clientes → (cliente) → Identidad visual`.

## Alcance

| Dónde | Qué se ve |
| --- | --- |
| **Portal del cliente** | Su logo, su paleta, su tipografía y el redondeo elegido |
| **Panel interno de la agencia** | Siempre la identidad de JC |

La decisión es deliberada: el equipo de la agencia trabaja saltando entre clientes, y una interfaz
que cambia de color en cada salto desorienta. El cliente, que vive en un solo espacio, sí lo ve suyo.

## De dónde sale la identidad

### Sitio web

Se descarga la página y se busca, en este orden:

1. La etiqueta `theme-color`.
2. Los colores del logo (`apple-touch-icon`, `og:image`, `<img>` con "logo" o "brand" en la clase, alt o src).
3. Los colores hexadecimales más repetidos en los estilos, descartando blancos, negros y grises.

Las tipografías salen de los `<link>` a Google Fonts y de las declaraciones `font-family`.

**Cada color se muestra con el lugar del que salió** ("color dominante del logo", "usado 7 veces en
los estilos del sitio"), para que se pueda discutir en vez de aceptarlo a ciegas.

### Instagram

Usa el proveedor de scouting para traer la foto de perfil. Sin ese proveedor configurado, la opción
avisa que no está disponible en vez de devolver algo inventado.

### Archivo

Se sube el logo o una captura y se extrae la paleta de ahí.

## Qué garantiza el sistema

### La interfaz siempre se lee

Antes de guardar, cada par de colores que se muestra junto se mide con la fórmula de contraste de
**WCAG 2.1**:

| Par | Mínimo |
| --- | --- |
| Texto sobre fondo y sobre superficie | 4,5:1 |
| Texto secundario | 3:1 |
| Color de marca sobre superficie | 3:1 |
| Texto del botón sobre el color de marca | 4,5:1 |

Lo que no llega se corrige solo, oscureciendo o aclarando el tono. La pantalla muestra qué corrigió y
cuánto.

**Cuando corregirlo implicaría cambiar el color más de un 45%**, el sistema se niega a aprobar: en ese
punto el color ya no es el de la marca, y entregar un marrón llamándolo "el amarillo del cliente" sería
mentir. Ahí quedan dos caminos honestos: elegir otros colores, o activar el **modo seguro**, que
conserva el logo y usa la paleta neutra de JC.

### El logo siempre se ve

Se detecta si el logo es de trazo claro u oscuro midiendo la luminancia **sólo de los píxeles opacos**
— un logo blanco sobre fondo transparente tiene un promedio general oscuro y se clasificaría al revés.
Si es claro y el tema es claro, se muestra sobre un fondo del color de la marca.

### Nunca se sirve un SVG de terceros

Un SVG puede contener scripts. El logo se rasteriza a PNG antes de guardarse, y se sirve desde la
aplicación con `Content-Security-Policy: sandbox`, no desde el bucket.

### Un borrador no llega al cliente

La identidad tiene dos estados: **borrador** y **en vivo**. Sólo la aprobada se aplica. Permite
trabajarla sin que el cliente vea el proceso.

## Cómo está hecho

No hay hojas de estilo por cliente ni componentes duplicados. Toda la interfaz consume variables CSS
(`--jc-primary`, `--jc-bg`, `--jc-text`, …) y los tokens de Tailwind salen de esas variables. El tema
del cliente sobrescribe las variables en un contenedor y con eso cambia todo lo que hay adentro.

```
src/lib/domain/color.ts     contraste, corrección, extracción de paleta (funciones puras)
src/lib/domain/theme.ts     paleta → rampa completa de variables CSS
src/lib/ports/brand-extractor.ts   web / Instagram / archivo → propuesta
src/lib/ports/safe-fetch.ts        descarga con protección contra SSRF
src/lib/repos/brand.ts             guardado, aprobación y tema activo
src/components/theme-scope.tsx     aplica las variables
```

La vista previa de la pantalla de configuración usa **las mismas variables** que el portal real: lo
que se ve ahí es lo que va a ver el cliente, no una maqueta que después se desincroniza.

## Seguridad

- Las direcciones que ingresa la agencia se descargan con protección contra **SSRF**: se resuelve el
  dominio, se rechaza cualquier IP privada o de metadatos de la nube, se siguen los redirects a mano
  revisando cada salto, y se cortan tamaño y tiempo.
- Los nombres de tipografía se validan contra una lista blanca **sobre el valor original**. Limpiar los
  caracteres peligrosos y validar el resto sería un error: `<script>` quedaría como `script` y pasaría.
- El logo sólo se entrega a quien tiene ese cliente en su alcance.
- Cada cambio queda en el log de auditoría.
