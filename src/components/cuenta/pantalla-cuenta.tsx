import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { nombreDeRol } from '@/lib/authz/capabilities'
import type { AuthContext } from '@/lib/authz/context'
import { CambiarClave } from './cambiar-clave'

/**
 * Pantalla de cuenta, común a los dos lados.
 *
 * Existe porque el email de quien entró no aparecía en ningún lado: la barra
 * mostraba el nombre y el rol, y dos cuentas de la misma persona se ven
 * idénticas hasta que una hace algo que la otra no puede.
 */
export function PantallaCuenta({ ctx }: { ctx: AuthContext }) {
  const t = useTranslations('cuenta')
  const tPermiso = useTranslations('permisos')
  const accesos = ctx.clients.map((client) => ({
    nombre: client.name,
    rol: client.role ? nombreDeRol(tPermiso, client.role) : null,
  }))

  return (
    <div className="max-w-3xl space-y-6 px-5 py-6 sm:px-8">
      <Card>
        <CardHeader>
          <CardTitle>{t('tuCuenta')}</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{t('campoNombre')}</dt>
            <dd className="text-sm text-ink-900">{ctx.user.name}</dd>

            <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{t('campoEmail')}</dt>
            <dd className="text-sm text-ink-900">
              {ctx.user.email}
              <span className="mt-0.5 block text-xs text-ink-500">{t('emailAyuda')}</span>
            </dd>

            <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{t('entrasComo')}</dt>
            <dd className="text-sm text-ink-900">
              {ctx.agencyRole ? (
                <Badge tone="emerald">{nombreDeRol(tPermiso, ctx.agencyRole)}</Badge>
              ) : (
                <Badge tone="slate">{t('usuarioDeCliente')}</Badge>
              )}
            </dd>

            <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">
              {ctx.allClients ? t('alcance') : t('espacios')}
            </dt>
            <dd className="text-sm text-ink-900">
              {ctx.allClients ? (
                t('todosLosClientes')
              ) : accesos.length === 0 ? (
                <span className="text-ink-500">{t('sinEspacios')}</span>
              ) : (
                <ul className="space-y-0.5">
                  {accesos.map((acceso) => (
                    <li key={acceso.nombre}>
                      {acceso.nombre}
                      {acceso.rol ? <span className="text-ink-500"> · {acceso.rol}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </dl>
        </CardBody>
      </Card>

      <CambiarClave />
    </div>
  )
}
