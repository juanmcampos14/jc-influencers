import { beforeAll, describe, expect, it } from 'vitest'
import type { AuthContext } from '@/lib/authz/context'
import { resumenDePresupuesto } from '@/lib/repos/candidacies'
import { withSystemScope } from '@/lib/db/scope'
import {
  contextFor,
  createCampaignFor,
  createClientTenant,
  createInfluencerWithProfile,
  createUser,
  resetDatabase,
  seedCatalogs,
} from '../helpers/fixtures'

/**
 * Lo que suma la plata de una campaña.
 *
 * Son tres números que la gente junta en la cabeza y que no son lo mismo:
 * lo que piden, lo que se cerró y lo que el cliente aprobó. El único que se
 * puede comprometer es el último.
 */
describe('Totales de presupuesto de una campaña', () => {
  let admin: AuthContext
  let clientId: string
  let campaignId: string

  async function sumar(spec: {
    nombre: string
    currency: string
    pedido?: string | null
    cerrado?: string | null
    aprobado?: boolean
  }) {
    const influencerId = await createInfluencerWithProfile(spec.nombre, spec.nombre.toLowerCase().replace(/\s/g, '.'))
    await withSystemScope((tx) =>
      tx.candidacy.create({
        data: {
          clientId,
          campaignId,
          influencerId,
          statusKey: 'PROPUESTO',
          currency: spec.currency,
          budgetRequested: spec.pedido ?? null,
          budgetNegotiated: spec.cerrado ?? null,
          clientApproval: spec.aprobado ? 'APPROVED' : 'PENDING',
        },
      }),
    )
  }

  beforeAll(async () => {
    await resetDatabase()
    await seedCatalogs()
    clientId = (await createClientTenant('Cliente Plata')).id
    campaignId = (await createCampaignFor(clientId, 'Campaña con plata')).id
    admin = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)

    await sumar({ nombre: 'Uno Aprobado', currency: 'USD', pedido: '1000', cerrado: '800', aprobado: true })
    await sumar({ nombre: 'Dos Pendiente', currency: 'USD', pedido: '500', cerrado: null })
    // Aprobado SIN negociar: se compromete el precio de lista.
    await sumar({ nombre: 'Tres Sin Cerrar', currency: 'USD', pedido: '300', cerrado: null, aprobado: true })
    // Sin ningún número: no cuenta como un perfil con cifra.
    await sumar({ nombre: 'Cuatro Sin Numero', currency: 'USD' })
  })

  it('suma lo pedido, lo cerrado y lo aprobado por separado', async () => {
    const [usd] = await resumenDePresupuesto(admin, campaignId)
    expect(usd).toMatchObject({ currency: 'USD', pedido: 1800, cerrado: 800, perfiles: 3 })
  })

  /*
   * Aprobar sin haber negociado es aprobar el precio de lista. Contar sólo lo
   * negociado mostraría 800 donde hay 1.100 comprometidos.
   */
  it('lo aprobado toma lo cerrado, y lo pedido cuando no se negoció', async () => {
    const [usd] = await resumenDePresupuesto(admin, campaignId)
    expect(usd?.aprobado).toBe(1100)
  })

  it('un perfil sin ningún número no cuenta como perfil con cifra', async () => {
    const [usd] = await resumenDePresupuesto(admin, campaignId)
    expect(usd?.perfiles).toBe(3)
  })

  /*
   * El caso que no se puede equivocar: mezclar monedas da un número que no
   * existe, y es el tipo de cifra que alguien repite en una reunión.
   */
  it('no suma monedas distintas: devuelve una fila por cada una', async () => {
    await sumar({ nombre: 'Cinco En Pesos', currency: 'ARS', pedido: '1400000', aprobado: true })
    const totales = await resumenDePresupuesto(admin, campaignId)
    expect(totales.map((t) => t.currency).sort()).toEqual(['ARS', 'USD'])
    const ars = totales.find((t) => t.currency === 'ARS')
    expect(ars).toMatchObject({ pedido: 1_400_000, aprobado: 1_400_000, cerrado: 0 })
  })

  it('una campaña sin números no devuelve una fila en cero', async () => {
    const vacia = (await createCampaignFor(clientId, 'Campaña sin plata')).id
    expect(await resumenDePresupuesto(admin, vacia)).toEqual([])
  })

  /*
   * La plata es de la agencia. Que aparezca en una tarjeta nueva no la vuelve
   * pública: el permiso se comprueba acá adentro, no en la pantalla.
   */
  it('quien no puede ver presupuestos no obtiene los totales', async () => {
    const user = await createUser({ clientMemberships: [{ clientId, role: 'CLIENT_ADMIN' }] })
    const ctx = await contextFor(user.id)
    const error = await resumenDePresupuesto(ctx, campaignId).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
  })
})
