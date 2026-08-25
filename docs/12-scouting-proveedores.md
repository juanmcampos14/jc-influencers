# Scouting: dos proveedores, una interfaz

La aplicación no depende de Bright Data ni de Apify: depende de
`ScoutingProvider` (`src/lib/ports/scouting.ts`). Cambiar de proveedor es
cambiar `SCOUTING_PROVIDER`, no tocar código.

Dos reglas que ningún adaptador puede romper:

1. **Todo pedido declara su costo máximo antes de ejecutarse**, y ese número
   tiene que ser cierto. Se cobra por registro entregado.
2. **Si no hay proveedor configurado, se dice.** Nunca se devuelven datos
   inventados que parezcan reales.

## Qué puede cada uno

| | Instagram | TikTok | YouTube |
|---|---|---|---|
| **Bright Data** · traer un perfil conocido | sí | sí | sí |
| **Bright Data** · buscar por palabra clave | **no existe** | sí (lento) | sí |
| **Apify** · traer un perfil conocido | sí | sí | sí |
| **Apify** · buscar por palabra clave | sí | sí | sí |

Medido contra la API real (agosto 2026):

- YouTube, buscar "fitness argentina": **52 s**, devuelve canales con
  suscriptores. Descubrimiento de perfiles en un solo paso.
- TikTok, buscar "#fitnessargentina": **379 s**. Devuelve posts, pero cada uno
  trae el perfil de su autor con seguidores incluidos, así que igual alcanza en
  un paso. Diez posts dieron ocho creadores distintos.
- Instagram: Bright Data no tiene búsqueda de perfiles por palabra clave. Sólo
  "posts por URL". Para buscar en Instagram hace falta Apify.

Esa diferencia de tiempo y esa ausencia en Instagram son la razón de tener el
segundo proveedor.

## El tope de gasto

Bright Data acepta `limit_per_input` y **hay que mandarlo siempre**. Una prueba
sin tope devolvió **387 registros por una sola palabra clave** — casi sesenta
centavos por algo que se pidió "chico". Sin tope, el número que le mostramos a
quien ejecuta deja de ser una promesa.

Apify además acepta `maxTotalChargeUsd`: un techo que aplica el proveedor, no
nosotros. Es más fuerte, porque no depende de que nuestra cuenta esté bien.

## Configuración

### Bright Data

```
SCOUTING_PROVIDER=brightdata
BRIGHTDATA_API_TOKEN=            # Settings → API keys (NO el token de proxy)
BRIGHTDATA_DATASET_INSTAGRAM_PROFILES=gd_l1vikfch901nx3by4
BRIGHTDATA_DATASET_TIKTOK_PROFILES=gd_l1villgoiiidt09ci
BRIGHTDATA_DATASET_TIKTOK_DISCOVER=gd_lu702nij2f790tmv9h
BRIGHTDATA_DATASET_YOUTUBE_PROFILES=gd_lk538t2k2p1k3oos71
BRIGHTDATA_DATASET_YOUTUBE_DISCOVER=gd_lk538t2k2p1k3oos71
BRIGHTDATA_COST_PER_RECORD_USD=0.0015
```

`BRIGHTDATA_DATASET_INSTAGRAM_DISCOVER` queda vacío a propósito: no existe.

El catálogo completo se puede listar con el token:
`GET https://api.brightdata.com/datasets/list`.

### Apify

```
SCOUTING_PROVIDER=apify
APIFY_TOKEN=                     # o APIFY_API_TOKEN; se aceptan los dos
APIFY_ACTOR_TIKTOK_DISCOVER=clockworks~tiktok-scraper
APIFY_ACTOR_INSTAGRAM_DISCOVER=apify~instagram-scraper
APIFY_ACTOR_YOUTUBE_DISCOVER=streamers~youtube-scraper
APIFY_COST_PER_RECORD_USD=0.004
```

Los actores los publica la comunidad y cambian de nombre, por eso van en
variables. Los sugeridos son un punto de partida, no una garantía: hay que
validarlos.

## Comprobar antes de gastar

```
npm run scouting:check                          # gratis: token y datasets/actores
npm run scouting:smoke -- <url de perfil>       # 1 registro real
npm run scouting:descubrir -- YOUTUBE "..." 8   # hasta 8 registros reales
```

`scouting:check` valida el proveedor en uso y también el de respaldo si está
configurado: tener el reemplazo listo y roto no sirve de nada el día que haya
que cambiar.

## Lo que falta validar

El adaptador de Apify está escrito y sus tests cubren la construcción de la
entrada y el mapeo de la salida, incluido el caso feo (el perfil viene anidado
dentro de un post). Lo que **no** está probado es la conversación con la API de
Apify: para eso hace falta un token válido. Hasta entonces, Apify no debe darse
por funcionando.
