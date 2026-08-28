import 'server-only'
import type { Platform, ScoutingMode } from '@/generated/prisma/enums'
import type { AuthContext } from '@/lib/authz/context'
import {
  evaluarCreador,
  hayFiltros,
  type FiltrosDeAudiencia,
  type FiltrosDeScouting,
  type Veredicto,
} from '@/lib/domain/filtros-scouting'
import { assertCan, assertClientInScope } from '@/lib/authz/context'
import { NotFoundError, ValidationError } from '@/lib/authz/errors'
import { AUDIT, recordAudit } from '@/lib/audit'
import { env } from '@/lib/env'
import { withSystemScope } from '@/lib/db/scope'
import { consumeRateLimit } from '@/lib/auth/rate-limit'
import { scoutingProviderFor, scoutingProviderNamed, ScoutingUnavailableError } from '@/lib/ports/scouting'
import { parseProfileUrl } from '@/lib/domain/normalize'
import { detectDuplicates } from './influencers'
import { registrarHallazgos, vincularConInfluencer } from './base-conocimiento'
import { actorOf, scoped } from './base'

/**
 * Scouting con proveedor externo.
 *
 * Esto gasta plata real, así que el flujo es deliberadamente en dos tiempos:
 * primero se calcula y se muestra cuánto va a costar, y recién si alguien lo
 * confirma se dispara. Antes de disparar se comprueba el tope del mes, que es
 * un corte duro: si no entra, no se ejecuta.
 *
 * Además es sólo para la agencia. Un usuario de cliente no puede generar gasto.
 */

const currentPeriod = (now = new Date()): string => now.toISOString().slice(0, 7)

export type BudgetState = {
  period: string
  clientLimitUsd: number | null
  clientSpentUsd: number
  globalLimitUsd: number
  globalSpentUsd: number
  remainingUsd: number
}

function assertAgencyOnly(ctx: AuthContext): void {
  if (ctx.side !== 'AGENCY') {
    // Para un usuario de cliente esta función directamente no existe.
    throw new NotFoundError()
  }
}

export async function getBudgetState(ctx: AuthContext, clientId: string, now = new Date()): Promise<BudgetState> {
  assertAgencyOnly(ctx)
  assertClientInScope(ctx, clientId)
  const period = currentPeriod(now)
  const globalLimit = env().SCOUTING_MONTHLY_LIMIT_USD

  const [clientBudget, globalBudget] = await scoped(ctx, async (tx) => [
    await tx.scoutingBudget.findUnique({ where: { clientId_period: { clientId, period } } }),
    await tx.scoutingBudget.findFirst({ where: { clientId: null, period } }),
  ])

  /*
   * El gasto GLOBAL se cuenta con permisos de sistema, no con el alcance del
   * usuario.
   *
   * RLS filtra `scouting_runs` por los clientes que cada uno ve, y `scouting.run`
   * la tienen también los account managers y los scouts, que ven sólo lo suyo.
   * Leído bajo su alcance, "gastado este mes" era lo gastado en SUS clientes:
   * tres personas con clientes distintos y un tope de US$200 podían gastar
   * US$600 viendo cada una su barra en el 20%. Y el corte duro usaba el mismo
   * número, así que tampoco cortaba.
   *
   * Sólo sale de acá un total agregado -- nunca filas de otros clientes -- así
   * que no expone nada que no sea el número que el tope necesita.
   */
  const globalSpentRows = await withSystemScope((tx) =>
    tx.scoutingRun.findMany({
      where: { status: { in: ['RUNNING', 'COMPLETED'] }, startedAt: { gte: new Date(`${period}-01T00:00:00.000Z`) } },
      select: { actualCostUsd: true, estimatedCostUsd: true },
    }),
  )

  const globalSpent = globalSpentRows.reduce(
    (sum, row) => sum + Number(row.actualCostUsd ?? row.estimatedCostUsd ?? 0),
    0,
  )
  const clientSpent = Number(clientBudget?.spentUsd ?? 0)
  const clientLimit = clientBudget ? Number(clientBudget.limitUsd) : null
  const effectiveGlobalLimit = globalBudget ? Number(globalBudget.limitUsd) : globalLimit

  const remainingGlobal = Math.max(0, effectiveGlobalLimit - globalSpent)
  const remainingClient = clientLimit === null ? remainingGlobal : Math.max(0, clientLimit - clientSpent)

  return {
    period,
    clientLimitUsd: clientLimit,
    clientSpentUsd: clientSpent,
    globalLimitUsd: effectiveGlobalLimit,
    globalSpentUsd: globalSpent,
    remainingUsd: Math.min(remainingGlobal, remainingClient),
  }
}

