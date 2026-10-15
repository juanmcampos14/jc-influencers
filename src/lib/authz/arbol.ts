import type { Capability } from './capabilities'

/**
 * El árbol de permisos, como lo ve una persona.
 *
 * Las capacidades (`capabilities.ts`) son el idioma del código: `budget.manage`,
 * `candidate.approve`. Sirven para autorizar, no para decidir. Quien invita a
 * alguien no piensa en capacidades: piensa en "que vea Campañas pero no la
 * plata", y con una lista plana de treinta casilleros tiene que traducir eso a
 * mano y equivocarse.
 *
 * Este archivo es esa traducción, y es lo único que hace: agrupa las
 * capacidades por la sección y la pestaña donde se usan de verdad, y separa
 * **ver** de **editar**, que es la distinción que a nadie hace falta explicarle.
 *
 * No decide nada. La autorización sigue preguntando por capacidades: si un nodo
 * de acá desapareciera, no se abriría ni un permiso. Es una vista, no una
 * puerta.
 *
 * Regla para mantenerlo: **una capacidad nueva se agrega acá o queda invisible
 * para quien reparte accesos.** Hay un test que lo verifica.
 */

export type NodoDePermiso = {
  /** Identifica el nodo y arma su clave de traducción: `nodo_<clave>`. */
  clave: string
  /** Si además tiene texto de ayuda, en `nodo_<clave>Ayuda`. */
  conAyuda?: boolean
  /** La capacidad de mirar. Sin ella, la sección no aparece. */
  ver?: Capability
  /** La capacidad de cambiar cosas. Implica poder verlas. */
  editar?: Capability
  /** Capacidades sueltas que no son ni ver ni editar, con nombre propio. */
  acciones?: Array<{ clave: Capability; conAyuda?: boolean }>
  hijos?: NodoDePermiso[]
}

export type SeccionDePermisos = {
  clave: string
  conAyuda?: boolean
  nodos: NodoDePermiso[]
}

/*
 * Las claves de traducción del árbol.
 *
 * El texto vivía escrito en este archivo --"Presupuesto y pagos", "Lo acordado,
 * lo pagado y lo que falta"-- y en inglés la pantalla de permisos seguía
 * enteramente en castellano. Acá queda la estructura; el texto, en
 * `messages/*.json` bajo `permisos`.
 */
export const claveDeSeccion = (clave: string): string => `seccion_${clave}`
export const claveDeNodo = (clave: string): string => `nodo_${clave}`
export const claveDeAccion = (capacidad: string): string => `accion_${capacidad.replace(/[.-]/g, '_')}`

/**
 * El árbol.
 *
 * El orden sigue al del menú, no al alfabético: quien reparte accesos está
 * mirando la aplicación mientras decide.
 */
export const ARBOL_DE_PERMISOS: readonly SeccionDePermisos[] = [
  {
    clave: 'clientes',
    conAyuda: true,
    nodos: [
      {
        clave: 'clientes',
        ver: 'client.view',
        editar: 'client.manage',
      },
      {
        clave: 'marca',
        conAyuda: true,
        editar: 'brand.manage',
      },
    ],
  },
  {
    clave: 'campanas',
    nodos: [
      {
        clave: 'campanas',
        ver: 'campaign.view',
        editar: 'campaign.update',
        acciones: [
          { clave: 'campaign.create' },
          { clave: 'campaign.delete' },
        ],
      },
      {
        clave: 'brief',
        conAyuda: true,
        ver: 'brief.view',
        editar: 'brief.manage',
      },
      {
        clave: 'candidatos',
        conAyuda: true,
        ver: 'candidate.view',
        editar: 'candidate.manage',
        acciones: [
          {
            clave: 'candidate.approve',
            conAyuda: true,
          },
        ],
      },
      {
        clave: 'plata',
        conAyuda: true,
        ver: 'budget.view',
        editar: 'budget.manage',
      },
      {
        clave: 'comentarios',
        acciones: [
          { clave: 'feedback.create', conAyuda: true },
          {
            clave: 'feedback.internal.create',
            conAyuda: true,
          },
          {
            clave: 'internal_notes.view',
            conAyuda: true,
          },
        ],
      },
    ],
  },
  {
    clave: 'influencers',
    nodos: [
      {
        clave: 'padron',
        conAyuda: true,
        ver: 'influencer.view',
        editar: 'influencer.manage',
      },
      {
        clave: 'contacto',
        conAyuda: true,
        ver: 'influencer.contact.view',
      },
      {
        clave: 'buscar',
        conAyuda: true,
        acciones: [
          { clave: 'scouting.run' },
          {
            clave: 'scouting.budget.manage',
            conAyuda: true,
          },
        ],
      },
      {
        clave: 'importacion',
        conAyuda: true,
        acciones: [{ clave: 'import.run' }],
      },
    ],
  },
  {
    clave: 'ia',
    conAyuda: true,
    nodos: [
      {
        clave: 'ia',
        ver: 'ai.view',
        acciones: [{ clave: 'ai.run' }],
      },
    ],
  },
  {
    clave: 'administracion',
    nodos: [
      {
        clave: 'usuarios',
        acciones: [
          { clave: 'user.invite' },
          {
            clave: 'membership.manage',
            conAyuda: true,
          },
        ],
      },
      {
        clave: 'auditoria',
        conAyuda: true,
        ver: 'audit.view',
      },
      {
        clave: 'exportar',
        conAyuda: true,
        acciones: [{ clave: 'export.create' }],
      },
      {
        clave: 'catalogos',
        conAyuda: true,
        editar: 'catalog.manage',
      },
    ],
  },
]

/** Todas las capacidades que el árbol muestra, en orden. */
export function capacidadesDelArbol(): Capability[] {
  const vistas: Capability[] = []
  const recorrer = (nodos: readonly NodoDePermiso[]): void => {
    for (const nodo of nodos) {
      if (nodo.ver) vistas.push(nodo.ver)
      if (nodo.editar) vistas.push(nodo.editar)
      for (const accion of nodo.acciones ?? []) vistas.push(accion.clave)
      if (nodo.hijos) recorrer(nodo.hijos)
    }
  }
  for (const seccion of ARBOL_DE_PERMISOS) recorrer(seccion.nodos)
  return vistas
}

/**
 * Editar implica ver.
 *
 * Nadie entiende un permiso que deja cambiar algo que no se puede mirar, y en
 * la práctica la pantalla ni siquiera se abre. Así que marcar "editar" marca
 * "ver", y desmarcar "ver" desmarca "editar". Se resuelve acá, en un solo
 * lugar, y no en cada casillero de la pantalla.
 */
export function conDependencias(elegidas: ReadonlySet<Capability>): Set<Capability> {
  const resultado = new Set(elegidas)
  const recorrer = (nodos: readonly NodoDePermiso[]): void => {
    for (const nodo of nodos) {
      if (nodo.ver && nodo.editar && resultado.has(nodo.editar)) resultado.add(nodo.ver)
      /*
       * Una acción sobre algo que no se puede ver tampoco tiene sentido:
       * "aprobar candidatos" sin "ver candidatos" es una pantalla vacía con un
       * botón.
       */
      if (nodo.ver) {
        for (const accion of nodo.acciones ?? []) {
          if (resultado.has(accion.clave)) resultado.add(nodo.ver)
        }
      }
      if (nodo.hijos) recorrer(nodo.hijos)
    }
  }
  for (const seccion of ARBOL_DE_PERMISOS) recorrer(seccion.nodos)
  return resultado
}
