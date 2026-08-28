import { beforeEach, describe, expect, it } from 'vitest'
import { fusionarDuplicados } from '@/lib/repos/lote'
import { detectDuplicates } from '@/lib/repos/influencers'
import { claseDeParecido, motivoPorNombre, motivoPorUrl } from '@/lib/domain/parecido'
import { withSystemScope } from '@/lib/db/scope'
import { contextFor, createClientTenant, createUser, resetDatabase, seedCatalogs } from '../helpers/fixtures'
import type { AuthContext } from '@/lib/authz/context'

/**
 * Fusionar duplicados en lote.
 *
 * Fusionar es lo más destructivo que hace el producto --mueve historia de
 * campañas-- y hacerlo de a montones multiplica el daño de equivocarse. Por eso
 * lo que se prueba acá no es que funcione, sino **dónde se planta**: qué se
 * niega a fusionar solo, y si lo dice o lo esconde.
 *
 * El primer intento se guiaba por el PUNTAJE y daba por seguro el 100. Estaba
 * al revés: el 100 es un empate exacto de NOMBRE --la evidencia más débil, dos
 * personas pueden llamarse igual-- mientras que la misma cuenta puntúa 95. Por
 * eso el último test de este archivo ata el detector con la fusión: si alguien
 * cambia cómo se describe una coincidencia, tiene que romperse acá y no en la
 * base de un cliente.
 */
