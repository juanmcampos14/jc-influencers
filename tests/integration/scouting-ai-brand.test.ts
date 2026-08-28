import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AuthContext } from '@/lib/authz/context'
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/authz/errors'
import { withScope, withSystemScope } from '@/lib/db/scope'
import { getActiveTheme, getBrand, resetBrand, saveBrand } from '@/lib/repos/brand'
import {
  getBudgetState,
  importScoutingResults,
  listScoutingResults,
  pollScouting,
  previewScouting,
  setBudget,
  startScouting,
} from '@/lib/repos/scouting'
import { analyzeCampaign, listInsights, shareInsight } from '@/lib/repos/ai'
import { __setScoutingProviderForTests, type JobHandle, type JobProgress, type ScoutingProvider } from '@/lib/ports/scouting'
import { __setAiProviderForTests, type AiProvider } from '@/lib/ports/ai'
import { NEUTRAL_LIGHT } from '@/lib/domain/color'
import {
  contextFor,
  createCampaignFor,
  createClientTenant,
  createUser,
  resetDatabase,
  seedCatalogs,
} from '../helpers/fixtures'

/**
 * Proveedor de scouting de mentira, PARA TESTS.
 * Devuelve datos marcados como de prueba y cuenta cuántas veces se lo llamó,
 * para verificar que el tope de gasto realmente corta antes de gastar.
 */
class FakeScoutingProvider implements ScoutingProvider {
  readonly filtraPorAudiencia = false
  filtrosEnOrigen(): [] {
    return []
  }
  readonly name = 'fake'
  readonly configured = true
  startCalls = 0

  unitCostUsd(): number {
    return 0.01
  }
  supports(): boolean {
    return true
  }
  async startDiscover(): Promise<JobHandle> {
    this.startCalls += 1
    return { jobId: `job-${this.startCalls}`, provider: this.name }
  }
  async startEnrich(): Promise<JobHandle> {
    this.startCalls += 1
    return { jobId: `job-${this.startCalls}`, provider: this.name }
  }
  async poll(): Promise<JobProgress> {
    return {
      status: 'READY',
      records: [
        {
          platform: 'INSTAGRAM',
          url: 'https://www.instagram.com/perfil.de.prueba',
          urlNormalized: 'instagram.com/perfil.de.prueba',
          handle: 'perfil.de.prueba',
          displayName: 'Perfil De Prueba',
          followers: 42_000,
          engagementRate: 2.4,
          country: 'ARG',
          bio: 'Perfil ficticio de test.',
          profileImageUrl: null,
          raw: { fuente: 'test' },
        },
      ],
    }
  }
  async cancel(): Promise<void> {}
  async fetchProfileImage(): Promise<{ imageUrl: string | null; displayName: string | null }> {
    return { imageUrl: null, displayName: null }
  }
}

class FakeAiProvider implements AiProvider {
  readonly name = 'fake'
  readonly configured = true
  readonly model = 'modelo-de-prueba'
  calls = 0
  lastPrompt = ''

  private usage() {
    return { inputTokens: 100, outputTokens: 50, costUsd: 0.002, model: this.model }
  }
  async drawBrandMural() {
    this.calls += 1
    return {
      output: {
        concepto: 'Una silueta simple.',
        alt: 'Silueta simple sobre un fondo plano.',
        svg: '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><circle cx="256" cy="256" r="180"/></svg>',
      },
      usage: this.usage(),
    }
  }
  async analyzeProfileFit() {
    this.calls += 1
    return {
      output: {
        fitScore: 4,
        veredicto: 'Encaja.',
        razones: [],
        riesgos: [],
        datosFaltantes: [],
        ideasDeContenido: [],
      },
      usage: this.usage(),
    }
  }
  async suggestCreatives() {
    this.calls += 1
    return { output: { conceptoGeneral: 'Concepto.', ideas: [], queEvitar: [] }, usage: this.usage() }
  }
  async analyzeCampaign(input: { brief: string; state: string }) {
    this.calls += 1
    this.lastPrompt = `${input.brief}\n${input.state}`
    return {
      output: {
        resumen: 'Va bien.',
        loQueVaBien: [],
        loQuePreocupa: [],
        desviosDelBrief: [],
        proximosPasos: [],
        datosFaltantes: [],
      },
      usage: this.usage(),
    }
  }
  async writeCampaignReport() {
    this.calls += 1
    return { output: '## Reporte\nTexto.', usage: this.usage() }
  }
}

