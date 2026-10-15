import { useTranslations } from 'next-intl'
import { SubNav, type ItemDeSubNav } from '@/components/ui/sub-nav'
import { can, type AuthContext } from '@/lib/authz/context'
import type { Traductor } from '@/lib/domain/labels'

/**
 * Los cuatro lugares de Influencers.
 *
 * El orden cuenta la secuencia real del trabajo, del centro hacia afuera:
 * primero la gente con la que ya trabajamos, después la que descubrimos y
 * todavía no incorporamos, después salir a buscar gente nueva --que es lo
 * único que cuesta plata, y por eso va después de las dos formas gratuitas de
 * encontrar a alguien-- y al final el mantenimiento.
 *
 * Cada lugar aparece sólo si la persona puede entrar. Un lugar que se ve y da
 * error al tocarlo es peor que uno que no está.
 */
export function itemsDeInfluencers(ctx: AuthContext, t: Traductor): ItemDeSubNav[] {
  const items: ItemDeSubNav[] = [
    {
      href: '/influencers',
      etiqueta: t('padron'),
      ayuda: t('padronAyuda'),
    },
  ]

  /*
   * Descubiertos y Buscar son las dos caras de lo mismo, y las dos son sólo de
   * agencia: buscar genera gasto, y lo descubierto es conocimiento de la
   * agencia que ningún cliente ve.
   */
  const puedeBuscar = ctx.clients.some((client) => can(ctx, 'scouting.run', client.id))
  if (puedeBuscar) {
    items.push({
      href: '/influencers/descubiertos',
      etiqueta: t('descubiertos'),
      ayuda: t('descubiertosAyuda'),
    })
    items.push({
      href: '/influencers/buscar',
      etiqueta: t('buscar'),
      ayuda: t('buscarAyuda'),
    })
  }

  if (can(ctx, 'influencer.manage', null)) {
    items.push({
      href: '/influencers/duplicados',
      etiqueta: t('duplicados'),
      ayuda: t('duplicadosAyuda'),
    })
  }

  return items
}

export function NavDeInfluencers({ ctx, activo }: { ctx: AuthContext; activo: string }) {
  const t = useTranslations('influencers')
  return <SubNav items={itemsDeInfluencers(ctx, t)} activo={activo} etiqueta={t('seccionesDeInfluencers')} />
}
