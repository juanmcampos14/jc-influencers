import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { CANDIDACY_STATUS_SEED } from '@/lib/domain/statuses'
import { INFLUENCER_STATUS } from '@/lib/domain/labels'

const STATUS_BY_KEY = new Map(CANDIDACY_STATUS_SEED.map((status) => [status.key, status]))

export function StatusBadge({ statusKey, label, color }: { statusKey: string; label?: string; color?: string }) {
  const seed = STATUS_BY_KEY.get(statusKey)
  return <Badge tone={color ?? seed?.color ?? 'slate'}>{label ?? seed?.label ?? statusKey}</Badge>
}

/*
 * Los badges resuelven su propio texto. Antes recibían la etiqueta ya escrita
 * desde un mapa de este archivo, y eso dejaba el estado en castellano en todas
 * las pantallas en inglés -- justo el dato que más se mira de una tabla.
 */
const APPROVAL_TONES: Record<string, string> = {
  PENDING: 'slate',
  APPROVED: 'emerald',
  REJECTED: 'rose',
  NEEDS_REVIEW: 'amber',
  REPLACEMENT_REQUESTED: 'orange',
}

export function ApprovalBadge({ approval }: { approval: string }) {
  const t = useTranslations('etiquetas')
  const tone = APPROVAL_TONES[approval]
  return <Badge tone={tone ?? 'slate'}>{tone ? t(`aprobacion${approval}`) : approval}</Badge>
}

/** Estado de la campaña: tono y orden acá, texto en las traducciones. */
export const CAMPAIGN_STATUS_TONES: Record<string, string> = {
  DRAFT: 'slate',
  BRIEFING: 'sky',
  SCOUTING: 'indigo',
  PROPOSAL: 'blue',
  NEGOTIATION: 'violet',
  PRODUCTION: 'amber',
  LIVE: 'emerald',
  CLOSED: 'stone',
  CANCELLED: 'rose',
}

export const CAMPAIGN_STATUS_VALUES: readonly string[] = Object.keys(CAMPAIGN_STATUS_TONES)

/** El texto de un estado de campaña, para un desplegable o un aviso. */
export const campaignStatusLabel = (t: (clave: string) => string, status: string): string =>
  status in CAMPAIGN_STATUS_TONES ? t(`campana${status}`) : status

export function CampaignStatusBadge({ status }: { status: string }) {
  const t = useTranslations('etiquetas')
  return <Badge tone={CAMPAIGN_STATUS_TONES[status] ?? 'slate'}>{campaignStatusLabel(t, status)}</Badge>
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
  const t = useTranslations('etiquetas')
  const entry = INFLUENCER_STATUS_LABELS[status]
  return (
    <Badge tone={entry?.tone ?? 'slate'} dot>
      {entry ? t(entry.clave) : status}
    </Badge>
  )
}

export function StarsLabel({ value }: { value: number | null }) {
  const t = useTranslations('etiquetas')
  if (!value) return <span className="text-ink-400">—</span>
  const texto = t('fitDeCinco', { valor: value })
  return (
    <span className="whitespace-nowrap text-amber-600" title={texto}>
      <span aria-hidden="true">{'★'.repeat(value)}</span>
      <span className="sr-only">{texto}</span>
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
