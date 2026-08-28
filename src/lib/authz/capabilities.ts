import type { AgencyRole, ClientRole } from '@/generated/prisma/enums'

/**
 * Capacidades explícitas. La autorización se hace SIEMPRE preguntando por una
 * capacidad, nunca comparando roles sueltos repartidos por el código.
 */
export const CAPABILITIES = [
  'platform.admin',
  'client.view',
  'client.manage',
  'campaign.view',
  'campaign.create',
  'campaign.update',
  'campaign.delete',
  'brief.view',
  'brief.manage',
  'influencer.view',
  'influencer.manage',
  'influencer.contact.view',
  'candidate.view',
  'candidate.manage',
  'candidate.approve',
  'feedback.create',
  'feedback.internal.create',
  'internal_notes.view',
  'budget.view',
  'budget.manage',
  'user.invite',
  'membership.manage',
  'audit.view',
  'export.create',
  'import.run',
  'catalog.manage',
  'brand.manage',
  'scouting.run',
  'scouting.budget.manage',
  'ai.run',
  'ai.view',
] as const

export type Capability = (typeof CAPABILITIES)[number]

const CAPABILITY_SET = new Set<string>(CAPABILITIES)
export const isCapability = (value: string): value is Capability => CAPABILITY_SET.has(value)

export const CAPABILITY_LABELS: Record<Capability, string> = {
  'platform.admin': 'Administración técnica de plataforma',
  'client.view': 'Ver clientes',
  'client.manage': 'Administrar clientes',
  'campaign.view': 'Ver campañas',
  'campaign.create': 'Crear campañas',
  'campaign.update': 'Editar campañas',
  'campaign.delete': 'Archivar/eliminar campañas',
  'brief.view': 'Ver brief',
  'brief.manage': 'Editar brief y criterios',
  'influencer.view': 'Ver base de influencers',
  'influencer.manage': 'Crear y editar influencers',
  'influencer.contact.view': 'Ver datos de contacto de influencers',
  'candidate.view': 'Ver candidaturas',
  'candidate.manage': 'Gestionar candidaturas y estados',
  'candidate.approve': 'Aprobar, rechazar o pedir revisión',
  'feedback.create': 'Dejar feedback',
  'feedback.internal.create': 'Escribir notas internas',
  'internal_notes.view': 'Ver notas internas',
  'budget.view': 'Ver presupuestos y cachés',
  'budget.manage': 'Editar presupuestos y cachés',
  'user.invite': 'Invitar usuarios',
  'membership.manage': 'Asignar roles y clientes',
  'audit.view': 'Ver auditoría',
  'export.create': 'Generar exportaciones',
  'import.run': 'Ejecutar importaciones',
  'catalog.manage': 'Administrar catálogos y configuración',
  'brand.manage': 'Configurar la identidad visual de un cliente',
  'scouting.run': 'Ejecutar scouting con el proveedor externo (tiene costo)',
  'scouting.budget.manage': 'Fijar el tope de gasto de scouting',
  'ai.run': 'Generar análisis con IA (tiene costo)',
  'ai.view': 'Ver análisis generados con IA',
}

/**
 * Capacidades que un usuario de cliente NUNCA puede tener, se las intente dar
 * quien se las intente dar. Es el cerrojo contra la escalada de privilegios.
 */
export const CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE: ReadonlySet<Capability> = new Set([
  'platform.admin',
  'client.manage',
  'campaign.create',
  'campaign.update',
  'campaign.delete',
  'brief.manage',
  'influencer.view',
  'influencer.manage',
  'influencer.contact.view',
  'candidate.manage',
  'feedback.internal.create',
  'internal_notes.view',
  'budget.view',
  'budget.manage',
  'audit.view',
  'import.run',
  'catalog.manage',
  'brand.manage',
  // Scouting e IA se pagan por uso. Que sólo la agencia pueda dispararlos es lo
  // que evita que un cliente genere un gasto que después hay que explicar.
  'scouting.run',
  'scouting.budget.manage',
  'ai.run',
])

const AGENCY_ADMIN_CAPS: Capability[] = CAPABILITIES.filter((c) => c !== 'platform.admin')

export const AGENCY_ROLE_CAPABILITIES: Record<AgencyRole, readonly Capability[]> = {
  PLATFORM_SUPERADMIN: CAPABILITIES,
  AGENCY_ADMIN: AGENCY_ADMIN_CAPS,
  ACCOUNT_MANAGER: [
    'client.view',
    'campaign.view',
    'campaign.create',
    'campaign.update',
    'brief.view',
    'brief.manage',
    'influencer.view',
    'influencer.manage',
    'influencer.contact.view',
    'candidate.view',
    'candidate.manage',
    'feedback.create',
    'feedback.internal.create',
    'internal_notes.view',
    'budget.view',
    'export.create',
    'import.run',
    'brand.manage',
    'scouting.run',
    'ai.run',
    'ai.view',
  ],
  SCOUT: [
    'client.view',
    'campaign.view',
    'brief.view',
    'influencer.view',
    'influencer.manage',
    'candidate.view',
    'candidate.manage',
    'feedback.internal.create',
    'internal_notes.view',
    'export.create',
    'scouting.run',
    'ai.run',
    'ai.view',
  ],
  FINANCE: [
    'client.view',
    'campaign.view',
    'brief.view',
    'influencer.view',
    'candidate.view',
    'internal_notes.view',
    'budget.view',
    'budget.manage',
    'export.create',
    'scouting.budget.manage',
    'ai.view',
  ],
}

