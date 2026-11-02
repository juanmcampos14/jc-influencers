import { Mail, MessageCircle, Phone } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { paraWhatsapp } from '@/lib/domain/whatsapp'

/**
 * Los botones para hablarle a alguien.
 *
 * El teléfono estaba en la ficha como texto: para escribirle había que
 * seleccionarlo, copiarlo, abrir WhatsApp y pegarlo. Tres pasos que se hacen
 * veinte veces por día.
 *
 * El botón de WhatsApp aparece sólo cuando el número alcanza para abrir un
 * chat. `wa.me` necesita el código de país; sin él abriría el chat de otra
 * persona, así que cuando falta se dice qué falta en vez de ofrecer un botón
 * que lleva a cualquier parte.
 */
export function ContactoDirecto({
  telefono,
  email,
  pais,
  nombre,
  compacto = false,
}: {
  telefono: string | null
  email?: string | null
  /** El país de la ficha, para completar el código cuando el número es local. */
  pais?: string | null
  nombre: string
  /** En una tabla va sólo el ícono, sin la etiqueta. */
  compacto?: boolean
}) {
  const t = useTranslations('influencers')
  const wa = paraWhatsapp(telefono, pais)

  if (compacto) {
    if (wa.estado !== 'LISTO') return null
    return (
      <a
        href={wa.url}
        target="_blank"
        rel="noopener noreferrer"
        title={t('escribirPorWhatsapp', { nombre })}
        aria-label={t('escribirPorWhatsapp', { nombre })}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-emerald-300 text-emerald-700 transition-colors hover:border-emerald-500 hover:bg-emerald-50"
      >
        <MessageCircle className="size-4" aria-hidden="true" />
      </a>
    )
  }

  if (wa.estado === 'SIN_NUMERO' && !email) return null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {wa.estado === 'LISTO' ? (
          <Button asChild size="sm">
            <a href={wa.url} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" aria-hidden="true" />
              {t('whatsapp')}
            </a>
          </Button>
        ) : null}
        {wa.estado !== 'SIN_NUMERO' ? (
          <Button asChild size="sm" variant="secondary">
            {/* Marcar sirve igual sin código de país: el teléfono del equipo lo completa. */}
            <a href={`tel:${wa.paraMostrar.replace(/[^\d+]/g, '')}`}>
              <Phone className="size-4" aria-hidden="true" />
              {t('llamar')}
            </a>
          </Button>
        ) : null}
        {email ? (
          <Button asChild size="sm" variant="secondary">
            <a href={`mailto:${email}`}>
              <Mail className="size-4" aria-hidden="true" />
              {t('escribirEmail')}
            </a>
          </Button>
        ) : null}
      </div>
      {wa.estado === 'SIN_CODIGO_DE_PAIS' ? (
        <p className="text-xs text-amber-700">{t('faltaCodigoDePais')}</p>
      ) : null}
    </div>
  )
}
