import { beforeAll, describe, expect, it } from 'vitest'
import type { AuthContext } from '@/lib/authz/context'
import { parseWorkbook } from '@/lib/import/excel'
import { ajustarImportacion, confirmImport, previewImport } from '@/lib/import/runner'
import { filasParaPreguntar, preverBusquedaDePaises } from '@/lib/import/paises'
import { fraseDelError } from '@/lib/authz/errors'
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

/**
 * Elegir el país que a la planilla le falta.
 *
 * Importa porque sin país un teléfono local no alcanza para abrir un WhatsApp,
 * y porque la decisión se toma en la previsualización pero se aplica al
 * confirmar, que vuelve a leer el archivo: si la decisión viviera sólo en la
 * pantalla, confirmar la ignoraría en silencio.
 */
describe('Importador: el país que falta', () => {
  let admin: AuthContext
  let clientId: string
  let data: Buffer

  beforeAll(async () => {
    await resetDatabase()
    await seedCatalogs()
    clientId = (await createClientTenant('Cliente Sin País')).id
    admin = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)
    data = await buildGenericWorkbook({ conPais: false })
  })

  it('dice cuántas filas quedaron sin país', async () => {
    const summary = await previewImport(admin, { clientId, filename: 'sin-pais.xlsx', data })
    expect(summary.sinPais).toBe(summary.personas.length)
    expect(summary.personas.every((persona) => persona.country === null)).toBe(true)
  })

  it('el país elegido se aplica y se nota que fue elegido', async () => {
    const preview = await previewImport(admin, { clientId, filename: 'sin-pais.xlsx', data })
    const ajustado = await ajustarImportacion(admin, preview.importRunId, { paisPorDefecto: 'ESPAÑA' })
    expect(ajustado.sinPais).toBe(0)
    expect(ajustado.personas.every((persona) => persona.country === 'ESPAÑA')).toBe(true)
    expect(ajustado.personas[0]?.countrySource).toBe('ELEGIDO')
  })

  it('confirmar respeta el país elegido en la previsualización', async () => {
    const preview = await previewImport(admin, { clientId, filename: 'sin-pais.xlsx', data })
    await ajustarImportacion(admin, preview.importRunId, { paisPorDefecto: 'ESPAÑA' })
    await confirmImport(admin, preview.importRunId)

    const page = await searchInfluencers(admin, { search: 'Lucía Ficticia' })
    expect(page.items[0]?.country).toBe('ESPAÑA')
  })

  /*
   * Lo que el archivo SÍ dice manda sobre la lista desplegable: elegir un país
   * para las filas que faltan no puede reescribir las que el archivo sabía.
   */
  it('el país elegido no pisa el que trae la planilla', async () => {
    const conPais = await buildGenericWorkbook()
    const preview = await previewImport(admin, { clientId, filename: 'con-pais.xlsx', data: conPais })
    const ajustado = await ajustarImportacion(admin, preview.importRunId, { paisPorDefecto: 'MEX' })

    const lucia = ajustado.personas.find((persona) => persona.name === 'Lucía Ficticia')
    expect(lucia?.country).toBe('ESPAÑA')
    expect(lucia?.countrySource).toBe('ARCHIVO')
    // La única fila sin país en esa planilla sí toma el elegido.
    const ana = ajustado.personas.find((persona) => persona.name.startsWith('Ana Uno'))
    expect(ana).toBeUndefined() // se reporta como dos personas, no entra
  })

  /*
   * "No hay a quién preguntarle" y "no hay nada que preguntar" se arreglan
   * distinto: lo primero es una credencial que falta, lo segundo es que la
   * planilla ya trae todos los países. Decir el equivocado manda a buscar el
   * problema donde no está. En este entorno de test ningún proveedor sabe
   * actualizar perfiles, que es exactamente el caso.
   */
  it('cuenta aparte las filas que ningún proveedor puede contestar', async () => {
    const twitch = await buildGenericWorkbook({ conPais: false, red: 'twitch' })
    const preview = await previewImport(admin, { clientId, filename: 'twitch.xlsx', data: twitch })
    const filas = await filasParaPreguntar(admin, preview.importRunId)
    expect(filas.total).toBe(0)
    expect(filas.sinProveedor).toBeGreaterThan(0)
  })

  it('sin proveedor que actualice la red lo dice, en vez de decir que no falta ningún país', async () => {
    const twitch = await buildGenericWorkbook({ conPais: false, red: 'twitch' })
    const preview = await previewImport(admin, { clientId, filename: 'twitch.xlsx', data: twitch })
    const error = await preverBusquedaDePaises(admin, preview.importRunId).catch((e: unknown) => e)
    expect(fraseDelError(error)?.clave).toBe('ningunProveedorActualiza')
  })

  /* Y la cuenta tiene que cerrar: cada fila sin país cae en uno de los tres. */
  it('cada fila sin país está en exactamente uno de los tres grupos', async () => {
    const preview = await previewImport(admin, { clientId, filename: 'sin-pais.xlsx', data })
    const filas = await filasParaPreguntar(admin, preview.importRunId)
    const sinPais = preview.personas.filter((persona) => !persona.country).length
    expect(filas.total + filas.sinProveedor + filas.sinUrl).toBe(sinPais)
  })

  it('la previsualización trae cada fila con lo que se leyó', async () => {
    const summary = await previewImport(admin, { clientId, filename: 'sin-pais.xlsx', data })
    const lucia = summary.personas.find((persona) => persona.name === 'Lucía Ficticia')
    expect(lucia).toMatchObject({
      followers: 960000,
      engagementRate: 14,
      phone: '+34 612 345 678',
      budgetAmount: 51415,
      budgetCurrency: 'USD',
    })
    // Ya se confirmó una importación más arriba, así que la fila ahora
    // reconoce a la persona en vez de darla de alta otra vez.
    expect(lucia?.outcome).toBe('EXISTE')
  })
})
