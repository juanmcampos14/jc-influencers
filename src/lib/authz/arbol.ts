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
  clave: string
  etiqueta: string
  /** Qué significa en la práctica, para el que no conoce el producto. */
  ayuda?: string
  /** La capacidad de mirar. Sin ella, la sección no aparece. */
  ver?: Capability
  /** La capacidad de cambiar cosas. Implica poder verlas. */
  editar?: Capability
  /** Capacidades sueltas que no son ni ver ni editar, con nombre propio. */
  acciones?: Array<{ clave: Capability; etiqueta: string; ayuda?: string }>
  hijos?: NodoDePermiso[]
}

export type SeccionDePermisos = {
  clave: string
  etiqueta: string
  ayuda?: string
  nodos: NodoDePermiso[]
}

/**
 * El árbol.
 *
 * El orden sigue al del menú, no al alfabético: quien reparte accesos está
 * mirando la aplicación mientras decide.
 */
export const ARBOL_DE_PERMISOS: readonly SeccionDePermisos[] = [
  {
    clave: 'clientes',
    etiqueta: 'Clientes',
    ayuda: 'Las marcas para las que trabaja la agencia.',
    nodos: [
      {
        clave: 'clientes',
        etiqueta: 'Clientes',
        ver: 'client.view',
        editar: 'client.manage',
      },
      {
        clave: 'marca',
        etiqueta: 'Identidad visual',
        ayuda: 'Logo, colores y fondo del espacio de cada cliente.',
        editar: 'brand.manage',
      },
    ],
  },
  {
    clave: 'campanas',
    etiqueta: 'Campañas',
    nodos: [
      {
        clave: 'campanas',
        etiqueta: 'Campañas',
        ver: 'campaign.view',
        editar: 'campaign.update',
        acciones: [
          { clave: 'campaign.create', etiqueta: 'Crear campañas' },
          { clave: 'campaign.delete', etiqueta: 'Archivar o eliminar campañas' },
        ],
      },
      {
        clave: 'brief',
        etiqueta: 'Brief',
        ayuda: 'Objetivo, público y criterios de la campaña.',
        ver: 'brief.view',
        editar: 'brief.manage',
      },
      {
        clave: 'candidatos',
        etiqueta: 'Influencers de la campaña',
        ayuda: 'Las propuestas y su estado: contactado, confirmado, publicado.',
        ver: 'candidate.view',
        editar: 'candidate.manage',
        acciones: [
          {
            clave: 'candidate.approve',
            etiqueta: 'Aprobar o rechazar',
            ayuda: 'Es lo que hace el cliente con lo que le proponemos.',
          },
        ],
      },
      {
        clave: 'plata',
        etiqueta: 'Presupuesto y pagos',
        ayuda: 'Lo acordado, lo pagado y lo que falta.',
        ver: 'budget.view',
        editar: 'budget.manage',
      },
      {
        clave: 'comentarios',
        etiqueta: 'Comentarios',
        acciones: [
          { clave: 'feedback.create', etiqueta: 'Comentar', ayuda: 'Lo ve el cliente.' },
          {
            clave: 'feedback.internal.create',
            etiqueta: 'Comentar en interno',
            ayuda: 'Sólo entre gente de la agencia.',
          },
          {
            clave: 'internal_notes.view',
            etiqueta: 'Ver notas internas',
            ayuda: 'Nunca llegan a un usuario de cliente, se dé el permiso que se dé.',
          },
        ],
      },
    ],
  },
  {
    clave: 'influencers',
    etiqueta: 'Influencers',
    nodos: [
      {
        clave: 'padron',
        etiqueta: 'Padrón',
        ayuda: 'La gente que ya incorporamos.',
        ver: 'influencer.view',
        editar: 'influencer.manage',
      },
      {
        clave: 'contacto',
        etiqueta: 'Datos de contacto',
        ayuda: 'Mail y teléfono de los influencers.',
        ver: 'influencer.contact.view',
      },
      {
        clave: 'buscar',
        etiqueta: 'Buscar y Descubiertos',
        ayuda: 'Salir a buscar gente nueva con un proveedor. Cuesta plata por búsqueda.',
        acciones: [
          { clave: 'scouting.run', etiqueta: 'Ejecutar búsquedas' },
          {
            clave: 'scouting.budget.manage',
            etiqueta: 'Cambiar el tope de gasto',
            ayuda: 'Quien lo tenga puede subir el límite mensual.',
          },
        ],
      },
      {
        clave: 'importacion',
        etiqueta: 'Importación',
        ayuda: 'Cargar influencers desde una planilla.',
        acciones: [{ clave: 'import.run', etiqueta: 'Importar planillas' }],
      },
    ],
  },
  {
    clave: 'ia',
    etiqueta: 'Inteligencia artificial',
    ayuda: 'Análisis y sugerencias. Generarlas cuesta plata; verlas no.',
    nodos: [
      {
        clave: 'ia',
        etiqueta: 'Análisis con IA',
        ver: 'ai.view',
        acciones: [{ clave: 'ai.run', etiqueta: 'Generar análisis nuevos' }],
      },
    ],
  },
  {
    clave: 'administracion',
    etiqueta: 'Administración',
    nodos: [
      {
        clave: 'usuarios',
        etiqueta: 'Usuarios',
        acciones: [
          { clave: 'user.invite', etiqueta: 'Invitar gente' },
          {
            clave: 'membership.manage',
            etiqueta: 'Cambiar accesos',
            ayuda: 'Quien lo tenga puede repartir permisos, incluidos los suyos.',
          },
        ],
      },
      {
        clave: 'auditoria',
        etiqueta: 'Auditoría',
        ayuda: 'El registro de quién hizo qué.',
        ver: 'audit.view',
      },
      {
        clave: 'exportar',
        etiqueta: 'Exportar',
        ayuda: 'Bajar a planilla lo que ya se puede ver en pantalla.',
        acciones: [{ clave: 'export.create', etiqueta: 'Exportar' }],
      },
      {
        clave: 'catalogos',
        etiqueta: 'Catálogos',
        ayuda: 'Nichos, etiquetas y estados configurables.',
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
