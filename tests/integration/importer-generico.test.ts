import { beforeAll, describe, expect, it } from 'vitest'
import type { AuthContext } from '@/lib/authz/context'
import { parseWorkbook } from '@/lib/import/excel'
import { confirmImport, previewImport } from '@/lib/import/runner'
import { searchInfluencers } from '@/lib/repos/influencers'
import { withSystemScope } from '@/lib/db/scope'
import { buildGenericWorkbook } from '../helpers/build-generic-workbook'
import { buildTestWorkbook } from '../helpers/build-workbook'
import { contextFor, createClientTenant, createUser, resetDatabase, seedCatalogs } from '../helpers/fixtures'

/**
 * Importar una planilla AJENA.
 *
 * El importador leía UNA planilla: la del scouting de la agencia, hoja por
 * hoja, cada una reconocida por su nombre. Cualquier otro Excel entraba, no
 * daba ningún error y no importaba a nadie: "formato no reconocido". Eso es lo
 * peor que puede pasar, porque se lee como que el archivo está mal.
 */
describe('Importador: planilla con encabezados', () => {
  let admin: AuthContext
  let clientId: string
  let data: Buffer

  beforeAll(async () => {
    await resetDatabase()
    await seedCatalogs()
    clientId = (await createClientTenant('Cliente Genérico')).id
    admin = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)
    data = await buildGenericWorkbook()
  })

  it('encuentra el encabezado aunque no esté en la primera fila', async () => {
    const parsed = await parseWorkbook(data)
    const hoja = parsed.sheetsSeen.find((entry) => entry.name === 'INTERNACIONALES')
    expect(hoja?.handled).toBe(true)
    expect(hoja?.note).toContain('encabezado en la fila 4')
  })

  it('importa a las personas de la planilla', async () => {
    const parsed = await parseWorkbook(data)
    expect(parsed.people.map((person) => person.displayName)).toEqual([
      'Lucía Ficticia',
      'Mateo Inventado',
      'Sofía Prueba',
      'Nico SinLink',
    ])
  })

  /*
   * El error que habría pasado inadvertido: en Excel un porcentaje es una
   * FRACCIÓN con formato. La celda vale 0,14 y se ve "14%". Leer el texto da
   * "0.14", y eso normalizado sería 0,14% -- cien veces menos. Un ER de 0,14%
   * descarta a un creador que en realidad rinde bien.
   */
  it('un porcentaje con formato de Excel no se divide por cien', async () => {
    const parsed = await parseWorkbook(data)
    const lucia = parsed.people.find((person) => person.displayName === 'Lucía Ficticia')
    expect(lucia?.profiles[0]?.engagementRate).toBe(14)
    const sofia = parsed.people.find((person) => person.displayName === 'Sofía Prueba')
    expect(sofia?.profiles[0]?.engagementRate).toBe(3.2)
  })

  it('un porcentaje escrito a mano también se entiende', async () => {
    const parsed = await parseWorkbook(data)
    const mateo = parsed.people.find((person) => person.displayName === 'Mateo Inventado')
    expect(mateo?.profiles[0]?.engagementRate).toBe(4.5)
  })

  it('la URL se toma del hipervínculo cuando el texto visible no es una URL', async () => {
    const parsed = await parseWorkbook(data)
    const sofia = parsed.people.find((person) => person.displayName === 'Sofía Prueba')
    expect(sofia?.profiles[0]?.url).toBe('https://www.instagram.com/sofia.prueba/')
  })

  it('el precio y su moneda salen del formato de la celda', async () => {
    const parsed = await parseWorkbook(data)
    const lucia = parsed.people.find((person) => person.displayName === 'Lucía Ficticia')
    expect(lucia?.budgetAmount).toBe(51415)
    expect(lucia?.budgetCurrency).toBe('USD')
    const mateo = parsed.people.find((person) => person.displayName === 'Mateo Inventado')
    expect(mateo?.budgetCurrency).toBe('EUR')
  })

  it('sigue reportando una fila con dos personas en vez de partirla', async () => {
    const parsed = await parseWorkbook(data)
    const issue = parsed.issues.find((entry) => entry.outcome === 'MULTI_PERSON')
    expect(issue?.message).toContain('Ana Uno + Beto Dos')
  })

  it('a quien no trae URL lo importa igual, y lo dice', async () => {
    const parsed = await parseWorkbook(data)
    const issue = parsed.issues.find((entry) => entry.message.includes('Nico SinLink'))
    expect(issue?.outcome).toBe('INCOMPLETE')
    const nico = parsed.people.find((person) => person.displayName === 'Nico SinLink')
    expect(nico?.profiles).toEqual([])
  })

  it('explica en las decisiones que la hoja se leyó por sus encabezados', async () => {
    const parsed = await parseWorkbook(data)
    expect(parsed.decisions.some((texto) => texto.includes('se leyó por sus encabezados'))).toBe(true)
  })

  /*
   * El lector genérico no puede volverse un comodín que se tragua las hojas de
   * brief o de resumen: ésas tienen su propio lector y no son tablas de gente.
   */
  it('no se queda con hojas que no son una tabla de creadores', async () => {
    const parsed = await parseWorkbook(await buildTestWorkbook())
    const funnel = parsed.sheetsSeen.find((entry) => entry.name === 'vista funnel')
    expect(funnel?.handled).toBe(false)
    const resumen = parsed.sheetsSeen.find((entry) => entry.name === 'RESUMEN')
    expect(resumen?.note).toContain('shortlist')
  })

  it('el teléfono y el email de la planilla quedan en la ficha', async () => {
    const preview = await previewImport(admin, { clientId, filename: 'base.xlsx', data })
    await confirmImport(admin, preview.importRunId)

    const page = await searchInfluencers(admin, { search: 'Lucía Ficticia' })
    const lucia = page.items[0]
    expect(lucia?.contact?.phone).toBe('+34 612 345 678')
    expect(lucia?.contact?.email).toBe('lucia@ejemplo.test')
  })

  it('el precio de la planilla entra como solicitado, no como negociado', async () => {
    const fila = await withSystemScope((tx) =>
      tx.candidacy.findFirst({
        where: { influencer: { displayName: 'Lucía Ficticia' } },
        select: { budgetRequested: true, budgetNegotiated: true, currency: true },
      }),
    )
    expect(Number(fila?.budgetRequested)).toBe(51415)
    expect(fila?.budgetNegotiated).toBeNull()
    expect(fila?.currency).toBe('USD')
  })
})
