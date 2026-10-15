"use client"

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { KeyRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Checkbox, Field, Select } from '@/components/ui/field'
import { ArbolDePermisos } from '@/components/permisos/arbol-de-permisos'
import { AGENCY_ROLE_CAPABILITIES, isCapability, type Capability } from '@/lib/authz/capabilities'
import type { AgencyRole } from '@/generated/prisma/enums'
import {
  AGENCY_ROLE_LABELS,
  capabilityLabel,
  CLIENT_ROLE_LABELS,
} from '@/lib/authz/capabilities'
import { updateMembershipsAction, removeMembershipAction } from '../actions/users'

export type AccesoEditable = {
  userId: string
  name: string
  agencyRole: string | null
  agencyExtras: string[]
  /** Lo que se le quitó a mano, aunque el rol lo dé. */
  agencyQuitadas: string[]
  agencyClientIds: string[]
  clientMemberships: Array<{
    clientId: string
    clientName: string
    role: string
    extras: string[]
    quitadas: string[]
  }>
}

/**
 * Cambiar el rol y los clientes de alguien que ya tiene acceso.
 *
 * No se podía. Un account manager cambia de cuenta todos los meses y la única
 * salida era desactivarlo e invitarlo de nuevo con otro email, o dejarlo viendo
 * clientes que ya no le corresponden. Lo segundo no es incomodidad: es que el
 * aislamiento entre clientes deja de reflejar quién trabaja en qué.
 */