describe('Scouting, IA e identidad visual', () => {
  let clientId: string
  let otherClientId: string
  let campaignId: string
  let admin: AuthContext
  let scout: AuthContext
  let clientAdmin: AuthContext
  let scouting: FakeScoutingProvider
  let ai: FakeAiProvider

  beforeAll(async () => {
    await resetDatabase()
    await seedCatalogs()

    const client = await createClientTenant('Cliente IA')
    clientId = client.id
    const other = await createClientTenant('Cliente Ajeno')
    otherClientId = other.id
    const campaign = await createCampaignFor(clientId, 'Campaña IA')
    campaignId = campaign.id

    admin = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)
    scout = await contextFor((await createUser({ agencyRole: 'SCOUT', agencyClientIds: [clientId] })).id)
    clientAdmin = await contextFor(
      (await createUser({ clientMemberships: [{ clientId, role: 'CLIENT_ADMIN' }] })).id,
    )

    scouting = new FakeScoutingProvider()
    ai = new FakeAiProvider()
    __setScoutingProviderForTests(scouting)
    __setAiProviderForTests(ai)
  })

  afterAll(() => {
    __setScoutingProviderForTests(null)
    __setAiProviderForTests(null)
  })

  // ── Scouting ──

  it('un usuario de cliente no puede ni ver que el scouting existe', async () => {
    await expect(
      previewScouting(clientAdmin, { clientId, mode: 'DISCOVER', platform: 'INSTAGRAM', keywords: ['a'], limit: 10 }),
    ).rejects.toBeInstanceOf(NotFoundError)
    await expect(getBudgetState(clientAdmin, clientId)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('la previsualización informa el costo y no llama al proveedor', async () => {
    const before = scouting.startCalls
    const preview = await previewScouting(scout, {
      clientId,
      mode: 'DISCOVER',
      platform: 'INSTAGRAM',
      keywords: ['stablecoins'],
      limit: 25,
    })
    expect(preview.requestedRecords).toBe(25)
    expect(preview.estimatedCostUsd).toBeCloseTo(0.25, 4)
    expect(scouting.startCalls).toBe(before)
  })

  it('el tope de gasto corta ANTES de llamar al proveedor', async () => {
    await setBudget(admin, { clientId, limitUsd: 0.1 })
    const preview = await previewScouting(scout, {
      clientId,
      mode: 'DISCOVER',
      platform: 'INSTAGRAM',
      keywords: ['viajes'],
      limit: 100, // costaría 1 dólar, y el tope es 0,10
    })
    /*
     * Pasarse del tope es un BLOQUEO, no un aviso: la pantalla apaga el botón
     * en vez de dejar apretarlo para que falle del otro lado. Antes esto vivía
     * en `warnings` y el botón quedaba habilitado.
     */
    expect(preview.puedeEjecutar).toBe(false)
    expect(preview.bloqueos.some((bloqueo) => bloqueo.includes('quedan'))).toBe(true)

    // Y aunque alguien llame a la acción sin pasar por la pantalla, se corta.
    const before = scouting.startCalls
    await expect(startScouting(scout, preview.runId)).rejects.toBeInstanceOf(ValidationError)
    expect(scouting.startCalls).toBe(before)
  })

  it('con presupuesto, ejecuta y registra el gasto real', async () => {
    await setBudget(admin, { clientId, limitUsd: 50 })
    const preview = await previewScouting(scout, {
      clientId,
      mode: 'DISCOVER',
      platform: 'INSTAGRAM',
      keywords: ['finanzas'],
      limit: 10,
    })
    await startScouting(scout, preview.runId)
    const progress = await pollScouting(scout, preview.runId)
    expect(progress.status).toBe('COMPLETED')
    expect(progress.collected).toBe(1)

    const budget = await getBudgetState(scout, clientId)
    // Se reservó lo estimado (0,10) y se ajustó a lo entregado (1 registro = 0,01).
    expect(budget.clientSpentUsd).toBeCloseTo(0.01, 4)
  })

  it('los resultados no entran a la base hasta que alguien los elige', async () => {
    const preview = await previewScouting(scout, {
      clientId,
      mode: 'DISCOVER',
      platform: 'INSTAGRAM',
      keywords: ['tech'],
      limit: 5,
    })
    await startScouting(scout, preview.runId)
    await pollScouting(scout, preview.runId)

    const beforeCount = await withScope(scout.db, (tx) => tx.influencer.count())
    const results = await listScoutingResults(scout, preview.runId)
    expect(results).toHaveLength(1)
    expect(results[0]?.imported).toBe(false)
    expect(await withScope(scout.db, (tx) => tx.influencer.count())).toBe(beforeCount)

    const imported = await importScoutingResults(scout, preview.runId, [results[0]!.id], campaignId)
    expect(imported.created + imported.linked).toBe(1)
    expect(imported.addedToCampaign).toBe(1)

    // El dato importado conserva su origen.
    const profile = await withScope(scout.db, (tx) =>
      tx.socialProfile.findFirst({ where: { urlNormalized: 'instagram.com/perfil.de.prueba' } }),
    )
    expect(profile?.metricSource).toContain('Scouting')
    expect(profile?.verificationStatus).toBe('UNVERIFIED')
  })

  it('no se puede lanzar scouting contra un cliente fuera de alcance', async () => {
    await expect(
      previewScouting(scout, {
        clientId: otherClientId,
        mode: 'DISCOVER',
        platform: 'INSTAGRAM',
        keywords: ['x'],
        limit: 5,
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('el scout no puede cambiar el tope de gasto', async () => {
    await expect(setBudget(scout, { clientId, limitUsd: 9999 })).rejects.toBeInstanceOf(ForbiddenError)
  })

  // ── IA ──

  it('el material que recibe el modelo marca lo que falta y lo desactualizado', async () => {
    await analyzeCampaign(admin, campaignId)
    expect(ai.lastPrompt).toContain('Calidad del dato')
    expect(ai.lastPrompt).toContain('sin verificar')
    // No hay brief cargado: el material lo dice en vez de omitirlo.
    expect(ai.lastPrompt).toContain('todavía no tiene brief')
  })

  it('el análisis se guarda con modelo, versión de prompt y datos usados', async () => {
    const insights = await listInsights(admin, { campaignId })
    const last = insights[0]
    expect(last?.model).toBe('modelo-de-prueba')
    expect(last?.promptVersion).toBeTruthy()
    expect(last?.inputsSummary).toBeTruthy()
    expect(last?.costUsd).toBeGreaterThan(0)
  })

  it('el cliente no ve un análisis hasta que la agencia lo comparte', async () => {
    const insights = await listInsights(admin, { campaignId })
    const insightId = insights[0]!.id

    expect(await listInsights(clientAdmin, { campaignId })).toHaveLength(0)
    await shareInsight(admin, insightId, true)
    const shared = await listInsights(clientAdmin, { campaignId })
    expect(shared).toHaveLength(1)
    expect(shared[0]?.id).toBe(insightId)
  })

  it('un usuario de cliente no puede compartir ni generar análisis', async () => {
    const insights = await listInsights(admin, { campaignId })
    await expect(shareInsight(clientAdmin, insights[0]!.id, false)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(analyzeCampaign(clientAdmin, campaignId)).rejects.toBeInstanceOf(ForbiddenError)
  })

  // ── Identidad visual ──

  it('no se puede aprobar una identidad ilegible sin modo seguro', async () => {
    await expect(
      saveBrand(admin, clientId, {
        source: 'MANUAL',
        mode: 'LIGHT',
        status: 'APPROVED',
        colors: {
          primary: '#fdfdfd',
          onPrimary: '#ffffff',
          accent: '#fdfdfd',
          background: '#ffffff',
          surface: '#ffffff',
          text: '#fefefe',
          muted: '#fefefe',
          border: '#ffffff',
        },
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('una identidad legible se aprueba y se aplica al espacio del cliente', async () => {
    await saveBrand(admin, clientId, {
      source: 'WEBSITE',
      sourceUrl: 'https://ejemplo.test',
      mode: 'LIGHT',
      status: 'APPROVED',
      radius: 4,
      colors: { ...NEUTRAL_LIGHT, primary: '#0f766e', accent: '#14b8a6' },
    })

    const theme = await getActiveTheme(clientAdmin, clientId)
    expect(theme.variables['--jc-primary']).toBe('#0f766e')
    expect(theme.variables['--jc-radius']).toBe('4px')
  })

  it('un borrador no llega al cliente', async () => {
    await saveBrand(admin, clientId, {
      source: 'MANUAL',
      mode: 'LIGHT',
      status: 'DRAFT',
      colors: { ...NEUTRAL_LIGHT, primary: '#b91c1c' },
      version: (await getBrand(admin, clientId)).version,
    })
    const theme = await getActiveTheme(clientAdmin, clientId)
    // Sigue viendo el tema neutro, no el borrador.
    expect(theme.variables['--jc-primary']).not.toBe('#b91c1c')
  })

  it('la identidad de un cliente no se filtra a otro', async () => {
    await saveBrand(admin, clientId, {
      source: 'MANUAL',
      mode: 'LIGHT',
      status: 'APPROVED',
      colors: { ...NEUTRAL_LIGHT, primary: '#0f766e' },
      version: (await getBrand(admin, clientId)).version,
    })
    const otherTheme = await getActiveTheme(admin, otherClientId)
    expect(otherTheme.variables['--jc-primary']).not.toBe('#0f766e')

    // Y un usuario del otro cliente no puede leerla.
    const otherAdmin = await contextFor(
      (await createUser({ clientMemberships: [{ clientId: otherClientId, role: 'CLIENT_ADMIN' }] })).id,
    )
    await expect(getBrand(otherAdmin, clientId)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('un usuario de cliente no puede cambiar su propia identidad visual', async () => {
    await expect(
      saveBrand(clientAdmin, clientId, {
        source: 'MANUAL',
        mode: 'DARK',
        status: 'APPROVED',
        colors: NEUTRAL_LIGHT,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await expect(resetBrand(clientAdmin, clientId)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('los cambios de identidad quedan auditados', async () => {
    const audit = await withSystemScope((tx) =>
      tx.auditLog.findMany({ where: { action: { startsWith: 'brand.' } } }),
    )
    expect(audit.map((entry) => entry.action)).toContain('brand.updated')
  })
})
