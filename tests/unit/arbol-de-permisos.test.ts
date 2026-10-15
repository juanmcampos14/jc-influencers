import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ARBOL_DE_PERMISOS,
  capacidadesDelArbol,
  claveDeAccion,
  claveDeNodo,
  claveDeSeccion,
  conDependencias,
} from '@/lib/authz/arbol'
import {
  AGENCY_ROLE_CAPABILITIES,
  AGENCY_ROLES,
  claveDeRol,
  CLIENT_ROLES,
  CAPABILITIES,
  CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE,
  GRANTABLE_CLIENT_EXTRAS,
  repartirPermisos,
  type Capability,
} from '@/lib/authz/capabilities'

/**
 * El árbol es una VISTA de las capacidades, no una puerta: la autorización
 * sigue preguntando por capacidades. Lo que estos tests cuidan es que la vista
 * no mienta ni esconda.
 */

describe('el árbol muestra todo lo que hay para repartir', () => {
  /*
   * Si alguien agrega una capacidad y no la pone en el árbol, queda invisible
   * para quien reparte accesos: existe, hace algo, y nadie puede darla ni
   * quitarla desde la pantalla. Este test es para que ese olvido se vea acá.
   */
  it('ninguna capacidad queda fuera, salvo las que no son de producto', () => {
    const enElArbol = new Set(capacidadesDelArbol())
    /*
     * `platform.admin` es administración técnica de la plataforma, no un
     * permiso del producto: no se reparte desde esta pantalla.
     */
    const noSonDeProducto = new Set<Capability>(['platform.admin'])

    const faltantes = CAPABILITIES.filter((cap) => !enElArbol.has(cap) && !noSonDeProducto.has(cap))
    expect(faltantes, `sin lugar en el árbol: ${faltantes.join(', ')}`).toEqual([])
  })

  it('no inventa capacidades que no existen', () => {
    const reales = new Set<string>(CAPABILITIES)
    for (const cap of capacidadesDelArbol()) expect(reales.has(cap)).toBe(true)
  })

  it('no repite una capacidad en dos lugares', () => {
    const todas = capacidadesDelArbol()
    expect(new Set(todas).size).toBe(todas.length)
  })

  it('cada nodo ofrece al menos un casillero', () => {
    for (const seccion of ARBOL_DE_PERMISOS) {
      for (const nodo of seccion.nodos) {
        const tiene = Boolean(nodo.ver || nodo.editar || (nodo.acciones ?? []).length > 0)
        expect(tiene, `${seccion.clave}/${nodo.clave} no ofrece nada`).toBe(true)
      }
    }
  })
})

describe('editar implica ver', () => {
  it('marcar editar marca también ver', () => {
    const resultado = conDependencias(new Set<Capability>(['budget.manage']))
    expect(resultado.has('budget.view')).toBe(true)
  })

  /*
   * "Aprobar candidatos" sin "ver candidatos" es una pantalla vacía con un
   * botón. La dependencia se resuelve en un lugar, no en cada casillero.
   */
  it('una acción también arrastra el ver de su nodo', () => {
    const resultado = conDependencias(new Set<Capability>(['candidate.approve']))
    expect(resultado.has('candidate.view')).toBe(true)
  })

  it('no agrega nada cuando no hace falta', () => {
    const resultado = conDependencias(new Set<Capability>(['campaign.view']))
    expect([...resultado]).toEqual(['campaign.view'])
  })
})