export function EditarAccesos({
  acceso,
  clients,
}: {
  acceso: AccesoEditable
  clients: Array<{ id: string; name: string }>
}) {
  const t = useTranslations('usuarios')
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pendiente, startTransition] = React.useTransition()
  const [rol, setRol] = React.useState(acceso.agencyRole ?? '')
  const [clientesElegidos, setClientesElegidos] = React.useState<Set<string>>(
    () => new Set(acceso.agencyClientIds),
  )
  /*
   * El estado es TODO lo que la persona va a poder hacer, no "los extra".
   * Arranca en lo que da el rol, más lo sumado, menos lo quitado --que es
   * exactamente lo que hoy puede hacer-- y de ahí se toca lo que haga falta.
   */
  const [concedidas, setConcedidas] = React.useState<Set<Capability>>(() => {
    const base = new Set<Capability>(AGENCY_ROLE_CAPABILITIES[(acceso.agencyRole ?? '') as AgencyRole] ?? [])
    for (const cap of acceso.agencyExtras) if (isCapability(cap)) base.add(cap)
    for (const cap of acceso.agencyQuitadas) if (isCapability(cap)) base.delete(cap)
    return base
  })

  /** Lo que da el rol elegido AHORA, para señalar qué se cambió a mano. */
  const delRol = React.useMemo(
    () => new Set<Capability>(AGENCY_ROLE_CAPABILITIES[rol as AgencyRole] ?? []),
    [rol],
  )

  /*
   * Al cambiar de rol se parte de lo que ese rol da. Conservar los casilleros
   * del rol anterior dejaría a alguien con permisos que nadie eligió: el rol
   * nuevo es una decisión, no una capa encima.
   */
  const rolAnterior = React.useRef(rol)
  React.useEffect(() => {
    if (rolAnterior.current === rol) return
    rolAnterior.current = rol
    setConcedidas(new Set(delRol))
  }, [rol, delRol])

  const esDeAgencia = acceso.agencyRole !== null
  // Los administradores ven todos los clientes: elegirlos no significaría nada.
  const asignaClientes = rol === 'ACCOUNT_MANAGER' || rol === 'SCOUT' || rol === 'FINANCE'

  function alternar(conjunto: Set<string>, valor: string, set: (s: Set<string>) => void) {
    const proximo = new Set(conjunto)
    if (proximo.has(valor)) proximo.delete(valor)
    else proximo.add(valor)
    set(proximo)
  }

  function guardar() {
    startTransition(async () => {
      const resultado = await updateMembershipsAction({
        userId: acceso.userId,
        ...(esDeAgencia
          ? {
              agencyRole: rol as never,
              agencyConcedidas: [...concedidas],
              agencyClientIds: asignaClientes ? [...clientesElegidos] : [],
            }
          : {}),
      })
      if (!resultado.ok) {
        toast.error(resultado.message)
        return
      }
      toast.success(`Accesos de ${acceso.name} actualizados.`)
      setOpen(false)
      router.refresh()
    })
  }

  function quitarDeCliente(clientId: string, clientName: string) {
    startTransition(async () => {
      const resultado = await removeMembershipAction({ userId: acceso.userId, clientId })
      if (!resultado.ok) {
        toast.error(resultado.message)
        return
      }
      toast.success(`${acceso.name} ya no tiene acceso a ${clientName}.`)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <KeyRound className="size-4" aria-hidden="true" />
          Accesos
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Accesos de ${acceso.name}`}
        description={t('cambiosProximaCarga')}
      >
        <div className="space-y-4">
          {esDeAgencia ? (
            <>
              <Field label={t('rolDeAgencia')} htmlFor="rol">
                <Select id="rol" value={rol} onChange={(event) => setRol(event.target.value)}>
                  {Object.entries(AGENCY_ROLE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>

              {asignaClientes ? (
                <Field
                  label={t('clientesAsignados')}
                  htmlFor="clientes"
                  hint={t('pistaClientes')}
                >
                  {/*
                    * Casillas y no un `select multiple`: en un teléfono el
                    * multi-select nativo es directamente hostil, y el truco de
                    * "Ctrl o Cmd para varios" no existe ahí.
                    */}
                  <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-ink-200 p-3">
                    {clients.map((client) => (
                      <label key={client.id} className="flex cursor-pointer items-center gap-2 text-sm text-ink-800">
                        <Checkbox
                          checked={clientesElegidos.has(client.id)}
                          onChange={() => alternar(clientesElegidos, client.id, setClientesElegidos)}
                        />
                        {client.name}
                      </label>
                    ))}
                  </div>
                </Field>
              ) : (
                <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
                  Con este rol ve todos los clientes de la agencia.
                </p>
              )}

              <div>
                <p className="mb-1 text-sm font-medium text-ink-800">{t('queVeQueEdita')}</p>
                <p className="mb-2 text-xs text-ink-500">
                  {t('pistaArbol')}
                </p>
                <ArbolDePermisos
                  concedidas={concedidas}
                  onChange={setConcedidas}
                  delRol={delRol}
                  disabled={pendiente}
                />
              </div>
            </>
          ) : (
            <div>
              <p className="mb-2 text-sm text-ink-700">{t('accesosAEspacios')}</p>
              <ul className="space-y-2">
                {acceso.clientMemberships.map((membership) => (
                  <li
                    key={membership.clientId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-900">{membership.clientName}</span>
                      <span className="block text-xs text-ink-500">
                        {(CLIENT_ROLE_LABELS as Record<string, string>)[membership.role] ?? membership.role}
                        {membership.extras.length > 0
                          ? ` · ${membership.extras.map((e) => capabilityLabel(e)).join(', ')}`
                          : ''}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-700 hover:bg-rose-50"
                      disabled={pendiente}
                      onClick={() => quitarDeCliente(membership.clientId, membership.clientName)}
                    >
                      <X className="size-4" aria-hidden="true" />
                      Quitar
                    </Button>
                  </li>
                ))}
              </ul>
              {acceso.clientMemberships.length === 0 ? (
                <p className="text-sm text-ink-500">{t('sinEspacios')}</p>
              ) : null}
              <p className="mt-3 text-xs text-ink-500">
                Para darle acceso a otro cliente, invitala a ese espacio desde «Invitar».
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cerrar
              </Button>
            </DialogClose>
            {esDeAgencia ? (
              <Button onClick={guardar} disabled={pendiente}>
                {pendiente ? t('guardando') : t('guardarAccesos')}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