describe('Fusión de duplicados en lote', () => {
  let admin: AuthContext
  let clientId: string

  async function crearInfluencer(nombre: string, handle: string): Promise<string> {
    return withSystemScope(async (tx) => {
      const creado = await tx.influencer.create({ data: { displayName: nombre, primaryHandle: handle } })
      await tx.socialProfile.create({
        data: {
          influencerId: creado.id,
          platform: 'INSTAGRAM',
          url: `https://www.instagram.com/${handle}`,
          urlNormalized: `instagram.com/${handle}`,
          handle,
          isPrimary: true,
        },
      })
      return creado.id
    })
  }

  /** Un par que el detector armó porque son LA MISMA CUENTA. */
  async function parPorLaMismaCuenta(aId: string, bId: string, handle: string): Promise<string> {
    return withSystemScope(async (tx) => {
      const par = await tx.influencerDuplicate.create({
        data: {
          influencerAId: aId,
          influencerBId: bId,
          reason: motivoPorUrl(`instagram.com/${handle}`),
          score: 95,
        },
      })
      return par.id
    })
  }

  /** Un par que el detector armó sólo porque el NOMBRE se parece. */
  async function parPorElNombre(aId: string, bId: string, nombre: string, porcentaje: number): Promise<string> {
    return withSystemScope(async (tx) => {
      const par = await tx.influencerDuplicate.create({
        data: {
          influencerAId: aId,
          influencerBId: bId,
          reason: motivoPorNombre(nombre, porcentaje),
          score: porcentaje,
        },
      })
      return par.id
    })
  }

  async function darleUnaCampana(influencerId: string, nombre: string): Promise<void> {
    await withSystemScope(async (tx) => {
      const campana = await tx.campaign.create({
        data: { clientId, name: nombre, slug: nombre.toLowerCase(), currency: 'USD' },
      })
      await tx.candidacy.create({
        data: { campaignId: campana.id, clientId, influencerId, statusKey: 'PROPUESTO' },
      })
    })
  }

  beforeEach(async () => {
    await resetDatabase()
    await seedCatalogs()
    clientId = (await createClientTenant('Marca')).id
    admin = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)
  })

  it('fusiona el par que es la misma cuenta', async () => {
    const a = await crearInfluencer('Ana Gómez', 'ana.gomez')
    const b = await crearInfluencer('Ana Gomez', 'ana.gomez2')
    const par = await parPorLaMismaCuenta(a, b, 'ana.gomez')

    const resultado = await fusionarDuplicados(admin, [par])

    expect(resultado.hechos).toBe(1)
    expect(resultado.omitidos).toEqual([])

    const cerrado = await withSystemScope((tx) => tx.influencerDuplicate.findUnique({ where: { id: par } }))
    expect(cerrado?.status).toBe('MERGED')
  })

  /*
   * El corte. Por debajo de 100 el parecido lo dedujo un algoritmo mirando
   * nombres, y dos personas distintas pueden llamarse casi igual. Que el lote
   * los saltee es la razón entera de que se pueda ofrecer.
   */
  it('NO fusiona sola a la gente que sólo se parece de nombre, y dice por qué', async () => {
    const a = await crearInfluencer('Juan Pérez', 'juanperez')
    const b = await crearInfluencer('Juan Peres', 'juan.peres')
    const par = await parPorElNombre(a, b, 'Juan Peres', 88)

    const resultado = await fusionarDuplicados(admin, [par])

    expect(resultado.hechos).toBe(0)
    expect(resultado.omitidos).toHaveLength(1)
    expect(resultado.omitidos[0]?.nombre).toContain('Juan Pérez')
    expect(resultado.omitidos[0]?.motivo).toContain('88')
    expect(resultado.omitidos[0]?.motivo).toMatch(/por el nombre/)
    expect(resultado.omitidos[0]?.motivo).toMatch(/de a uno/)

    // Y siguen siendo dos personas distintas, las dos activas.
    const abierto = await withSystemScope((tx) => tx.influencerDuplicate.findUnique({ where: { id: par } }))
    expect(abierto?.status).toBe('OPEN')
    const ambos = await withSystemScope((tx) =>
      tx.influencer.findMany({ where: { id: { in: [a, b] } }, select: { status: true } }),
    )
    expect(ambos.every((i) => i.status !== 'ARCHIVED')).toBe(true)
  })

  it('conserva la ficha con más historia y archiva la otra, sin borrar nada', async () => {
    const pobre = await crearInfluencer('Lu Vega', 'luvega')
    const rica = await crearInfluencer('Lucía Vega', 'lucia.vega')
    await darleUnaCampana(rica, 'Verano')
    const par = await parPorLaMismaCuenta(pobre, rica, 'lucia.vega')

    await fusionarDuplicados(admin, [par])

    const [sobrevive, absorbido] = await withSystemScope((tx) =>
      Promise.all([
        tx.influencer.findUnique({ where: { id: rica }, select: { status: true } }),
        tx.influencer.findUnique({ where: { id: pobre }, select: { status: true, internalNotes: true } }),
      ]),
    )
    expect(sobrevive?.status).not.toBe('ARCHIVED')
    // No se borra: queda archivado y con una nota que dice en quién se fusionó.
    expect(absorbido?.status).toBe('ARCHIVED')
    expect(absorbido?.internalNotes).toContain('Lucía Vega')
  })

  it('un par ya resuelto no se vuelve a tocar', async () => {
    const a = await crearInfluencer('Sol Díaz', 'soldiaz')
    const b = await crearInfluencer('Sol Diaz', 'sol.diaz')
    const par = await parPorLaMismaCuenta(a, b, 'sol.diaz')
    await withSystemScope((tx) =>
      tx.influencerDuplicate.update({ where: { id: par }, data: { status: 'DISMISSED' } }),
    )

    const resultado = await fusionarDuplicados(admin, [par])
    expect(resultado.hechos).toBe(0)
    expect(resultado.omitidos[0]?.motivo).toContain('Ya estaba resuelto')
  })

  /*
   * Que uno falle no puede arrastrar a los demás: quien elige quince pares y
   * uno no se puede tocar tiene que terminar con catorce hechos, no con cero.
   */
  it('mezcla seguros e inseguros: hace los que puede y detalla el resto', async () => {
    const a1 = await crearInfluencer('Uno A', 'uno.a')
    const b1 = await crearInfluencer('Uno B', 'uno.b')
    const seguro = await parPorLaMismaCuenta(a1, b1, 'uno.a')

    const a2 = await crearInfluencer('Dos A', 'dos.a')
    const b2 = await crearInfluencer('Dos B', 'dos.b')
    const dudoso = await parPorElNombre(a2, b2, 'Dos B', 72)

    const resultado = await fusionarDuplicados(admin, [seguro, dudoso, 'no-existe'])

    expect(resultado.hechos).toBe(1)
    expect(resultado.omitidos).toHaveLength(2)
    expect(resultado.omitidos.map((o) => o.motivo).join(' ')).toMatch(/72/)
    expect(resultado.omitidos.map((o) => o.motivo).join(' ')).toMatch(/ya no existe/i)
  })

  it('sin permiso para gestionar influencers, no fusiona nada', async () => {
    const a = await crearInfluencer('Vera Luz', 'veraluz')
    const b = await crearInfluencer('Vera Luz', 'vera.luz')
    const par = await parPorLaMismaCuenta(a, b, 'vera.luz')

    const finanzas = await contextFor((await createUser({ agencyRole: 'FINANCE' })).id)
    await expect(fusionarDuplicados(finanzas, [par])).rejects.toThrow()
  })

  /*
   * El puente entre los dos lados. El detector escribe el motivo y la fusión lo
   * lee: si alguien cambia el texto de un lado, esto se rompe acá --en un test--
   * y no en la base de un cliente, fusionando gente distinta en silencio.
   */
  it('lo que el detector marca como misma cuenta es lo que el lote se anima a fusionar', async () => {
    const original = await crearInfluencer('Nico Ruiz', 'nicoruiz')
    // Otra ficha con EL MISMO perfil: es la misma cuenta cargada dos veces.
    const copia = await withSystemScope(async (tx) => {
      const creado = await tx.influencer.create({ data: { displayName: 'Nicolás Ruiz' } })
      await tx.socialProfile.create({
        data: {
          influencerId: creado.id,
          platform: 'INSTAGRAM',
          url: 'https://www.instagram.com/nicoruiz',
          urlNormalized: 'instagram.com/nicoruiz',
          handle: 'nicoruiz',
          isPrimary: true,
        },
      })
      return creado.id
    })

    await withSystemScope((tx) => detectDuplicates(tx, copia))

    const par = await withSystemScope((tx) =>
      tx.influencerDuplicate.findFirst({
        where: { OR: [{ influencerAId: copia }, { influencerBId: copia }] },
        select: { id: true, reason: true },
      }),
    )
    expect(par).not.toBeNull()
    // El detector lo describió como identidad...
    expect(claseDeParecido(par!.reason)).toBe('IDENTIDAD')
    // ...y por eso el lote lo resuelve solo.
    const resultado = await fusionarDuplicados(admin, [par!.id])
    expect(resultado.hechos).toBe(1)
    expect(resultado.omitidos).toEqual([])
    expect(original).toBeTruthy()
  })
})