export async function setBudget(
  ctx: AuthContext,
  input: { clientId: string | null; limitUsd: number },
): Promise<void> {
  assertAgencyOnly(ctx)
  if (input.clientId) assertClientInScope(ctx, input.clientId)
  assertCan(ctx, 'scouting.budget.manage', input.clientId)
  if (input.limitUsd < 0 || input.limitUsd > 100_000) throw new ValidationError('El tope tiene que estar entre 0 y 100.000.')

  const period = currentPeriod()
  await scoped(ctx, async (tx) => {
    const existing = input.clientId
      ? await tx.scoutingBudget.findUnique({ where: { clientId_period: { clientId: input.clientId, period } } })
      : await tx.scoutingBudget.findFirst({ where: { clientId: null, period } })

    if (existing) {
      await tx.scoutingBudget.update({ where: { id: existing.id }, data: { limitUsd: input.limitUsd.toFixed(2) } })
    } else {
      await tx.scoutingBudget.create({
        data: { clientId: input.clientId, period, limitUsd: input.limitUsd.toFixed(2), createdById: ctx.user.id },
      })
    }
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.SCOUTING_BUDGET_CHANGED,
      entityType: 'ScoutingBudget',
      entityId: existing?.id ?? null,
      clientId: input.clientId,
      after: { period, limitUsd: input.limitUsd },
    })
  })
}

export type PreviewInput = {
  /** Filtros que se van a aplicar a los resultados. Ver `filtros-scouting.ts`. */
  filtros?: FiltrosDeScouting | null
  /**
   * Filtros sobre el PÚBLICO del creador.
   *
   * Van aparte porque no se pueden comprobar después: o el proveedor los aplica
   * en el origen, o no existen. Por eso tampoco se marcan como los otros --no
   * hay dato contra el cual marcar-- y la pantalla sólo los ofrece cuando hay
   * un proveedor conectado que sepa aplicarlos.
   */
  audiencia?: FiltrosDeAudiencia | null
  clientId: string
  campaignId?: string | null
  mode: ScoutingMode
  platform: Platform
  keywords?: string[]
  urls?: string[]
  limit: number
}

export type PreviewResult = {
  runId: string
  requestedRecords: number
  unitCostUsd: number
  estimatedCostUsd: number
  budget: BudgetState
  providerName: string
  providerConfigured: boolean
  /**
   * Si esta corrida se puede ejecutar de verdad.
   *
   * Existe porque antes el preflight avisaba "el proveedor no tiene dataset
   * para esto" y el botón de ejecutar seguía habilitado: se gastaba un clic
   * para llegar a un error que ya se sabía de antemano.
   */
  puedeEjecutar: boolean
  /** Por qué no se puede. Vacío cuando sí se puede. */
  bloqueos: string[]
  /** Avisos que NO impiden ejecutar. */
  warnings: string[]
}

