import type { StatusCategory } from '@/generated/prisma/enums'

/**
 * Estados iniciales de una candidatura. Son SEMILLA, no constantes del sistema:
 * viven en la tabla `candidacy_status_defs` y se pueden editar desde Configuración.
 */
export type StatusSeed = {
  key: string
  label: string
  category: StatusCategory
  color: string
  order: number
  clientVisible: boolean
  isTerminal: boolean
}

export const CANDIDACY_STATUS_SEED: readonly StatusSeed[] = [
  { key: 'NUEVO', label: 'Nuevo', category: 'SCREENING', color: 'slate', order: 10, clientVisible: false, isTerminal: false },
  { key: 'EN_SCREENING', label: 'En screening', category: 'SCREENING', color: 'slate', order: 20, clientVisible: false, isTerminal: false },
  { key: 'A_REVISAR', label: 'A revisar', category: 'SCREENING', color: 'amber', order: 30, clientVisible: true, isTerminal: false },
  { key: 'PROPUESTO', label: 'Propuesto al cliente', category: 'PROPOSAL', color: 'blue', order: 40, clientVisible: true, isTerminal: false },
  { key: 'APROBADO', label: 'Aprobado', category: 'PROPOSAL', color: 'emerald', order: 50, clientVisible: true, isTerminal: false },
  { key: 'RECHAZADO', label: 'Rechazado', category: 'CLOSED', color: 'rose', order: 60, clientVisible: true, isTerminal: true },
  { key: 'SOLICITAR_REEMPLAZO', label: 'Solicitar reemplazo', category: 'PROPOSAL', color: 'orange', order: 70, clientVisible: true, isTerminal: false },
  { key: 'CONTACTAR', label: 'Contactar', category: 'NEGOTIATION', color: 'sky', order: 80, clientVisible: false, isTerminal: false },
  { key: 'EN_NEGOCIACION', label: 'En negociación', category: 'NEGOTIATION', color: 'indigo', order: 90, clientVisible: false, isTerminal: false },
  { key: 'CONFIRMADO', label: 'Confirmado', category: 'NEGOTIATION', color: 'emerald', order: 100, clientVisible: true, isTerminal: false },
  { key: 'CONTENIDO_EN_PRODUCCION', label: 'Contenido en producción', category: 'PRODUCTION', color: 'violet', order: 110, clientVisible: true, isTerminal: false },
  { key: 'CONTENIDO_PARA_APROBACION', label: 'Contenido para aprobación', category: 'PRODUCTION', color: 'amber', order: 120, clientVisible: true, isTerminal: false },
  { key: 'PUBLICADO', label: 'Publicado', category: 'PRODUCTION', color: 'emerald', order: 130, clientVisible: true, isTerminal: false },
  { key: 'FINALIZADO', label: 'Finalizado', category: 'CLOSED', color: 'slate', order: 140, clientVisible: true, isTerminal: true },
  { key: 'NO_DISPONIBLE', label: 'No disponible', category: 'CLOSED', color: 'stone', order: 150, clientVisible: true, isTerminal: true },
]

export const DEFAULT_STATUS_KEY = 'NUEVO'

export const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = {
  SCREENING: 'Screening',
  PROPOSAL: 'Propuesta',
  NEGOTIATION: 'Negociación',
  PRODUCTION: 'Producción',
  CLOSED: 'Cerrado',
}

/** Nichos iniciales, tomados de la lista desplegable del Excel de origen. */
export const NICHE_SEED: readonly { key: string; label: string }[] = [
  { key: 'gaming', label: 'Gaming' },
  { key: 'tech', label: 'Tech' },
  { key: 'finanzas', label: 'Finanzas' },
  { key: 'criptomonedas', label: 'Criptomonedas' },
  { key: 'pop', label: 'Pop' },
  { key: 'slots-casino', label: 'Slots & Casino' },
  { key: 'web3', label: 'Web3' },
  { key: 'deportes', label: 'Deportes' },
  { key: 'lifestyle', label: 'Lifestyle' },
  { key: 'cosplay', label: 'Cosplay' },
  { key: 'variety', label: 'Variety' },
  { key: 'fitness', label: 'Fitness' },
  { key: 'ia', label: 'IA' },
  { key: 'politica', label: 'Política' },
  { key: 'musica', label: 'Música' },
  { key: 'inversion', label: 'Inversión' },
  { key: 'business', label: 'Business' },
  { key: 'viajes', label: 'Viajes' },
  { key: 'freelance', label: 'Freelance / Trabajo remoto' },
  { key: 'foodie', label: 'Foodie' },
  { key: 'real-estate', label: 'Real Estate' },
  { key: 'marketing', label: 'Marketing' },
]

/** Mercados iniciales, tomados de la lista desplegable del Excel de origen. */
export const MARKET_SEED: readonly string[] = [
  'ARG', 'BOLIVIA', 'CHILE', 'COL', 'EMIRATES', 'ESPAÑA', 'EUROPA', 'GLOBAL', 'LATAM',
  'MEX', 'PANAMA', 'PERÚ', 'REPÚBLICA DOMINICANA', 'TURKEY', 'USA', 'VENEZUELA',
]

/** Antigüedad a partir de la cual una métrica se muestra como desactualizada. */
export const STALE_METRIC_DAYS = 45

export function isMetricStale(measuredAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!measuredAt) return true
  const ageDays = (now.getTime() - measuredAt.getTime()) / (24 * 60 * 60 * 1000)
  return ageDays > STALE_METRIC_DAYS
}
