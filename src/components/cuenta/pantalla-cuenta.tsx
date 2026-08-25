import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AGENCY_ROLE_LABELS, CLIENT_ROLE_LABELS } from '@/lib/authz/capabilities'
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
  const accesos = ctx.clients.map((client) => ({
    nombre: client.name,
    rol: client.role ? CLIENT_ROLE_LABELS[client.role] : null,
  }))

  return (
    <div className="max-w-3xl space-y-6 px-5 py-6 sm:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Tu cuenta</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">Nombre</dt>
            <dd className="text-sm text-ink-900">{ctx.user.name}</dd>

            <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">Email</dt>
            <dd className="text-sm text-ink-900">
              {ctx.user.email}
              <span className="mt-0.5 block text-xs text-ink-500">
                Es con este email que entrás. No se puede cambiar solo: pedíselo a la agencia.
              </span>
            </dd>

            <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">Entrás como</dt>
            <dd className="text-sm text-ink-900">
              {ctx.agencyRole ? (
                <Badge tone="emerald">{AGENCY_ROLE_LABELS[ctx.agencyRole]}</Badge>
              ) : (
                <Badge tone="slate">Usuario de cliente</Badge>
              )}
            </dd>

            <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">
              {ctx.allClients ? 'Alcance' : 'Espacios'}
            </dt>
            <dd className="text-sm text-ink-900">
              {ctx.allClients ? (
                'Todos los clientes de la agencia.'
              ) : accesos.length === 0 ? (
                <span className="text-ink-500">Todavía no tenés ningún espacio asignado.</span>
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
