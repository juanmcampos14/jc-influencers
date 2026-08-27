# Implementar el selector de vista de campaña en el portal del cliente

Trabajás sobre este repo (JC Influencers, Next.js + Prisma + PostgreSQL con RLS).
Antes de escribir código, leé `README.md`, `docs/02-modelo-datos.md` y
`docs/03-roles-y-permisos.md`.

En `docs/` hay dos prototipos HTML de esta funcionalidad. Abrilos en el navegador o
leelos como texto: son la referencia visual y de comportamiento, no una sugerencia.

- `docs/13-propuestas-rediseno.html` — las tres direcciones de diseño y el diagnóstico
- `docs/14-vistas-bandeja-conjunto.html` — **esta** funcionalidad, con el switch funcionando

---

## Qué hay que construir

En la pantalla de campaña **del portal del cliente**, el cliente elige entre dos vistas
de los mismos perfiles, y esa elección se recuerda.

**Vista `bandeja`** — un perfil por vez, a pantalla completa, con foto, métricas, el motivo
por el que la agencia lo propone y tres botones de decisión. Es para despachar una cola.

**Vista `conjunto`** — todos los perfiles como fichas, y un panel lateral que muestra el
equipo que se va armando: alcance combinado, mezcla por cluster contra las metas del brief,
y costo estimado. Es para entender el equipo, no para decidir de a uno.

Las dos escriben en el mismo lugar (`clientApproval`), así que nunca hay dos verdades.

---

## Alcance

**Dentro:** el portal del cliente, ruta `/portal/campanas/[campaignId]`.

**Fuera (no lo hagas ahora):** el panel interno de la agencia. Sus seis pestañas
(`Perfiles / Funnel / Shortlist / Brief / Análisis IA / Actividad`) quedan exactamente
como están. Esto es fase 2.

---

## Reglas de arquitectura del repo — respetalas

Estas no son preferencias de estilo, son las barreras que sostienen el aislamiento entre
clientes. Si una te estorba, pará y preguntá en vez de saltearla.

1. **`src/app/` nunca importa Prisma.** Los datos salen de `src/lib/repos/`.
2. **Todo acceso a datos pasa por `scoped(ctx, ...)`** de `src/lib/db/scope.ts`. RLS está
   activo y una consulta fuera de scope falla o —peor— devuelve de menos en silencio.
3. **Las server actions se definen con `defineAction`** (`src/lib/actions/define.ts`) y
   devuelven `ActionResult`. No escribas server actions a mano.
4. **Los permisos salen de `assertCan` / `can`** con las capacidades que ya existen en
   `src/lib/authz/capabilities.ts`. **No agregues capacidades nuevas** y no toques
   `src/lib/authz/`.
5. **Los colores salen de los tokens** de `src/app/globals.css` y de las clases del tema
   (`bg-surface`, `text-ink-500`, `bg-nav`, `text-nav-active-text`, `bg-brand-600`…).
   Ningún hex literal en un componente: el espacio de cada cliente se repinta con su marca
   y un hex literal rompe eso.
6. **Los textos de interfaz van en español rioplatense**, en el mismo tono que el resto del
   producto: directo, sin signos de admiración, sin «¡Genial!». Mirá cualquier pantalla
   existente para calibrar.
7. **No agregues dependencias.** Todo lo necesario ya está instalado.
8. **No crees migraciones nuevas.** El paso 1 explica por qué no hacen falta.

---

## Paso 1 — La preferencia de vista, sin migración

El modelo `SavedView` ya existe y su política RLS (`own_views`) ya lo restringe al propio
usuario. Es exactamente lo que necesitamos.

Creá `src/lib/repos/view-prefs.ts`:

```ts
export type VistaCampana = 'bandeja' | 'conjunto'

/** null = el usuario nunca eligió; decide el default del paso 5. */
export async function getVistaPreferida(
  ctx: AuthContext,
  clientId: string,
): Promise<VistaCampana | null>

export async function setVistaPreferida(
  ctx: AuthContext,
  clientId: string,
  vista: VistaCampana,
): Promise<void>
```

Detalles que importan:

- `resource: 'campaign_view'`, `clientId`, `config: { vista }`.
- **La unique de `SavedView` es `(userId, resource, name)` y no incluye `clientId`.** Si usás
  un `name` fijo, la preferencia de un cliente pisa la del otro. Usá **`name: clientId`**.
  Sin esto, el account de la agencia que trabaja con dos clientes pierde una de las dos.
- Upsert por esa unique.
- Llamá a `assertClientInScope(ctx, clientId)` aunque RLS ya cubra el caso: defensa en
  profundidad, igual que el resto de los repos.
