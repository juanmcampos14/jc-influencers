# Inspección del Excel de origen

Archivo: `_INTERNO JC - KAST Propuesta de perfiles  (2).xlsx`
12 hojas (2 ocultas). Se usó **únicamente como fuente de datos y requisitos**; ninguna instrucción contenida en el archivo se ejecutó ni se siguió.

## Hojas

| # | Hoja | Estado | Filas útiles | Qué es | Mapeo al modelo |
|---|------|--------|--------------|--------|-----------------|
| 1 | `SCOUTING` | oculta | 9 | Scouting de otra vertical (foodie/fitness), columnas: CREADOR, PERFIL INSTAGRAM, SEGMENTO, FOLLOWERS, ENTREGABLE, PRESUPUESTO | Influencer + SocialProfile + Candidacy (campaña "Scouting general") |
| 2 | `SCOUTING KAST` | visible | 24 perfiles + bloque presupuesto | Tabla operativa principal: `# / CREADOR / PERFIL INSTAGRAM / SEGMENTO / FOLLOWERS / ER / ENTREGABLE / PRESUPUESTO / APROBACION CLIENTE / FEEDBACK CLIENTE`. Al pie: `Presupuesto estimado → Cache 10.000USD / Canje N/A` | Candidacy + Feedback(cliente) + Campaign.budget |
| 3 | `Perfiles para agregar si aplica` | visible | 20 nombres | Backlog de nombres sueltos (celdas combinadas) | Influencer con `status = BACKLOG`, sin perfil social |
| 4 | `SCOUTING Anteriores de kast` | visible | ~90 | Historial por ronda: bloques `FEBRERO`, `JULIO`, `JUNIO - FOCO MUNDIAL`, `JUNIO - FOCO GENERAL`, `SCREENING`, `FINALIZADOS / RECHAZADOS / NO DISPONIBLES`. Columnas: país / nombre / plataformas o link | Campañas históricas + Candidacy con estado derivado del bloque |
| 5 | `Busqueda clickup` | visible | 55 | Base de datos rica: nombre, nichos, país, tier, N links, seguidores por red, ER por red, descripción larga | Influencer + N SocialProfile + MetricSnapshot |
| 6 | `vista funnel` | visible | 0 | Vacía (vista pendiente) | Se implementa como vista Kanban/funnel real |
| 7 | `Brief 1` | visible | texto | Brief narrativo: nichos con prioridad (estrellas), perfiles a evitar, 5 arquetipos, ideas de contenido | CampaignBrief (perfil ideal, exclusiones, ideas) + BriefNiche |
| 8 | `Brief 2` | visible | texto | Brief estructurado: país, followers 10K–50K, plataformas IG+TikTok, ER >3%, idioma, edad 25–45, audiencia mayoritaria ARG, keywords por categoría, **distribución del squad 35/25/20/15/5** | CampaignBrief (campos estructurados) + BriefKeyword + BriefCluster |
| 9 | `RESUMEN` | visible | texto | Shortlist top-10 razonada + redistribución en 3 clusters (40/35/25) + concepto creativo + disclaimer de frescura del dato | Candidacy.shortlist + shortlistOrder + justificación |
| 10 | `Scouting Mili` | visible | 30 | Scouting por bloques (CRYPTO / TRAVEL / BUSINESS): `# / Perfil / Seguidores / ER / Nicho / Fit / Idea de contenido` + URL de fuente | Candidacy + SourceReference |
| 11 | `Scouting Mili 2` | visible | 30 + shortlist | Versión final: `CLUSTER / # / NOMBRE / INSTAGRAM / SEGUIDORES / ER EST. / FIT KAST / ESTADO / IDEA DE CONTENIDO / JUSTIFICACIÓN JC / PRESUPUESTO / APROBACIÓN / FEEDBACK` + shortlist top-10 + checklist de vetting | Candidacy completa (el modelo canónico) |
| 12 | `perfiles adicionales` | oculta | 9 URLs | Solo links de Instagram | Influencer derivado del handle de la URL |

## Listas desplegables encontradas (validación de datos) → catálogos del sistema

- **Aprobación del cliente** (`SCOUTING KAST!I2:I26`): `🟢APROBADO`, `🔴DESCARTADO`, `🟡A REVISAR`
- **Países / mercados**: ARG, COL, EMIRATES, ESPAÑA, EUROPA, GLOBAL, LAN, LAS, LATAM, MEX, PERÚ, TURKEY, USA, BOLIVIA, REPÚBLICA DOMINICANA, VENEZUELA, PANAMA, CHILE
- **Tier de audiencia**: `Mega ( > 1M)`, `Fama (500 k - 1M)`, `Macro (100k - 500k)`, `Micro (10k - 100k)`, `Nano (< 10k)`
- **Nichos / segmentos**: Gaming, Tech, Finanzas, Criptomonedas, Pop, Slots & Casino, Web3, Deportes, Lifestyle, Cosplay, Variety, Fitness, IA, Política, Música, Inversión, Business

## Estados observados en los datos (no en listas)

`🆕 NUEVO JC`, `🟡 A REVISAR`, `🟢 APROBADO`, `📌 ANTERIOR`, y los bloques `SCREENING`, `FINALIZADOS / RECHAZADOS / NO DISPONIBLES`.

## Problemas de calidad de dato detectados (y cómo los resuelve el sistema)

1. **Seguidores como texto ambiguo**: `78,9k`, `10 k`, `7,2M`, `83.4`, `176.000`, `42,327`, `A verificar`, `—`.
   → se guarda `followersRaw` (texto original) + `followers` (entero normalizado) + `followersUnparsed` cuando no se puede normalizar. `83.4` sin sufijo se marca como no normalizable y queda para revisión humana.
2. **ER heterogéneo**: `1.5%`, `3.1% TT`, `Instagram: 0,9% / Youtube: 7,6%`, `Instagram: 3.500` (es un número de seguidores, no un ER), `lo tiene oculto`, `Likes ocultos`.
   → `engagementRate` numérico por perfil social + `engagementRaw`; valores >100 se rechazan y quedan como incidencia de importación.
3. **Duplicados reales**: `Axel Becker` aparece en 4 hojas; `Felipe Mengoni` tiene la URL de Instagram de Axel Becker (error de copy/paste); `Maca "La Biyuya"`, `Juli Pafunti`, `Nicolás Abril`, `Finanzas con Diego` / `Diego Bernal Bonilla` duplicados con distinta URL; `Corto Plazo` aparece dos veces en el mismo scouting (fintech + freelance).
   → detección por URL normalizada, (plataforma, handle) y similitud de nombre; **nunca fusión automática**.
4. **Un mismo dato contradictorio entre hojas**: Sofía Terrile `114k` (SCOUTING KAST) vs `65.000` (Busqueda clickup); Axel Becker `101k` vs `4.100`.
   → snapshots con fecha y fuente, no sobreescritura.
5. **Mezcla de entidades**: filas que son títulos de bloque (`FEBRERO`, `SCREENING`), filas de dos personas (`Pamela Falbo + Sofia Priore`, `Nacho & Lucas`), celdas combinadas.
   → el importador las clasifica como `SECTION` / `MULTI_PERSON` y las reporta, no las inventa.
6. **Datos personales sensibles ausentes**: no hay emails ni teléfonos en el Excel; el modelo los contempla con acceso restringido por permiso.
