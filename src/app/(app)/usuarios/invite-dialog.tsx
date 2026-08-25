"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select } from '@/components/ui/field'
import { AGENCY_ROLE_LABELS, CLIENT_ROLE_LABELS, GRANTABLE_AGENCY_EXTRAS, GRANTABLE_CLIENT_EXTRAS } from '@/lib/authz/capabilities'
import { CAPABILITY_LABELS } from '@/lib/authz/capabilities'
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
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [kind, setKind] = React.useState<'AGENCY' | 'CLIENT'>(canInviteAgency ? 'AGENCY' : 'CLIENT')
  const [errors, setErrors] = React.useState<Record<string, string[]>>({})
  const [pending, startTransition] = React.useTransition()

  const agencyRoles = Object.entries(AGENCY_ROLE_LABELS).filter(
    ([key]) => isSuperadmin || key !== 'PLATFORM_SUPERADMIN',
  )

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
        extraCapabilities: form.getAll('extras').map(String),
        agencyClientIds: kind === 'AGENCY' ? form.getAll('agencyClientIds').map(String) : undefined,
      })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }
      toast.success('Invitación enviada. El enlace vence en 7 días y se usa una sola vez.')
      setOpen(false)
      router.refresh()
    })
  }

  const extras = kind === 'AGENCY' ? GRANTABLE_AGENCY_EXTRAS : GRANTABLE_CLIENT_EXTRAS
  const invitableClients = kind === 'CLIENT' ? clients : clients

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Invitar</Button>
      </DialogTrigger>
      <DialogContent
        title="Invitar a una persona"
        description="Le llega un email con un enlace único. La contraseña la define ella."
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {canInviteAgency ? (
            <Field label="Tipo de acceso" htmlFor="kind">
              <Select id="kind" value={kind} onChange={(event) => setKind(event.target.value as 'AGENCY' | 'CLIENT')}>
                <option value="AGENCY">Empleado de la agencia</option>
                <option value="CLIENT">Usuario de un cliente</option>
              </Select>
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="email" errors={errors.email} required>
              <Input id="email" name="email" type="email" required autoFocus maxLength={200} />
            </Field>
            <Field label="Nombre" htmlFor="name" errors={errors.name} required>
              <Input id="name" name="name" required maxLength={120} />
            </Field>
          </div>

          {kind === 'AGENCY' ? (
            <>
              <Field label="Rol de agencia" htmlFor="agencyRole" required>
                <Select id="agencyRole" name="agencyRole" defaultValue="ACCOUNT_MANAGER" required>
                  {agencyRoles.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Clientes asignados"
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
              <Field label="Cliente" htmlFor="clientId" required>
                <Select id="clientId" name="clientId" required>
                  {invitableClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Rol dentro del cliente" htmlFor="clientRole" required>
                <Select id="clientRole" name="clientRole" defaultValue="CLIENT_REVIEWER" required>
                  {Object.entries(CLIENT_ROLE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          <fieldset className="space-y-1.5 rounded-lg border border-ink-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Permisos extra (opcional)
            </legend>
            {extras.map((capability) => (
              <label key={capability} className="flex items-center gap-2 text-sm text-ink-700">
                <Checkbox name="extras" value={capability} />
                {CAPABILITY_LABELS[capability]}
              </label>
            ))}
            <p className="px-1 pt-1 text-xs text-ink-500">
              Un usuario de cliente nunca puede recibir permisos internos de la agencia, aunque se los marque.
            </p>
          </fieldset>

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Enviando…' : 'Enviar invitación'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
