import { beforeEach, describe, expect, it } from 'vitest'
import { getVistaPreferida, resolverVista, setVistaPreferida } from '@/lib/repos/view-prefs'
import { withSystemScope } from '@/lib/db/scope'
import { contextFor, createClientTenant, createUser, resetDatabase, seedCatalogs } from '../helpers/fixtures'
import type { AuthContext } from '@/lib/authz/context'

describe('Preferencia de vista del portal', () => {
  let clienteA: string
  let clienteB: string
  let cuenta: AuthContext

  beforeEach(async () => {
    await resetDatabase()
    await seedCatalogs()
    clienteA = (await createClientTenant('Marca A')).id
    clienteB = (await createClientTenant('Marca B')).id
    cuenta = await contextFor(
      (await createUser({ agencyRole: 'ACCOUNT_MANAGER', agencyClientIds: [clienteA, clienteB] })).id,
    )
  })

  it('guarda y devuelve lo elegido', async () => {
    await setVistaPreferida(cuenta, clienteA, 'bandeja')
    expect(await getVistaPreferida(cuenta, clienteA)).toBe('bandeja')

    await setVistaPreferida(cuenta, clienteA, 'conjunto')
    expect(await getVistaPreferida(cuenta, clienteA)).toBe('conjunto')
  })

  it('la preferencia de un cliente NO pisa la del otro', async () => {
    /*
     * Este es el test que importa. La unique de SavedView es
     * (userId, resource, name) y no incluye clientId: con un `name` fijo,
     * guardar la preferencia de la marca B sobrescribiría la de la marca A y
     * quien trabaja con las dos perdería una sin entender por qué.
     */
    await setVistaPreferida(cuenta, clienteA, 'bandeja')
    await setVistaPreferida(cuenta, clienteB, 'conjunto')

    expect(await getVistaPreferida(cuenta, clienteA)).toBe('bandeja')
    expect(await getVistaPreferida(cuenta, clienteB)).toBe('conjunto')

    const filas = await withSystemScope((tx) => tx.savedView.findMany({ where: { userId: cuenta.user.id } }))
    expect(filas).toHaveLength(2)
  })

  it('nadie lee la preferencia de otra persona', async () => {
    await setVistaPreferida(cuenta, clienteA, 'bandeja')
    const otra = await contextFor(
      (await createUser({ agencyRole: 'ACCOUNT_MANAGER', agencyClientIds: [clienteA] })).id,
    )
    expect(await getVistaPreferida(otra, clienteA)).toBeNull()
  })

  it('un cliente fuera de alcance ni se consulta', async () => {
    const ajeno = (await createClientTenant('Marca ajena')).id
    await expect(getVistaPreferida(cuenta, ajeno)).rejects.toThrow()
  })

  it('config con basura vieja devuelve null en vez de romper', async () => {
    await withSystemScope((tx) =>
      tx.savedView.create({
        data: {
          userId: cuenta.user.id,
          clientId: clienteA,
          resource: 'campaign_view',
          name: clienteA,
          config: { vista: 'kanban-de-2019' },
        },
      }),
    )
    expect(await getVistaPreferida(cuenta, clienteA)).toBeNull()
  })
})

describe('resolverVista', () => {
  it('lo pedido en la URL manda sobre todo', () => {
    expect(resolverVista({ pedida: 'conjunto', preferida: 'bandeja', esperando: 90 })).toBe('conjunto')
  })

  it('sin URL, gana la preferencia guardada', () => {
    expect(resolverVista({ pedida: undefined, preferida: 'bandeja', esperando: 2 })).toBe('bandeja')
  })

  it('sin preferencia, decide el tamaño de la cola', () => {
    expect(resolverVista({ pedida: undefined, preferida: null, esperando: 25 })).toBe('bandeja')
    expect(resolverVista({ pedida: undefined, preferida: null, esperando: 3 })).toBe('conjunto')
  })

  it('una vista inventada en la URL no se usa', () => {
    expect(resolverVista({ pedida: 'grilla', preferida: null, esperando: 3 })).toBe('conjunto')
  })
})
