import { afterEach, describe, expect, it, vi } from 'vitest'
import { InfluencersClubScoutingProvider } from '@/lib/ports/scouting-influencers-club'

/**
 * El adaptador, con la red de por medio.
 *
 * El resto de la integración se prueba en `influencers-club-consulta.test.ts`,
 * que es puro. Lo que se prueba acá es la COSTURA, porque es donde estuvo el
 * fallo: el adaptador leía el cuerpo de la respuesta sin mirar nunca el código
 * de estado, así que un rechazo salía de la corrida como si la búsqueda se
 * hubiera hecho y no hubiera encontrado a nadie.
 *
 * Las respuestas son literales, pedidas a la API el 02/11/2026.
 */

const proveedor = new InfluencersClubScoutingProvider({ apiKey: 'de-prueba', costoPorCreditoUsd: 0.23 })

function responderCon(status: number, cuerpo: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

async function correr() {
  const job = await proveedor.startDiscover({ platform: 'INSTAGRAM', keywords: ['moda'], limit: 10 })
  return proveedor.poll(job)
}

afterEach(() => vi.restoreAllMocks())

describe('un rechazo de influencers.club llega a la corrida como rechazo', () => {
  /*
   * El caso real: Juan contrató un plan, la clave quedó bien, y la API contesta
   * 403 porque ese plan no incluye acceso por API. Antes la corrida terminaba
   * diciendo "no devolvió resultados", que lee como "no hay nadie así".
   */
  it('un plan sin acceso a la API no se informa como una búsqueda vacía', async () => {
    responderCon(403, {
      detail: 'API access requires a Pro or Enterprise plan. Upgrade at https://dashboard.influencers.club/plans',
    })
    const progreso = await correr()
    expect(progreso.status).toBe('FAILED')
    expect(progreso.status === 'FAILED' && progreso.message).toContain('no incluye acceso por API')
    expect(progreso.status === 'FAILED' && progreso.message).not.toContain('resultado')
  })

  it('una clave revocada dice que es la clave', async () => {
    responderCon(401, { detail: 'Token is invalid', code: 'authentication_failed' })
    const progreso = await correr()
    expect(progreso.status === 'FAILED' && progreso.message).toContain('clave')
  })

  it('un filtro rechazado nombra el campo', async () => {
    responderCon(400, { error: [{ field: 'location', error: "Invalid location: 'AR'" }] })
    const progreso = await correr()
    expect(progreso.status === 'FAILED' && progreso.message).toContain('location')
  })

  /*
   * Y el que no hay que romper: cuando la búsqueda SÍ se hizo y no encontró a
   * nadie, la corrida termina bien con cero perfiles. No se cobra --cobra por
   * creador devuelto-- y la pantalla lo dice como lo que es.
   */
  it('una búsqueda que de verdad no encontró a nadie termina bien y vacía', async () => {
    responderCon(200, { accounts: [], total: 0, credits_left: '1000' })
    const progreso = await correr()
    expect(progreso.status).toBe('READY')
    expect(progreso.status === 'READY' && progreso.records).toEqual([])
  })

  it('una búsqueda con resultados los entrega', async () => {
    responderCon(200, {
      accounts: [
        {
          user_id: '1',
          profile: { username: 'alguien', full_name: 'Alguien', followers: 12_000, engagement_percent: 3.4 },
        },
      ],
      total: 1,
      credits_left: '999',
    })
    const progreso = await correr()
    expect(progreso.status).toBe('READY')
    expect(progreso.status === 'READY' && progreso.records[0]?.url).toBe('https://www.instagram.com/alguien')
  })
})