- Si `config` viene con algo que no es `'bandeja'` ni `'conjunto'`, devolvé `null` en vez de
  romper. Es una columna `Json` y puede tener basura vieja.

## Paso 2 — La server action

Creá `src/app/(app)/actions/view-prefs.ts` (el portal ya importa acciones desde ahí, mirá
cómo `(portal)/layout.tsx` usa `switchClientAction`):

```ts
export const setVistaCampanaAction = defineAction(
  z.object({ clientId: z.string().min(1).max(60), vista: z.enum(['bandeja', 'conjunto']) }),
  async (input, ctx) => { /* … */ },
)
```

No hace falta auditar este cambio: es una preferencia de interfaz, no un hecho del negocio.

## Paso 3 — El switch

Creá `src/components/selector-vista.tsx` (componente cliente).

Copiá el patrón de `src/app/(app)/campanas/[campaignId]/tabs.tsx`: **son dos `<Link>`, no dos
`<button>`**, con la misma marca optimista que ya escribiste ahí. Sin eso, tocar el switch no
hace nada visible hasta que vuelve el servidor y desde el teléfono se lee como que la app se
colgó.

- Cada opción muestra su número adentro: `Uno por uno · 70` y `El conjunto · 5/12`.
  Los números vienen por props desde el servidor. Sin números, el usuario elige a ciegas
  entre dos palabras abstractas.
- Al tocar, además de navegar, dispará `setVistaCampanaAction` dentro de un `startTransition`.
  Si falla, no muestres nada: la navegación ya ocurrió y la preferencia se vuelve a intentar
  la próxima vez. Es una preferencia, no un dato.
- `aria-current="page"` en la opción activa. `role="group"` con `aria-label` en el contenedor.
- Debajo del switch, una línea de una sola frase que explica por qué está viendo esa vista.
  Los textos exactos están en el prototipo; son parte del diseño, no relleno.

## Paso 4 — Las dos vistas

Ambas van en `src/app/(portal)/portal/campanas/[campaignId]/`.

### `bandeja.tsx`

- Datos: `listCandidacies(ctx, campaignId, { clientApproval: ['PENDING', 'NEEDS_REVIEW'] }, …)`.
  La posición dentro de la cola es un searchParam (`?n=`), no estado de cliente: así el
  usuario puede recargar, compartir el link y usar el botón atrás del navegador.
- Mostrá: iniciales en el avatar, nombre, handle, cluster, seguidores, engagement, `fitScore`
  y **`agencyRationale` como «Por qué te lo proponemos»**. Ese campo hoy no se muestra en
  ningún lado y es el que hace que la decisión sea rápida.
- El costo sólo si `can(ctx, 'budget.view', clientId)`. Si no, **no muestres el bloque**;
  no lo muestres vacío ni en cero.
- Botones: Aprobar → `APPROVED`, Pedir más info → `NEEDS_REVIEW`, Descartar → `REJECTED`,
  todos vía `setClientApproval`.
- **`setClientApproval` exige `feedback` cuando el estado es `REJECTED`** (lo valida el repo y
  tira `ValidationError`). Descartar tiene que abrir un campo de motivo obligatorio antes de
  enviar, no descubrir el error después.
- Los tres botones sólo si `can(ctx, 'candidate.approve', clientId)`. Un lector ve la bandeja
  completa, sin botones.
- Atajos de teclado: `A` aprobar, `D` descartar, `?` más info, `Z` volver al anterior,
  `V` cambiar de vista. Sólo cuando el foco está dentro de la tarjeta, y nunca cuando hay un
  campo de texto abierto.
- «Deshacer» = volver a la posición anterior y dejar cambiar la decisión. No inventes un
  borrador ni una cola de deshacer: la decisión ya se escribió y se corrige escribiendo otra.
- Cuando no quedan pendientes: un cierre que diga cuántas decisiones tomó y un botón que
  lleva a la vista conjunto.

### `conjunto.tsx`

- Datos: `listCandidacies` con la página completa, `getBrief` (los `clusters` traen
  `targetPercent`) y `perfilesPorCluster`, que **ya existe** en `src/lib/repos/candidacies.ts`.
- **El squad son las candidaturas con `clientApproval === 'APPROVED'`.** No toques
  `inShortlist`: la shortlist es una marca de la agencia y es otra cosa. Que las dos vistas
  escriban el mismo campo es lo que hace que el switch no genere dos realidades.
- Panel lateral, en este orden: alcance combinado contra el objetivo, mezcla por cluster con
  una marca en el `targetPercent` de cada uno, costo estimado contra el tope.
- **El objetivo de alcance y el tope de presupuesto no existen todavía en el modelo.** No
  inventes columnas ni migraciones: si no hay dato, ocultá esa barra completa. El panel tiene
  que servir igual mostrando sólo alcance y mezcla.
