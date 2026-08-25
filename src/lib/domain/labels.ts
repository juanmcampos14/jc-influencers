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
