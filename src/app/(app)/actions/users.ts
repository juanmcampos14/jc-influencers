"use server"

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { inviteUser, removeClientMembership, revokeUserInvitation, setUserStatus, updateMemberships } from '@/lib/repos/users'

const AGENCY_ROLE = z.enum(['PLATFORM_SUPERADMIN', 'AGENCY_ADMIN', 'ACCOUNT_MANAGER', 'SCOUT', 'FINANCE'])
const CLIENT_ROLE = z.enum(['CLIENT_ADMIN', 'CLIENT_REVIEWER', 'CLIENT_VIEWER'])
const id = z.string().min(1).max(60)

export const inviteUserAction = defineAction(
  z.object({
    email: z.string().trim().email('Ingresá un email válido.').max(200),
    name: z.string().trim().min(2, 'Ingresá el nombre.').max(120),
    kind: z.enum(['AGENCY', 'CLIENT']),
    agencyRole: AGENCY_ROLE.optional(),
    clientId: id.optional(),
    clientRole: CLIENT_ROLE.optional(),
    extraCapabilities: z.array(z.string().trim().max(60)).max(20).optional(),
    agencyClientIds: z.array(id).max(100).optional(),
  }),
  async (input, ctx) => {
    const result = await inviteUser(ctx, input)
    revalidatePath('/usuarios')
    if (input.clientId) revalidatePath(`/clientes/${input.clientId}`)
    return result
  },
)

export const revokeInvitationAction = defineAction(z.object({ invitationId: id }), async (input, ctx) => {
  await revokeUserInvitation(ctx, input.invitationId)
  revalidatePath('/usuarios')
  return { ok: true }
})

export const setUserStatusAction = defineAction(
  z.object({ userId: id, active: z.boolean() }),
  async (input, ctx) => {
    await setUserStatus(ctx, input.userId, input.active)
    revalidatePath('/usuarios')
    return { ok: true }
  },
)

export const updateMembershipsAction = defineAction(
  z.object({
    userId: id,
    agencyRole: AGENCY_ROLE.nullish(),
    /*
     * Llega TODO lo que la persona va a poder hacer, no "los extra": es lo que
     * la pantalla sabe. El servidor calcula la diferencia contra el rol y
     * vuelve a comprobar los cerrojos --nadie otorga lo que no tiene--.
     */
    agencyConcedidas: z.array(z.string().trim().max(60)).max(60).optional(),
    agencyClientIds: z.array(id).max(200).optional(),
    clientMemberships: z
      .array(
        z.object({
          clientId: id,
          role: CLIENT_ROLE,
          concedidas: z.array(z.string().trim().max(60)).max(60).optional(),
        }),
      )
      .max(100)
      .optional(),
  }),
  async (input, ctx) => {
    await updateMemberships(ctx, input)
    revalidatePath('/usuarios')
    return { ok: true }
  },
)

export const removeMembershipAction = defineAction(
  z.object({ userId: id, clientId: id }),
  async (input, ctx) => {
    await removeClientMembership(ctx, input.userId, input.clientId)
    revalidatePath('/usuarios')
    revalidatePath(`/clientes/${input.clientId}`)
    return { ok: true }
  },
)
