"use client"

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/field'
import {
  AGENCY_ROLE_CAPABILITIES,
  AGENCY_ROLES,
  CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE,
  CLIENT_ROLE_CAPABILITIES,
  CLIENT_ROLES,
  nombreDeRol,
  GRANTABLE_CLIENT_EXTRAS,
  type Capability,
} from '@/lib/authz/capabilities'
import { ArbolDePermisos } from '@/components/permisos/arbol-de-permisos'
import { capacidadesDelArbol } from '@/lib/authz/arbol'
import type { AgencyRole, ClientRole } from '@/generated/prisma/enums'
import { inviteUserAction } from '../actions/users'

type ShellClient = { id: string; name: string; allowClientUserInvites: boolean }

export function InviteDialog({
  clients,
  canInviteAgency,
  isSuperadmin,
}: {
  clients: ShellClient[]
  canInviteAgency: boolean
  isSuperadmin: boolean
}) {
  const t = useTranslations('usuarios')
  const tPermiso = useTranslations('permisos')
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [kind, setKind] = React.useState<'AGENCY' | 'CLIENT'>(canInviteAgency ? 'AGENCY' : 'CLIENT')
  const [errors, setErrors] = React.useState<Record<string, string[]>>({})
  const [pending, startTransition] = React.useTransition()
  const [rolDeAgencia, setRolDeAgencia] = React.useState<AgencyRole>('ACCOUNT_MANAGER')
  const [rolDeCliente, setRolDeCliente] = React.useState<ClientRole>('CLIENT_REVIEWER')

  /*
   * Lo que da el rol elegido. Se recalcula al cambiarlo, y los permisos
   * vuelven a ese piso: el rol nuevo es una decisión, no una capa encima del
   * anterior.
   */
  const delRol = React.useMemo(
    () =>
      new Set<Capability>(
        kind === 'AGENCY'
          ? (AGENCY_ROLE_CAPABILITIES[rolDeAgencia] ?? [])
          : (CLIENT_ROLE_CAPABILITIES[rolDeCliente] ?? []),
      ),
    [kind, rolDeAgencia, rolDeCliente],
  )
  const [concedidas, setConcedidas] = React.useState<Set<Capability>>(() => new Set())
  React.useEffect(() => setConcedidas(new Set(delRol)), [delRol])

  /**
   * Lo que no se le puede dar a un usuario de cliente: no se muestra.
   *
   * Un casillero que la base va a descartar igual no es una opción, es una
   * promesa que no se cumple. Del lado cliente sólo queda lo que da su rol más
   * la lista corta de lo que se le puede sumar.
   */
  const prohibidasDeCliente = React.useMemo(() => {
    if (kind === 'AGENCY') return undefined
    const permitido = new Set<Capability>([...delRol, ...GRANTABLE_CLIENT_EXTRAS])
    return new Set<Capability>(
      capacidadesDelArbol().filter(
        (cap) => CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE.has(cap) || !permitido.has(cap),
      ),
    )
  }, [kind, delRol])

  const agencyRoles = AGENCY_ROLES.filter((rol) => isSuperadmin || rol !== 'PLATFORM_SUPERADMIN')

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setErrors({})
    startTransition(async () => {
      const result = await inviteUserAction({
        email: String(form.get('email') ?? ''),
        name: String(form.get('name') ?? ''),
        kind,
        agencyRole: kind === 'AGENCY' ? (String(form.get('agencyRole') ?? '') as never) : undefined,
        clientId: kind === 'CLIENT' ? String(form.get('clientId') ?? '') : undefined,
        clientRole: kind === 'CLIENT' ? (String(form.get('clientRole') ?? '') as never) : undefined,
        concedidas: [...concedidas],
        agencyClientIds: kind === 'AGENCY' ? form.getAll('agencyClientIds').map(String) : undefined,
      })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }
      toast.success(t('invitacionEnviada'))
      setOpen(false)
      router.refresh()
    })
  }
  const invitableClients = kind === 'CLIENT' ? clients : clients

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{t('invitar')}</Button>
      </DialogTrigger>
      <DialogContent
        title={t('invitarTitulo')}
        description={t('invitarBajada')}
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {canInviteAgency ? (
            <Field label={t('tipoDeAcceso')} htmlFor="kind">
              <Select id="kind" value={kind} onChange={(event) => setKind(event.target.value as 'AGENCY' | 'CLIENT')}>
                <option value="AGENCY">{t('empleadoDeAgencia')}</option>
                <option value="CLIENT">{t('usuarioDeCliente')}</option>
              </Select>
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('email')} htmlFor="email" errors={errors.email} required>
              <Input id="email" name="email" type="email" required autoFocus maxLength={200} />
            </Field>
            <Field label={t('nombre')} htmlFor="name" errors={errors.name} required>
              <Input id="name" name="name" required maxLength={120} />
            </Field>
          </div>

          {kind === 'AGENCY' ? (
            <>
              <Field label={t('rolDeAgencia')} htmlFor="agencyRole" required>
                <Select
                  id="agencyRole"
                  name="agencyRole"
                  value={rolDeAgencia}
                  onChange={(event) => setRolDeAgencia(event.target.value as AgencyRole)}
                  required
                >
                  {agencyRoles.map((rol) => (
                    <option key={rol} value={rol}>
                      {nombreDeRol(tPermiso, rol)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t('clientesAsignados')}
                htmlFor="agencyClientIds"
                hint="Account managers, scouts y finanzas sólo ven los clientes que les asignes. Los administradores de agencia ven todos."
              >
                <Select id="agencyClientIds" name="agencyClientIds" multiple size={5} className="h-auto">
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          ) : (
            <>
              <Field label={t('cliente')} htmlFor="clientId" required>
                <Select id="clientId" name="clientId" required>
                  {invitableClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('rolDentroDelCliente')} htmlFor="clientRole" required>
                <Select
                  id="clientRole"
                  name="clientRole"
                  value={rolDeCliente}
                  onChange={(event) => setRolDeCliente(event.target.value as ClientRole)}
                  required
                >
                  {CLIENT_ROLES.map((rol) => (
                    <option key={rol} value={rol}>
                      {nombreDeRol(tPermiso, rol)}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          <div>
            <p className="mb-1 text-sm font-medium text-ink-800">{t('queVaAVerQueVaAEditar')}</p>
            <p className="mb-2 text-xs text-ink-500">
              {t('pistaArbolInvitar')}
            </p>
            <ArbolDePermisos
              concedidas={concedidas}
              onChange={setConcedidas}
              delRol={delRol}
              prohibidas={prohibidasDeCliente}
              disabled={pending}
            />
          </div>

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? t('enviando') : t('enviarInvitacion')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
