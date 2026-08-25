import { Badge } from '@/components/ui/badge'
import { CANDIDACY_STATUS_SEED } from '@/lib/domain/statuses'
import { INFLUENCER_STATUS } from '@/lib/domain/labels'

const STATUS_BY_KEY = new Map(CANDIDACY_STATUS_SEED.map((status) => [status.key, status]))

export function StatusBadge({ statusKey, label, color }: { statusKey: string; label?: string; color?: string }) {
  const seed = STATUS_BY_KEY.get(statusKey)
  return <Badge tone={color ?? seed?.color ?? 'slate'}>{label ?? seed?.label ?? statusKey}</Badge>
}

const APPROVAL_LABELS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'Pendiente', tone: 'slate' },
  APPROVED: { label: 'Aprobado', tone: 'emerald' },
  REJECTED: { label: 'Rechazado', tone: 'rose' },
  NEEDS_REVIEW: { label: 'A revisar', tone: 'amber' },
  REPLACEMENT_REQUESTED: { label: 'Pide reemplazo', tone: 'orange' },
}

export function ApprovalBadge({ approval }: { approval: string }) {
  const entry = APPROVAL_LABELS[approval] ?? { label: approval, tone: 'slate' }
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}

export const CAMPAIGN_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Borrador', tone: 'slate' },
  BRIEFING: { label: 'Brief', tone: 'sky' },
  SCOUTING: { label: 'Scouting', tone: 'indigo' },
  PROPOSAL: { label: 'Propuesta', tone: 'blue' },
  NEGOTIATION: { label: 'Negociación', tone: 'violet' },
  PRODUCTION: { label: 'Producción', tone: 'amber' },
  LIVE: { label: 'En vivo', tone: 'emerald' },
  CLOSED: { label: 'Cerrada', tone: 'stone' },
  CANCELLED: { label: 'Cancelada', tone: 'rose' },
}

export function CampaignStatusBadge({ status }: { status: string }) {
  const entry = CAMPAIGN_STATUS_LABELS[status] ?? { label: status, tone: 'slate' }
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}

/**
 * Estado del influencer en la base de la agencia.
 *
 * Las etiquetas salen de `domain/labels` para que el badge y el filtro no
 * puedan desincronizarse: antes la tabla decía "En reserva" y el desplegable
 * "Backlog" para el mismo valor.
 */
export const INFLUENCER_STATUS_LABELS = INFLUENCER_STATUS

export function InfluencerStatusBadge({ status }: { status: string }) {
  const entry = INFLUENCER_STATUS_LABELS[status] ?? { label: status, tone: 'slate' }
  return (
    <Badge tone={entry.tone} dot>
      {entry.label}
    </Badge>
  )
}

export function StarsLabel({ value }: { value: number | null }) {
  if (!value) return <span className="text-ink-400">—</span>
  return (
    <span className="whitespace-nowrap text-amber-600" title={`Fit ${value} de 5`}>
      <span aria-hidden="true">{'★'.repeat(value)}</span>
      <span className="sr-only">Fit {value} de 5</span>
    </span>
  )
}

/** Enlace externo seguro: nunca sin rel="noopener noreferrer". */
export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  let safe: string | null = null
  try {
    const url = new URL(href)
    if (url.protocol === 'http:' || url.protocol === 'https:') safe = url.toString()
  } catch {
    safe = null
  }
  if (!safe) return <span className="text-ink-400">{children}</span>
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="text-ink-700 underline decoration-ink-300 underline-offset-2 transition-colors hover:text-ink-950 hover:decoration-ink-900"
    >
      {children}
    </a>
  )
}