describe('repartir en sumadas y quitadas', () => {
  const todas = new Set<Capability>(CAPABILITIES)
  const account = AGENCY_ROLE_CAPABILITIES.ACCOUNT_MANAGER

  it('lo que el rol ya da no se guarda como extra', () => {
    const { extras } = repartirPermisos(new Set(account), account, { lado: 'AGENCY', propias: todas })
    expect(extras).toEqual([])
  })

  /*
   * El caso que motivó todo: un account manager que no tiene que ver la plata.
   * Antes había que inventarle un rol.
   */
  it('desmarcar algo del rol lo guarda como quitado', () => {
    const sinPlata = new Set(account.filter((c) => c !== 'budget.view'))
    const { quitadas, extras } = repartirPermisos(sinPlata, account, { lado: 'AGENCY', propias: todas })
    expect(quitadas).toEqual(['budget.view'])
    expect(extras).toEqual([])
  })

  it('marcar algo que el rol no da lo guarda como sumado', () => {
    const conAuditoria = new Set<Capability>([...account, 'audit.view'])
    const { extras } = repartirPermisos(conAuditoria, account, { lado: 'AGENCY', propias: todas })
    expect(extras).toEqual(['audit.view'])
  })

  /*
   * El cerrojo principal: nadie reparte lo que no tiene. Se comprueba en el
   * servidor, no en la pantalla.
   */
  it('nadie otorga una capacidad que no tiene', () => {
    const quienReparte = new Set<Capability>(['campaign.view', 'membership.manage'])
    const { extras } = repartirPermisos(new Set<Capability>(['audit.view']), [], {
      lado: 'AGENCY',
      propias: quienReparte,
    })
    expect(extras).toEqual([])
  })

  it('a un usuario de cliente no se le suma lo prohibido, se marque lo que se marque', () => {
    const prohibida = [...CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE][0]!
    const { extras } = repartirPermisos(new Set<Capability>([prohibida, 'export.create']), [], {
      lado: 'CLIENT',
      propias: todas,
      otorgablesDeCliente: GRANTABLE_CLIENT_EXTRAS,
    })
    expect(extras).not.toContain(prohibida)
    expect(extras).toEqual(['export.create'])
  })

  /*
   * Quitar nunca es un riesgo, así que no se restringe: alguien con permiso
   * para repartir accesos puede sacarle a otro algo que él mismo no tiene.
   */
  it('quitar no pide tener la capacidad', () => {
    const { quitadas } = repartirPermisos(new Set(), ['audit.view'], {
      lado: 'AGENCY',
      propias: new Set<Capability>(['campaign.view']),
    })
    expect(quitadas).toEqual(['audit.view'])
  })
})

/**
 * El árbol es una vista para una persona, y desde que el producto habla dos
 * idiomas "tiene nombre" significa que lo tiene en los dos. Faltando uno, la
 * pantalla de accesos muestra `nodo_plata` donde debería decir qué permiso es.
 */
describe('el árbol tiene texto en los dos idiomas', () => {
  const mensajes = (idioma: string): Record<string, string> =>
    JSON.parse(readFileSync(new URL(`../../messages/${idioma}.json`, import.meta.url), 'utf8')).permisos

  for (const idioma of ['es', 'en'] as const) {
    it(`cada sección, nodo y acción tiene su nombre en ${idioma}`, () => {
      const textos = mensajes(idioma)
      const faltan: string[] = []
      const exigir = (clave: string): void => {
        if (!(clave in textos)) faltan.push(clave)
      }
      for (const seccion of ARBOL_DE_PERMISOS) {
        exigir(claveDeSeccion(seccion.clave))
        if (seccion.conAyuda) exigir(`${claveDeSeccion(seccion.clave)}Ayuda`)
        for (const nodo of seccion.nodos) {
          exigir(claveDeNodo(nodo.clave))
          if (nodo.conAyuda) exigir(`${claveDeNodo(nodo.clave)}Ayuda`)
          for (const accion of nodo.acciones ?? []) {
            exigir(claveDeAccion(accion.clave))
            if (accion.conAyuda) exigir(`${claveDeAccion(accion.clave)}Ayuda`)
          }
        }
      }
      expect(faltan, `faltan textos en ${idioma}: ${faltan.join(', ')}`).toEqual([])
    })

    it(`cada rol tiene su nombre en ${idioma}`, () => {
      const textos = mensajes(idioma)
      const sinNombre = [...AGENCY_ROLES, ...CLIENT_ROLES].filter((rol) => !(claveDeRol(rol) in textos))
      expect(sinNombre, `faltan textos en ${idioma}: ${sinNombre.join(', ')}`).toEqual([])
    })
  }
})
