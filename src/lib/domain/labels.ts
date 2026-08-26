/**
 * Etiquetas visibles de los enums.
 *
 * Una sola fuente para todo el producto. Tenerlas repetidas hacía que la tabla
 * dijera "En reserva" y el filtro "Backlog" para el mismo valor: quien veía la
 * etiqueta no la encontraba en el desplegable.
 */

export const INFLUENCER_STATUS: Record<string, { label: string; tone: string }> = {
  NEW: { label: 'Nuevo', tone: 'sky' },
  ACTIVE: { label: 'Activo', tone: 'emerald' },
  BACKLOG: { label: 'En reserva', tone: 'slate' },
  BLOCKED: { label: 'Bloqueado', tone: 'rose' },
  ARCHIVED: { label: 'Archivado', tone: 'stone' },
}

/** Nombre de cada red tal como se escribe, no como lo guarda la base. */
export const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  LINKTREE: 'Linktree',
  WEBSITE: 'Sitio web',
  X: 'X',
  TWITCH: 'Twitch',
  FACEBOOK: 'Facebook',
  LINKEDIN: 'LinkedIn',
  OTHER: 'Otra',
}

export const platformLabel = (value: string): string =>
  PLATFORM_LABELS[value.toUpperCase()] ?? value

/** Opciones para un desplegable, en el orden en que conviene leerlas. */
export const opcionesDe = (mapa: Record<string, { label: string }>) =>
  Object.entries(mapa).map(([value, { label }]) => ({ value, label }))

/**
 * Qué pasó, en castellano.
 *
 * La auditoría mostraba la clave técnica: `candidacy.status.changed`,
 * `auth.login.failure`. Una auditoría existe para que alguien de afuera pueda
 * leerla -- un cliente, un abogado, vos dentro de seis meses -- y para eso
 * tiene que estar escrita en el idioma del producto.
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'admin.exceptional_access': 'Acceso excepcional de administrador',
  'ai.insight.created': 'Análisis de IA generado',
  'ai.insight.shared': 'Análisis compartido con el cliente',
  'auth.login.failure': 'Intento de acceso fallido',
  'auth.login.success': 'Acceso',
  'auth.logout': 'Cierre de sesión',
  'auth.password_reset.complete': 'Contraseña cambiada',
  'auth.password.changed': 'Contraseña cambiada desde la cuenta',
  'auth.password_reset.request': 'Recuperación de contraseña pedida',
  'auth.session.revoked': 'Sesión revocada',
  'brand.extracted': 'Identidad visual analizada',
  'brand.reset': 'Identidad visual restablecida',
  'brand.mural.drawn': 'Mural de marca dibujado',
  'brand.mural.removed': 'Mural de marca quitado',
  'brand.updated': 'Identidad visual actualizada',
  'brief.updated': 'Brief actualizado',
  'budget.changed': 'Presupuesto modificado',
  'campaign.created': 'Campaña creada',
  'campaign.updated': 'Campaña modificada',
  'candidacy.approval': 'Decisión del cliente sobre un perfil',
  'candidacy.created': 'Perfil agregado a una campaña',
  'candidacy.shortlist.changed': 'Shortlist modificada',
  'candidacy.status.changed': 'Cambio de estado de un perfil',
  'candidacy.updated': 'Perfil de campaña modificado',
  'candidacy.visibility': 'Visibilidad para el cliente cambiada',
  'client.created': 'Cliente creado',
  'client.updated': 'Cliente modificado',
  'comment.created': 'Comentario',
  'export.created': 'Exportación generada',
  'import.cancelled': 'Importación cancelada',
  'import.confirmed': 'Importación confirmada',
  'import.preview': 'Importación previsualizada',
  'influencer.created': 'Influencer creado',
  'influencer.deleted': 'Influencer borrado',
  'influencer.merged': 'Influencers fusionados',
  'influencer.updated': 'Influencer modificado',
  'invitation.accepted': 'Invitación aceptada',
  'invitation.created': 'Invitación enviada',
  'invitation.revoked': 'Invitación revocada',
  'membership.changed': 'Accesos modificados',
  'membership.removed': 'Acceso quitado',
  'scouting.budget.changed': 'Tope de gasto de scouting modificado',
  'scouting.imported': 'Perfiles importados desde scouting',
  'scouting.preview': 'Costo de scouting calculado',
  'scouting.run': 'Búsqueda de scouting ejecutada',
  'user.disabled': 'Usuario desactivado',
  'user.enabled': 'Usuario activado',
}

export const auditActionLabel = (key: string): string => AUDIT_ACTION_LABELS[key] ?? key

/** Sobre qué se hizo. El modelo se llama en inglés; la pantalla no. */
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  Campaign: 'Campaña',
  CampaignBrief: 'Brief',
  Candidacy: 'Perfil de campaña',
  Client: 'Cliente',
  ClientBrand: 'Identidad visual',
  Comment: 'Comentario',
  Export: 'Exportación',
  ImportRun: 'Importación',
  Influencer: 'Influencer',
  Invitation: 'Invitación',
  Membership: 'Acceso',
  ScoutingBudget: 'Tope de scouting',
  ScoutingRun: 'Búsqueda de scouting',
  Session: 'Sesión',
  User: 'Usuario',
  AiInsight: 'Análisis de IA',
}

export const entityTypeLabel = (key: string): string => ENTITY_TYPE_LABELS[key] ?? key
