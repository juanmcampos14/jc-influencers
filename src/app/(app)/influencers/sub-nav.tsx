import { SubNav, type ItemDeSubNav } from '@/components/ui/sub-nav'
import { can, type AuthContext } from '@/lib/authz/context'

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
export function itemsDeInfluencers(ctx: AuthContext): ItemDeSubNav[] {
  const items: ItemDeSubNav[] = [
    {
      href: '/influencers',
      etiqueta: 'Padrón',
      ayuda: 'La gente que ya incorporamos y podemos sumar a una campaña.',
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
      etiqueta: 'Descubiertos',
      ayuda: 'Perfiles que trajeron las búsquedas y todavía no incorporamos. Buscar acá no cuesta nada.',
    })
    items.push({
      href: '/influencers/buscar',
      etiqueta: 'Buscar',
      ayuda: 'Salir a buscar gente nueva con un proveedor. Tiene costo.',
    })
  }

  if (can(ctx, 'influencer.manage', null)) {
    items.push({
      href: '/influencers/duplicados',
      etiqueta: 'Duplicados',
      ayuda: 'Perfiles que parecen la misma persona.',
    })
  }

  return items
}

export function NavDeInfluencers({ ctx, activo }: { ctx: AuthContext; activo: string }) {
  return <SubNav items={itemsDeInfluencers(ctx)} activo={activo} etiqueta="Secciones de Influencers" />
}
