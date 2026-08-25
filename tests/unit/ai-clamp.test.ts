import { describe, expect, it } from 'vitest'
import { campaignAnalysisSchema, profileFitSchema, __clampToSchemaForTests } from '@/lib/ports/ai'
import { zodToJsonSchema } from 'zod-to-json-schema'

function jsonSchemaOf(schema: Parameters<typeof zodToJsonSchema>[0]): Record<string, unknown> {
  const built = zodToJsonSchema(schema, { name: 'X', target: 'openApi3' })
  return (built.definitions?.X ?? built) as Record<string, unknown>
}

/**
 * El modelo a veces se pasa de los límites de longitud. Eso no invalida el
 * análisis: se recorta y sigue. Lo que sí tiene que fallar es una estructura mal
 * formada, que es un problema real.
 */
describe('recorte de la salida del modelo', () => {
  it('recorta un texto que se pasa de largo, sin romper palabras', () => {
    const schema = jsonSchemaOf(campaignAnalysisSchema)
    const excedido = {
      resumen: `${'palabra '.repeat(200)}final`,
      loQueVaBien: ['ok'],
      loQuePreocupa: ['ok'],
      desviosDelBrief: ['ok'],
      proximosPasos: ['ok'],
      datosFaltantes: ['ok'],
    }

    expect(campaignAnalysisSchema.safeParse(excedido).success).toBe(false)

    const clamped = __clampToSchemaForTests(excedido, { ...schema, type: 'object' })
    const result = campaignAnalysisSchema.safeParse(clamped)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.resumen.length).toBeLessThanOrEqual(800)
    expect(result.data.resumen.endsWith('…')).toBe(true)
  })

  it('recorta una lista con demasiados elementos', () => {
    const schema = jsonSchemaOf(campaignAnalysisSchema)
    const excedido = {
      resumen: 'corto',
      loQueVaBien: Array.from({ length: 12 }, (_, index) => `punto ${index}`),
      loQuePreocupa: [],
      desviosDelBrief: [],
      proximosPasos: [],
      datosFaltantes: [],
    }
    const clamped = __clampToSchemaForTests(excedido, { ...schema, type: 'object' }) as {
      loQueVaBien: string[]
    }
    expect(clamped.loQueVaBien).toHaveLength(6)
    expect(campaignAnalysisSchema.safeParse(clamped).success).toBe(true)
  })

  it('recorta dentro de objetos anidados', () => {
    const schema = jsonSchemaOf(profileFitSchema)
    const excedido = {
      fitScore: 4,
      veredicto: 'v'.repeat(600),
      razones: ['r'.repeat(500)],
      riesgos: [],
      datosFaltantes: [],
      ideasDeContenido: [],
    }
    const clamped = __clampToSchemaForTests(excedido, { ...schema, type: 'object' })
    const result = profileFitSchema.safeParse(clamped)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.veredicto.length).toBeLessThanOrEqual(400)
    expect(result.data.razones[0]?.length).toBeLessThanOrEqual(300)
  })

  it('no arregla una estructura mal formada: eso sí tiene que fallar', () => {
    const schema = jsonSchemaOf(campaignAnalysisSchema)
    const roto = { resumen: 'ok' } // faltan campos obligatorios
    const clamped = __clampToSchemaForTests(roto, { ...schema, type: 'object' })
    expect(campaignAnalysisSchema.safeParse(clamped).success).toBe(false)
  })

  it('no toca un valor que ya respeta los límites', () => {
    const schema = jsonSchemaOf(campaignAnalysisSchema)
    const correcto = {
      resumen: 'La campaña viene bien.',
      loQueVaBien: ['dos perfiles aprobados'],
      loQuePreocupa: [],
      desviosDelBrief: [],
      proximosPasos: [],
      datosFaltantes: [],
    }
    expect(__clampToSchemaForTests(correcto, { ...schema, type: 'object' })).toEqual(correcto)
  })
})