export const CLIENT_ROLE_CAPABILITIES: Record<ClientRole, readonly Capability[]> = {
  CLIENT_ADMIN: [
    'client.view',
    'campaign.view',
    'brief.view',
    'candidate.view',
    'candidate.approve',
    'feedback.create',
    'export.create',
    'membership.manage',
    'ai.view',
  ],
  CLIENT_REVIEWER: [
    'client.view',
    'campaign.view',
    'brief.view',
    'candidate.view',
    'candidate.approve',
    'feedback.create',
    'export.create',
    'ai.view',
  ],
  // Sólo lectura, incluida la exportación de lo que ya puede ver en pantalla.
  CLIENT_VIEWER: ['client.view', 'campaign.view', 'brief.view', 'candidate.view', 'export.create', 'ai.view'],
}

export const AGENCY_ROLE_LABELS: Record<AgencyRole, string> = {
  PLATFORM_SUPERADMIN: 'Superadministrador de plataforma',
  AGENCY_ADMIN: 'Administrador de agencia',
  ACCOUNT_MANAGER: 'Account manager',
  SCOUT: 'Scouting / colaborador',
  FINANCE: 'Finanzas',
}

export const CLIENT_ROLE_LABELS: Record<ClientRole, string> = {
  CLIENT_ADMIN: 'Administrador del cliente',
  CLIENT_REVIEWER: 'Revisor del cliente',
  CLIENT_VIEWER: 'Lector del cliente',
}

/** Capacidades que un rol de agencia puede recibir como permiso extra puntual. */
export const GRANTABLE_AGENCY_EXTRAS: readonly Capability[] = [
  'user.invite',
  'membership.manage',
  'budget.view',
  'budget.manage',
  'audit.view',
  'influencer.contact.view',
  'import.run',
  'brand.manage',
  'scouting.run',
  'scouting.budget.manage',
  'ai.run',
]

/** Capacidades extra que un usuario de cliente sí puede recibir. */
export const GRANTABLE_CLIENT_EXTRAS: readonly Capability[] = ['user.invite', 'export.create']

/**
 * Etiqueta de una capacidad cuando la clave viene como texto suelto.
 *
 * La pantalla de usuarios imprimía la clave cruda -- `budget.view`,
 * `internal_notes.view` -- al lado de las etiquetas bien escritas del diálogo
 * de invitación. Es jerga interna en una pantalla de producto.
 */
export const capabilityLabel = (key: string): string =>
  (CAPABILITY_LABELS as Record<string, string>)[key] ?? key

/**
 * Traduce lo que se marcó en el árbol a lo que guarda la base.
 *
 * La pantalla piensa en "todo lo que esta persona va a poder hacer". La base
 * guarda dos listas: lo sumado por encima del rol y lo quitado a pesar de él.
 * Guardar el conjunto entero sería más simple y peor: si mañana cambia lo que
 * da un rol, quien lo tenga no se entera nunca.
 *
 * Dos cerrojos que no dependen de la pantalla:
 *
 * - **Nadie otorga lo que no tiene.** Se comprueba contra las capacidades de
 *   quien está repartiendo.
 * - **Un usuario de cliente no recibe lo prohibido**, se marque lo que se
 *   marque.
 *
 * Quitar, en cambio, no se restringe: sacar un permiso nunca es un riesgo.
 */
export function repartirPermisos(
  concedidas: ReadonlySet<Capability>,
  delRol: readonly Capability[],
  opciones: {
    lado: 'AGENCY' | 'CLIENT'
    /** Lo que puede otorgar quien está repartiendo. */
    propias: ReadonlySet<Capability>
    /** Para el lado cliente, la lista corta de lo que se puede sumar. */
    otorgablesDeCliente?: readonly Capability[]
  },
): { extras: Capability[]; quitadas: Capability[] } {
  const base = new Set<Capability>(delRol)
  const otorgablesCliente = new Set<Capability>(opciones.otorgablesDeCliente ?? [])

  const extras: Capability[] = []
  for (const cap of concedidas) {
    if (base.has(cap)) continue
    if (!opciones.propias.has(cap)) continue
    if (opciones.lado === 'CLIENT') {
      if (CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE.has(cap)) continue
      if (!otorgablesCliente.has(cap)) continue
    }
    extras.push(cap)
  }

  const quitadas: Capability[] = []
  for (const cap of base) {
    if (!concedidas.has(cap)) quitadas.push(cap)
  }

  return { extras, quitadas }
}