/** Paso 1: calcular el costo y dejarlo registrado. No llama al proveedor. */
export async function previewScouting(ctx: AuthContext, input: PreviewInput): Promise<PreviewResult> {
  assertAgencyOnly(ctx)
  assertClientInScope(ctx, input.clientId)
  assertCan(ctx, 'scouting.run', input.clientId)

  // El que pueda hacer ESTA combinación de plataforma y modo, no el global.
  const provider = scoutingProviderFor(input.platform, input.mode)
  const warnings: string[] = []

  if (input.mode === 'DISCOVER' && (input.keywords ?? []).length === 0) {
    throw new ValidationError('Indicá al menos una palabra clave o hashtag para buscar.')
  }
  if (input.mode === 'ENRICH' && (input.urls ?? []).length === 0) {
    throw new ValidationError('Indicá al menos un perfil para actualizar.')
  }

  const requested = input.mode === 'ENRICH' ? (input.urls ?? []).length : Math.max(1, Math.min(500, input.limit))
  const unitCost = provider.configured ? provider.unitCostUsd(input.platform) : 0
  const estimated = Number((unitCost * requested).toFixed(4))

  const budget = await getBudgetState(ctx, input.clientId)

  /*
   * Se separa lo que IMPIDE ejecutar de lo que sólo hay que saber. Antes todo
   * era un aviso y el botón quedaba habilitado igual: la persona gastaba un
   * clic para llegar a un error que el sistema ya conocía.
   */
  const bloqueos: string[] = []
  if (!provider.configured) {
    bloqueos.push('El proveedor de scouting no está configurado. Cargá las credenciales antes de buscar.')
  } else if (!provider.supports(input.platform, input.mode)) {
    const queHace = input.mode === 'DISCOVER' ? 'descubrir perfiles nuevos' : 'actualizar métricas'
    /*
     * Ya se probó con los dos proveedores (`scoutingProviderFor`), así que si
     * llegamos acá ninguno puede: el mensaje no debe sugerir "probá con el
     * otro", porque no lo hay.
     */
    bloqueos.push(
      `Ningún proveedor conectado puede ${queHace} en ${input.platform}. Probá con otra plataforma, o conectá un proveedor que lo haga.`,
    )
  }
  if (estimated > budget.remainingUsd) {
    bloqueos.push(
      `Cuesta US$ ${estimated.toFixed(2)} y quedan US$ ${budget.remainingUsd.toFixed(2)} del tope de este mes.`,
    )
  }

  const run = await scoped(ctx, async (tx) => {
    const created = await tx.scoutingRun.create({
      data: {
        clientId: input.clientId,
        campaignId: input.campaignId ?? null,
        provider: provider.name,
        mode: input.mode,
        platform: input.platform,
        query: {
          keywords: input.keywords ?? [],
          urls: input.urls ?? [],
          limit: requested,
          // Los filtros viajan con la corrida: así los resultados se pueden
          // volver a evaluar después sin depender de la pantalla que los pidió.
          filtros: input.filtros ?? null,
          audiencia: input.audiencia ?? null,
        } as never,
        status: 'PREVIEW',
        requestedRecords: requested,
        unitCostUsd: unitCost.toFixed(6),
        estimatedCostUsd: estimated.toFixed(4),
        createdById: ctx.user.id,
      },
    })
    await recordAudit(tx, actorOf(ctx), {
      action: AUDIT.SCOUTING_PREVIEW,
      entityType: 'ScoutingRun',
      entityId: created.id,
      clientId: input.clientId,
      metadata: { modo: input.mode, plataforma: input.platform, registros: requested, costoEstimadoUsd: estimated },
    })
    return created
  })

  return {
    runId: run.id,
    requestedRecords: requested,
    unitCostUsd: unitCost,
    estimatedCostUsd: estimated,
    budget,
    providerName: provider.name,
    providerConfigured: provider.configured,
    puedeEjecutar: bloqueos.length === 0,
    bloqueos,
    warnings,
  }
}

