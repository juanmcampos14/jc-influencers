import { beforeEach, describe, expect, it } from 'vitest'
import { setShortlist } from '@/lib/repos/candidacies'
import { getBudgetState } from '@/lib/repos/scouting'
import { withSystemScope } from '@/lib/db/scope'
import { contextFor, createClientTenant, createUser, resetDatabase, seedCatalogs } from '../helpers/fixtures'
import type { AuthContext } from '@/lib/authz/context'

/**
 * Dos cosas que el producto afirmaba y no eran ciertas. Las dos se veían bien
 * en pantalla, que es lo que las hacía peligrosas.
 */
describe('Lo que la pantalla afirma tiene que ser cierto', () => {
  let admin: AuthContext
  let clienteA: string
  let clienteB: string

  beforeEach(async () => {
    await resetDatabase()
    await seedCatalogs()
    clienteA = (await createClientTenant('Alfa')).id
    clienteB = (await createClientTenant('Beta')).id
    admin = await contextFor((await createUser({ agencyRole: 'AGENCY_ADMIN' })).id)
  })

  describe('El tope de gasto es de la agencia, no del que mira', () => {
    it('un account manager ve el gasto de toda la agencia, no sólo el de sus clientes', async () => {
      // Dos corridas, una por cliente. El manager sólo tiene asignado el A.
      await withSystemScope(async (tx) => {
        for (const [clientId, costo] of [
          [clienteA, '10'],
          [clienteB, '25'],
        ] as const) {
          await tx.scoutingRun.create({
            data: {
              clientId,
              platform: 'INSTAGRAM',
              mode: 'DISCOVER',
              status: 'COMPLETED',
              provider: 'test',
              query: {},
              unitCostUsd: '0.0015',
              startedAt: new Date(),
              estimatedCostUsd: costo,
              actualCostUsd: costo,
            },
          })
        }
      })

      const manager = await contextFor(
        (await createUser({ agencyRole: 'ACCOUNT_MANAGER', agencyClientIds: [clienteA] })).id,
      )

      const estado = await getBudgetState(manager, clienteA)

      /*
       * Antes esto devolvía 10: RLS recortaba las corridas a los clientes del
       * usuario. Tres managers con clientes distintos y un tope de US$200 podían
       * gastar US$600 viendo cada uno su barra en el 20%, y el corte duro usaba
       * el mismo número, así que tampoco cortaba.
       */
      expect(estado.globalSpentUsd).toBe(35)
    })
  })

  describe('Guardar la shortlist no toca lo que no se vio', () => {
    async function candidaturaEn(campaignId: string, nombre: string, enShortlist: boolean): Promise<string> {
      return withSystemScope(async (tx) => {
        const influencer = await tx.influencer.create({ data: { displayName: nombre } })
        const candidatura = await tx.candidacy.create({
          data: {
            campaignId,
            clientId: clienteA,
            influencerId: influencer.id,
            statusKey: 'PROPUESTO',
            inShortlist: enShortlist,
            shortlistOrder: enShortlist ? 1 : null,
          },
        })
        return candidatura.id
      })
    }

    it('deja en la shortlist a quien no estaba en pantalla', async () => {
      const campana = await withSystemScope((tx) =>
        tx.campaign.create({ data: { clientId: clienteA, name: 'C', slug: `c-${Date.now()}`, currency: 'USD' } }),
      )
      const visible = await candidaturaEn(campana.id, 'Se ve', true)
      const fueraDePantalla = await candidaturaEn(campana.id, 'No se ve', true)

      // Se guarda el orden de lo que había en pantalla, que era sólo uno.
      await setShortlist(admin, campana.id, [{ candidacyId: visible, order: 1 }], [visible])

      const otro = await withSystemScope((tx) => tx.candidacy.findUnique({ where: { id: fueraDePantalla } }))
      // Antes esto quedaba en false: guardar doce perfiles sacaba a los otros
      // treinta de la shortlist, en silencio, y el aviso decía que salió bien.
      expect(otro?.inShortlist).toBe(true)
    })

    it('sí saca de la shortlist a quien estaba en pantalla y se quitó', async () => {
      const campana = await withSystemScope((tx) =>
        tx.campaign.create({ data: { clientId: clienteA, name: 'D', slug: `d-${Date.now()}`, currency: 'USD' } }),
      )
      const queda = await candidaturaEn(campana.id, 'Queda', true)
      const seSaca = await candidaturaEn(campana.id, 'Se saca', true)

      await setShortlist(admin, campana.id, [{ candidacyId: queda, order: 1 }], [queda, seSaca])

      const sacado = await withSystemScope((tx) => tx.candidacy.findUnique({ where: { id: seSaca } }))
      expect(sacado?.inShortlist).toBe(false)
    })
  })
})