- Tocar una ficha aprueba o desaprueba, con la misma regla de permisos y el mismo campo de
  motivo obligatorio al descartar.
- Un veredicto en una línea abajo del panel, que cambie según el estado real (falta cripto,
  te pasaste del tope, listo para proponer). Los textos están en el prototipo.

### El puente entre las dos

Un botón de cada lado, nada más:

- Desde la bandeja: «Ver el conjunto con este perfil marcado» → `?vista=conjunto&foco=<candidacyId>`,
  y esa ficha aparece resaltada.
- Desde cada elegido del panel: «Revisar» → `?vista=bandeja&n=<posición>`.

Sin esto, cada vista olvida lo que pasó en la otra y el usuario reconstruye dónde estaba cada
vez que cambia. Es lo más barato de todo el trabajo y es lo que separa dos vistas de dos
productos.

## Paso 5 — Cómo se resuelve qué vista mostrar

En `page.tsx`, en este orden:

1. Si viene `?vista=`, manda eso.
2. Si no, `getVistaPreferida(ctx, clientId)`.
3. Si tampoco hay, el estado de la campaña: `esperando > 20 → 'bandeja'`, si no `'conjunto'`,
   donde `esperando = summary.byApproval.PENDING + summary.byApproval.NEEDS_REVIEW`.
   Ese conteo ya lo calcula la página hoy.

**Sin `redirect()`.** Resolvé la vista en el servidor y renderizá. Los `<Link>` del switch
siempre llevan `?vista=` explícito, así la URL que el usuario comparte dice qué está mirando.

Los números del switch salen de `candidacySummary`, que la página ya pide.

## Paso 6 — Qué pasa con lo que ya está en esa página

La página del portal hoy tiene tres filtros (`Esperan tu decisión / Todos / Shortlist`) y
`ProposalList`. El switch los reemplaza:

- «Esperan tu decisión» es ahora la vista **bandeja**.
- «Todos» es ahora la vista **conjunto**.
- «Shortlist» pasa a ser un filtro dentro de la vista conjunto, no un tercer modo.

Lo que **no** se toca: el `PageHeader` con la marca del cliente, el bloque «Qué estamos
buscando», los comentarios, `ActivityPanel`, `InsightView` y la descarga de CSV. Todo eso
sigue abajo de las vistas, igual que hoy.

---

## Tests

Con esto tiene que quedar en verde `npm run verify` y `npm run test:e2e`.

**Unitarios / integración** (`tests/`, Vitest contra PostgreSQL real):

- `setVistaPreferida` + `getVistaPreferida` hacen upsert y devuelven lo guardado.
- Dos clientes distintos guardan preferencias distintas para el mismo usuario. **Este test es
  el que atrapa el bug de la unique**; escribilo antes que el resto.
- Un usuario no lee la preferencia de otro.
- La resolución del default: sin preferencia y con 25 pendientes → `bandeja`; sin preferencia
  y con 3 pendientes → `conjunto`; con preferencia guardada → gana la preferencia.
- `config` con basura → `getVistaPreferida` devuelve `null` en vez de romper.

**E2E** (Playwright), con los usuarios del seed:

- `revisor@nordika.demo` entra a una campaña, cambia de vista, recarga, y sigue en la vista
  que eligió.
- Aprueba un perfil en la bandeja y ese perfil aparece en el squad de la vista conjunto.
- Descartar sin motivo no envía y muestra el error en el campo.
- `lector@nordika.demo` ve las dos vistas y **ningún** botón de decisión.

---

## Qué NO hacer

- No crear migraciones ni tocar `prisma/schema.prisma`.
- No importar Prisma desde `src/app/`.
- No tocar `src/lib/authz/` ni agregar capacidades.
- No consultar la base fuera de `scoped(ctx, …)`.
- No agregar dependencias.
- No usar hex literales en componentes.
- No tocar el panel interno de la agencia.
- No cambiar `inShortlist` ni la lógica de shortlist.

---

## Cómo entregar

Rama `feat/vistas-campana`, tres commits que compilen por separado:

1. `feat(prefs): preferencia de vista por usuario y cliente sobre SavedView` — repo, action y tests.
2. `feat(portal): vistas bandeja y conjunto con selector` — componentes y páginas.
3. `test(e2e): recorrido de las dos vistas` — Playwright.

Antes del último commit corré `npm run verify` y `npm run verify:build`.

Si algo del prototipo no se puede hacer con los datos que hay hoy, **no lo simules con datos
inventados**: dejalo afuera, anotalo al final del PR y seguí. Este producto ya decidió que
todo número tiene su fuente y su fecha.