/** Paso 2: ejecutar. Acá recién se gasta. */
export async function startScouting(ctx: AuthContext, runId: string): Promise<{ status: string }> {
  assertAgencyOnly(ctx)
  const run = await scoped(ctx, (tx) => tx.scoutingRun.findUnique({ where: { id: runId } }))
  if (!run) throw new NotFoundError()
  assertClientInScope(ctx, run.clientId)
  assertCan(ctx, 'scouting.run', run.clientId)
  /*
   * Una corrida se ejecuta una sola vez. Que el mensaje diga QUÉ pasó y qué
   * hacer: "ya se resolvió" es cierto y no le sirve a nadie parado frente a la
   * pantalla.
   */
  if (run.status !== 'PREVIEW') {
    throw new ValidationError(
      run.status === 'FAILED'
        ? 'Esta búsqueda ya se intentó y falló. Calculá el costo de nuevo para volver a intentarlo.'
        : 'Esta búsqueda ya se ejecutó. Calculá el costo de nuevo para hacer otra.',
    )
  }

  await consumeRateLimit('scoutingRun', ctx.user.id)

  const provider = scoutingProviderFor(run.platform, run.mode)
  if (!provider.configured) throw new ScoutingUnavailableError('El proveedor de scouting no está configurado.')

  // Corte duro: se vuelve a comprobar el tope justo antes de gastar.
  const budget = await getBudgetState(ctx, run.clientId)
  const estimated = Number(run.estimatedCostUsd)
  if (estimated > budget.remainingUsd) {
    throw new ValidationError(
      `No hay presupuesto: la corrida cuesta US$ ${estimated.toFixed(2)} y quedan US$ ${budget.remainingUsd.toFixed(2)} este mes.`,
    )
  }

  const query = run.query as {
    keywords?: string[]
    urls?: string[]
    limit?: number
    filtros?: FiltrosDeScouting | null
    audiencia?: FiltrosDeAudiencia | null
  }
  try {
    const job =
      run.mode === 'DISCOVER'
        ? await provider.startDiscover({
            platform: run.platform,
            keywords: query.keywords ?? [],
            limit: query.limit ?? run.requestedRecords,
            /*
             * Los filtros viajan al proveedor, no sólo al marcado posterior.
             * El que sabe filtrar en el origen --HypeAuditor-- devuelve
             * directamente lo que sirve en vez de hacernos pagar 200 perfiles
             * para quedarnos con 12. El que no sabe los ignora, y el marcado
             * de `filtros-scouting.ts` sigue haciendo su trabajo igual.
             */
            filtros: query.filtros ?? null,
            audiencia: query.audiencia ?? null,
          })
        : await provider.startEnrich({ platform: run.platform, urls: query.urls ?? [] })

    await scoped(ctx, async (tx) => {
      await tx.scoutingRun.update({
        where: { id: runId },
        data: { status: 'RUNNING', externalJobId: job.jobId },
      })
      // El gasto se reserva al disparar: si algo falla después, se libera.
      await upsertSpend(tx, run.clientId, estimated)
      await recordAudit(tx, actorOf(ctx), {
        action: AUDIT.SCOUTING_RUN,
        entityType: 'ScoutingRun',
        entityId: runId,
        clientId: run.clientId,
        metadata: { modo: run.mode, plataforma: run.platform, costoEstimadoUsd: estimated, jobId: job.jobId },
      })
    })
    return { status: 'RUNNING' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error del proveedor.'
    await scoped(ctx, (tx) =>
      tx.scoutingRun.update({
        where: { id: runId },
        data: { status: 'FAILED', errorMessage: message.slice(0, 500), finishedAt: new Date() },
      }),
    )
    throw error
  }
}

async function upsertSpend(
  tx: Parameters<Parameters<typeof scoped>[1]>[0],
  clientId: string,
  amount: number,
): Promise<void> {
  const period = currentPeriod()
  const existing = await tx.scoutingBudget.findUnique({ where: { clientId_period: { clientId, period } } })
  if (existing) {
    await tx.scoutingBudget.update({
      where: { id: existing.id },
      data: { spentUsd: (Number(existing.spentUsd) + amount).toFixed(4) },
    })
  } else {
    await tx.scoutingBudget.create({
      data: { clientId, period, limitUsd: env().SCOUTING_MONTHLY_LIMIT_USD.toFixed(2), spentUsd: amount.toFixed(4) },
    })
  }
}

export type PollResult = { status: string; collected: number; message?: string }

/** Paso 3: consultar el avance y, cuando esté listo, guardar los resultados. */
export async function pollScouting(ctx: AuthContext, runId: string): Promise<PollResult> {
  assertAgencyOnly(ctx)
  const run = await scoped(ctx, (tx) => tx.scoutingRun.findUnique({ where: { id: runId } }))
  if (!run) throw new NotFoundError()
  assertClientInScope(ctx, run.clientId)
  assertCan(ctx, 'scouting.run', run.clientId)
  if (run.status !== 'RUNNING' || !run.externalJobId) {
    return { status: run.status, collected: run.deliveredRecords }
  }

  // Se sigue con el proveedor que la disparó, que quedó guardado en la corrida.
  const provider = scoutingProviderNamed(run.provider)
  const progress = await provider.poll({ jobId: run.externalJobId, provider: run.provider })

  if (progress.status === 'RUNNING') return { status: 'RUNNING', collected: progress.collected }

  if (progress.status === 'FAILED') {
    await scoped(ctx, async (tx) => {
      await tx.scoutingRun.update({
        where: { id: runId },
        data: { status: 'FAILED', errorMessage: progress.message.slice(0, 500), finishedAt: new Date() },
      })
      // El trabajo falló: se libera lo reservado.
      await upsertSpend(tx, run.clientId, -Number(run.estimatedCostUsd))
    })
    return { status: 'FAILED', collected: 0, message: progress.message }
  }

  const records = progress.records
  const actualCost = Number((Number(run.unitCostUsd) * records.length).toFixed(4))

  await scoped(
    ctx,
    async (tx) => {
      for (const record of records) {
        const existing = await tx.socialProfile.findFirst({
          where: { platform: record.platform, urlNormalized: record.urlNormalized },
          select: { influencerId: true },
        })
        await tx.scoutingResult.upsert({
          where: { runId_urlNormalized: { runId, urlNormalized: record.urlNormalized } },
          create: {
            runId,
            clientId: run.clientId,
            platform: record.platform,
            handle: record.handle,
            url: record.url,
            urlNormalized: record.urlNormalized,
            displayName: record.displayName,
            followers: record.followers,
            engagementRate: record.engagementRate === null ? null : String(record.engagementRate),
            country: record.country,
            bio: record.bio,
            raw: record.raw as never,
            matchedInfluencerId: existing?.influencerId ?? null,
          },
          update: {
            followers: record.followers ?? undefined,
            engagementRate: record.engagementRate === null ? undefined : String(record.engagementRate),
            matchedInfluencerId: existing?.influencerId ?? null,
          },
        })
      }

      /*
       * Lo que se pagó una vez queda en la base de la agencia. Va acá adentro,
       * en la misma transacción que registra la corrida: no hay forma de que se
       * cobre una búsqueda y no quede nada aprendido.
       */
      const query = run.query as { keywords?: string[] }
      await registrarHallazgos(tx, {
        provider: run.provider,
        keywords: query.keywords ?? [],
        hallazgos: records.map((r) => ({
          platform: r.platform,
          url: r.url,
          urlNormalized: r.urlNormalized,
          handle: r.handle,
          displayName: r.displayName,
          followers: r.followers,
          engagementRate: r.engagementRate,
          country: r.country,
          bio: r.bio,
          profileImageUrl: r.profileImageUrl,
        })),
      })

      await tx.scoutingRun.update({
        where: { id: runId },
        data: {
          status: 'COMPLETED',
          deliveredRecords: records.length,
          actualCostUsd: actualCost.toFixed(4),
          finishedAt: new Date(),
          summary: { entregados: records.length, conMetricas: records.filter((r) => r.followers !== null).length } as never,
        },
      })
      // Ajuste: se cobró lo estimado, se corrige a lo que realmente entregó.
      await upsertSpend(tx, run.clientId, actualCost - Number(run.estimatedCostUsd))
    },
    120_000,
  )

  return { status: 'COMPLETED', collected: records.length }
}

export async function cancelScouting(ctx: AuthContext, runId: string): Promise<void> {
  assertAgencyOnly(ctx)
  const run = await scoped(ctx, (tx) => tx.scoutingRun.findUnique({ where: { id: runId } }))
  if (!run) throw new NotFoundError()
  assertClientInScope(ctx, run.clientId)
  assertCan(ctx, 'scouting.run', run.clientId)
  if (run.status === 'COMPLETED' || run.status === 'CANCELLED') return

  if (run.status === 'RUNNING' && run.externalJobId) {
    await scoutingProviderNamed(run.provider)
      .cancel({ jobId: run.externalJobId, provider: run.provider })
      .catch(() => undefined)
  }
  await scoped(ctx, async (tx) => {
    await tx.scoutingRun.update({ where: { id: runId }, data: { status: 'CANCELLED', finishedAt: new Date() } })
    if (run.status === 'RUNNING') await upsertSpend(tx, run.clientId, -Number(run.estimatedCostUsd))
  })
}

export type ScoutingResultDto = {
  /** Cómo quedó contra los filtros pedidos. Ver `filtros-scouting.ts`. */
  veredicto: Veredicto
  /** Por qué no cumple, o qué dato faltó para comprobarlo. */
  motivos: string[]
  id: string
  platform: Platform
  handle: string | null
  url: string
  displayName: string | null
  followers: number | null
  engagementRate: number | null
  country: string | null
  bio: string | null
  matchedInfluencerId: string | null
  imported: boolean
  discarded: boolean
}

export async function listScoutingResults(ctx: AuthContext, runId: string): Promise<ScoutingResultDto[]> {
  assertAgencyOnly(ctx)
  const run = await scoped(ctx, (tx) => tx.scoutingRun.findUnique({ where: { id: runId } }))
  if (!run) throw new NotFoundError()
  assertClientInScope(ctx, run.clientId)
  assertCan(ctx, 'scouting.run', run.clientId)

  const rows = await scoped(ctx, (tx) =>
    tx.scoutingResult.findMany({ where: { runId }, orderBy: [{ followers: 'desc' }], take: 500 }),
  )
  const query = run.query as { filtros?: FiltrosDeScouting | null }
  const filtros = query.filtros ?? {}
  const conFiltros = hayFiltros(filtros)

  return rows.map((row) => ({
    /*
     * Sin filtros pedidos, todo cumple: no hay contra qué comparar. Con
     * filtros, al que le falta el dato se lo marca -- nunca se lo saca de la
     * lista, porque "no lo dice" no es "no lo cumple".
     */
    ...(conFiltros
      ? evaluarCreador(
          {
            followers: row.followers,
            engagementRate: row.engagementRate === null ? null : Number(row.engagementRate),
            country: row.country,
            bio: row.bio,
          },
          filtros,
        )
      : { veredicto: 'CUMPLE' as const, motivos: [] }),
    id: row.id,
    platform: row.platform,
    handle: row.handle,
    url: row.url,
    displayName: row.displayName,
    followers: row.followers,
    engagementRate: row.engagementRate === null ? null : Number(row.engagementRate),
    country: row.country,
    bio: row.bio,
    matchedInfluencerId: row.matchedInfluencerId,
    imported: row.imported,
    discarded: row.discarded,
  }))
}

/** Pasa resultados elegidos a la base de influencers, y opcionalmente a una campaña. */
export async function importScoutingResults(
  ctx: AuthContext,
  runId: string,
  resultIds: string[],
  campaignId: string | null,
): Promise<{ created: number; linked: number; addedToCampaign: number }> {
  assertAgencyOnly(ctx)
  const run = await scoped(ctx, (tx) => tx.scoutingRun.findUnique({ where: { id: runId } }))
  if (!run) throw new NotFoundError()
  assertClientInScope(ctx, run.clientId)
  assertCan(ctx, 'scouting.run', run.clientId)
  assertCan(ctx, 'influencer.manage', run.clientId)
  if (resultIds.length === 0) throw new ValidationError('Elegí al menos un perfil.')

  if (campaignId) {
    const campaign = await scoped(ctx, (tx) =>
      tx.campaign.findUnique({ where: { id: campaignId }, select: { clientId: true } }),
    )
    if (!campaign || campaign.clientId !== run.clientId) throw new NotFoundError()
    assertCan(ctx, 'candidate.manage', run.clientId)
  }

  return scoped(
    ctx,
    async (tx) => {
      const results = await tx.scoutingResult.findMany({ where: { id: { in: resultIds }, runId } })
      if (results.length !== resultIds.length) throw new NotFoundError()

      let created = 0
      let linked = 0
      let addedToCampaign = 0

      for (const result of results) {
        let influencerId = result.matchedInfluencerId
        if (!influencerId) {
          const existing = await tx.socialProfile.findFirst({
            where: { platform: result.platform, urlNormalized: result.urlNormalized },
            select: { influencerId: true },
          })
          influencerId = existing?.influencerId ?? null
        }

        if (influencerId) {
          linked += 1
        } else {
          const influencer = await tx.influencer.create({
            data: {
              displayName: result.displayName ?? (result.handle ? `@${result.handle}` : result.url),
              primaryHandle: result.handle,
              country: result.country,
              bio: result.bio,
              status: 'NEW',
              createdById: ctx.user.id,
            },
          })
          influencerId = influencer.id
          created += 1
        }

        const parsed = parseProfileUrl(result.url)
        if (parsed.kind === 'value') {
          const profile = await tx.socialProfile.upsert({
            where: {
              influencerId_platform_urlNormalized: {
                influencerId,
                platform: parsed.value.platform,
                urlNormalized: parsed.value.urlNormalized,
              },
            },
            create: {
              influencerId,
              platform: parsed.value.platform,
              url: parsed.value.url,
              urlNormalized: parsed.value.urlNormalized,
              handle: parsed.value.handle,
              followers: result.followers,
              engagementRate: result.engagementRate,
              metricSource: `Scouting ${run.provider}`,
              measuredAt: run.finishedAt ?? new Date(),
              verificationStatus: 'UNVERIFIED',
              isPrimary: true,
            },
            update: {
              followers: result.followers ?? undefined,
              engagementRate: result.engagementRate ?? undefined,
              metricSource: `Scouting ${run.provider}`,
              measuredAt: run.finishedAt ?? new Date(),
            },
          })
          // Cada lectura del proveedor queda como snapshot con su origen.
          const already = await tx.metricSnapshot.findFirst({
            where: { socialProfileId: profile.id, source: `Scouting ${run.provider} · ${runId}` },
          })
          if (!already && (result.followers !== null || result.engagementRate !== null)) {
            await tx.metricSnapshot.create({
              data: {
                socialProfileId: profile.id,
                followers: result.followers,
                engagementRate: result.engagementRate,
                source: `Scouting ${run.provider} · ${runId}`,
                capturedById: ctx.user.id,
              },
            })
          }
        }

        if (campaignId) {
          const existingCandidacy = await tx.candidacy.findUnique({
            where: { campaignId_influencerId: { campaignId, influencerId } },
          })
          if (!existingCandidacy) {
            await tx.candidacy.create({
              data: {
                clientId: run.clientId,
                campaignId,
                influencerId,
                statusKey: 'NUEVO',
                clientVisible: false,
                createdById: ctx.user.id,
              },
            })
            addedToCampaign += 1
          }
        }

        await tx.scoutingResult.update({
          where: { id: result.id },
          data: { imported: true, importedAt: new Date(), matchedInfluencerId: influencerId },
        })
        /*
         * Se ata el perfil de la base al influencer del padrón. Es el puente por
         * el que la ficha muestra campañas y pagos: no se copian, se leen de la
         * campaña, así que no puede haber dos verdades sobre la misma plata.
         */
        await vincularConInfluencer(tx, {
          platform: result.platform,
          urlNormalized: result.urlNormalized,
          influencerId,
        })
        await detectDuplicates(tx, influencerId)
      }

      await recordAudit(tx, actorOf(ctx), {
        action: AUDIT.SCOUTING_IMPORTED,
        entityType: 'ScoutingRun',
        entityId: runId,
        clientId: run.clientId,
        after: { creados: created, vinculados: linked, agregadosACampania: addedToCampaign },
      })

      return { created, linked, addedToCampaign }
    },
    180_000,
  )
}

export async function listScoutingRuns(ctx: AuthContext, clientId: string) {
  assertAgencyOnly(ctx)
  assertClientInScope(ctx, clientId)
  assertCan(ctx, 'scouting.run', clientId)
  const rows = await scoped(ctx, (tx) =>
    tx.scoutingRun.findMany({
      where: { clientId },
      orderBy: { startedAt: 'desc' },
      take: 30,
      include: { _count: { select: { results: true } } },
    }),
  )
  return rows.map((row) => ({
    id: row.id,
    mode: row.mode,
    platform: row.platform,
    status: row.status,
    requestedRecords: row.requestedRecords,
    deliveredRecords: row.deliveredRecords,
    estimatedCostUsd: Number(row.estimatedCostUsd),
    actualCostUsd: row.actualCostUsd === null ? null : Number(row.actualCostUsd),
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    errorMessage: row.errorMessage,
    resultCount: row._count.results,
    query: row.query,
  }))
}
