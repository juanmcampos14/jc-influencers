/**
 * Etiquetas visibles de los enums.
 *
 * Una sola fuente para todo el producto. Tenerlas repetidas hacía que la tabla
 * dijera "En reserva" y el filtro "Backlog" para el mismo valor: quien veía la
 * etiqueta no la encontraba en el desplegable.
 *
 * El texto no vive acá: vive en `messages/*.json`, bajo `etiquetas`. Acá queda
 * la clave, el tono y el orden -- lo que no cambia con el idioma. Antes el
 * texto estaba escrito en este archivo y en inglés la pantalla seguía diciendo
 * "En reserva".
 */

/** Lo único que se le pide a una función de traducción para resolver una etiqueta. */
export type Traductor = (clave: string) => string

export const INFLUENCER_STATUS: Record<string, { clave: string; tone: string }> = {
  NEW: { clave: 'estadoNEW', tone: 'sky' },
  ACTIVE: { clave: 'estadoACTIVE', tone: 'emerald' },
  BACKLOG: { clave: 'estadoBACKLOG', tone: 'slate' },
  BLOCKED: { clave: 'estadoBLOCKED', tone: 'rose' },
  ARCHIVED: { clave: 'estadoARCHIVED', tone: 'stone' },
}

/**
 * Nombre de cada red tal como se escribe, no como lo guarda la base.
 *
 * Casi todos son nombres propios y se escriben igual en cualquier idioma: los
 * dos que no --"Sitio web" y "Otra"-- salen de las traducciones.
 */
const PLATFORM_NOMBRES: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  LINKTREE: 'Linktree',
  X: 'X',
  TWITCH: 'Twitch',
  FACEBOOK: 'Facebook',
  LINKEDIN: 'LinkedIn',
}

const PLATFORM_CLAVES: Record<string, string> = {
  WEBSITE: 'redWEBSITE',
  OTHER: 'redOTHER',
}

/** Las redes que ofrece un desplegable, en el orden en que conviene leerlas. */
export const PLATFORM_VALUES: readonly string[] = [
  ...Object.keys(PLATFORM_NOMBRES),
  ...Object.keys(PLATFORM_CLAVES),
]

export const platformLabel = (t: Traductor, value: string): string => {
  const key = value.toUpperCase()
  const clave = PLATFORM_CLAVES[key]
  return clave ? t(clave) : (PLATFORM_NOMBRES[key] ?? value)
}

/** Opciones para un desplegable, en el orden en que conviene leerlas. */
export const opcionesDe = (mapa: Record<string, { clave: string }>, t: Traductor) =>
  Object.entries(mapa).map(([value, { clave }]) => ({ value, label: t(clave) }))

/**
 * Qué pasó, legible.
 *
 * La auditoría mostraba la clave técnica: `candidacy.status.changed`,
 * `auth.login.failure`. Una auditoría existe para que alguien de afuera pueda
 * leerla -- un cliente, un abogado, vos dentro de seis meses -- y para eso
 * tiene que estar escrita en el idioma de quien la lee.
 */
export const AUDIT_ACTIONS: readonly string[] = [
  'admin.exceptional_access',
  'ai.insight.created',
  'ai.insight.shared',
  'auth.login.failure',
  'auth.login.success',
  'auth.logout',
  'auth.password_reset.complete',
  'auth.password.changed',
  'auth.password_reset.request',
  'auth.session.revoked',
  'brand.extracted',
  'brand.reset',
  'brand.mural.drawn',
  'brand.mural.removed',
  'brand.updated',
  'brief.updated',
  'budget.changed',
  'campaign.created',
  'campaign.updated',
  'campaign.goal.saved',
  'campaign.goal.deleted',
  'campaign.finance.updated',
  'payment.created',
  'payment.updated',
  'payment.deleted',
  'link.created',
  'link.archived',
  'deliverable.saved',
  'candidacy.approval',
  'candidacy.created',
  'candidacy.shortlist.changed',
  'candidacy.status.changed',
  'candidacy.updated',
  'candidacy.visibility',
  'client.created',
  'client.updated',
  'client.preview.entered',
  'client.preview.left',
  'comment.created',
  'export.created',
  'import.cancelled',
  'import.confirmed',
  'import.preview',
  'influencer.created',
  'influencer.deleted',
  'influencer.merged',
  'influencer.updated',
  'invitation.accepted',
  'invitation.created',
  'invitation.revoked',
  'membership.changed',
  'membership.removed',
  'scouting.budget.changed',
  'scouting.imported',
  'scouting.preview',
  'scouting.run',
  'user.disabled',
  'user.enabled',
]

const ACCIONES_CONOCIDAS = new Set(AUDIT_ACTIONS)

/** La clave de traducción de una acción: los puntos no sirven, son anidamiento. */
export const claveDeAccion = (key: string): string => `accion_${key.replace(/[.-]/g, '_')}`

/** Una clave que no conocemos se muestra cruda: es preferible a un hueco. */
export const auditActionLabel = (t: Traductor, key: string): string =>
  ACCIONES_CONOCIDAS.has(key) ? t(claveDeAccion(key)) : key

/** Sobre qué se hizo. El modelo se llama en inglés; la pantalla no siempre. */
export const ENTITY_TYPES: readonly string[] = [
  'Campaign',
  'CampaignBrief',
  'Candidacy',
  'Client',
  'ClientBrand',
  'Comment',
  'Export',
  'ImportRun',
  'Influencer',
  'Invitation',
  'Membership',
  'ScoutingBudget',
  'ScoutingRun',
  'Session',
  'User',
  'AiInsight',
]

const ENTIDADES_CONOCIDAS = new Set(ENTITY_TYPES)

export const entityTypeLabel = (t: Traductor, key: string): string =>
  ENTIDADES_CONOCIDAS.has(key) ? t(`entidad${key}`) : key
