/**
 * Genera la matriz de roles y permisos LEYENDO EL CÓDIGO.
 * Así el documento no se desincroniza de la implementación:
 *   npx tsx --conditions=react-server scripts/print-permissions.ts > docs/03-roles-y-permisos.md
 */
import {
  AGENCY_ROLE_CAPABILITIES,
  AGENCY_ROLE_LABELS,
  CAPABILITIES,
  CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE,
  CAPABILITY_LABELS,
  CLIENT_ROLE_CAPABILITIES,
  CLIENT_ROLE_LABELS,
  GRANTABLE_AGENCY_EXTRAS,
  GRANTABLE_CLIENT_EXTRAS,
} from '../src/lib/authz/capabilities'

const agencyRoles = Object.keys(AGENCY_ROLE_CAPABILITIES) as Array<keyof typeof AGENCY_ROLE_CAPABILITIES>
const clientRoles = Object.keys(CLIENT_ROLE_CAPABILITIES) as Array<keyof typeof CLIENT_ROLE_CAPABILITIES>

const lines: string[] = []
lines.push('# Matriz de roles y permisos')
lines.push('')
lines.push('> Generado desde el código con `npm run docs:permisos`. No editar a mano.')
lines.push('')
lines.push('La autorización se pregunta siempre por una **capacidad**, nunca comparando roles sueltos.')
lines.push('')

lines.push('## Roles de agencia')
lines.push('')
lines.push(`| Capacidad | ${agencyRoles.map((role) => AGENCY_ROLE_LABELS[role]).join(' | ')} |`)
lines.push(`| --- | ${agencyRoles.map(() => '---').join(' | ')} |`)
for (const capability of CAPABILITIES) {
  const cells = agencyRoles.map((role) =>
    (AGENCY_ROLE_CAPABILITIES[role] as readonly string[]).includes(capability) ? 'sí' : '—',
  )
  lines.push(`| \`${capability}\` — ${CAPABILITY_LABELS[capability]} | ${cells.join(' | ')} |`)
}
lines.push('')

lines.push('## Roles de cliente')
lines.push('')
lines.push(`| Capacidad | ${clientRoles.map((role) => CLIENT_ROLE_LABELS[role]).join(' | ')} |`)
lines.push(`| --- | ${clientRoles.map(() => '---').join(' | ')} |`)
for (const capability of CAPABILITIES) {
  const cells = clientRoles.map((role) =>
    (CLIENT_ROLE_CAPABILITIES[role] as readonly string[]).includes(capability) ? 'sí' : '—',
  )
  if (cells.every((cell) => cell === '—')) continue
  lines.push(`| \`${capability}\` — ${CAPABILITY_LABELS[capability]} | ${cells.join(' | ')} |`)
}
lines.push('')

lines.push('## Cerrojo contra escalada de privilegios')
lines.push('')
lines.push('Estas capacidades se eliminan de cualquier usuario del lado cliente, aunque alguien las')
lines.push('escriba a mano en su membresía o las intente otorgar en una invitación:')
lines.push('')
for (const capability of [...CAPABILITIES_FORBIDDEN_FOR_CLIENT_SIDE].sort()) {
  lines.push(`- \`${capability}\` — ${CAPABILITY_LABELS[capability]}`)
}
lines.push('')

lines.push('## Permisos extra otorgables')
lines.push('')
lines.push('Se conceden por membresía, encima del rol base. Nadie puede otorgar una capacidad que no tiene.')
lines.push('')
lines.push('**A un empleado de agencia:**')
lines.push('')
for (const capability of GRANTABLE_AGENCY_EXTRAS) lines.push(`- \`${capability}\` — ${CAPABILITY_LABELS[capability]}`)
lines.push('')
lines.push('**A un usuario de cliente:**')
lines.push('')
for (const capability of GRANTABLE_CLIENT_EXTRAS) lines.push(`- \`${capability}\` — ${CAPABILITY_LABELS[capability]}`)
lines.push('')
lines.push('`user.invite` de un usuario de cliente sólo tiene efecto si la agencia habilitó')
lines.push('`allowClientUserInvites` para ese cliente. `export.create` depende de `allowClientExports`.')
lines.push('')

lines.push('## Reglas que no son una capacidad')
lines.push('')
lines.push('- **Alcance por cliente**: un `AGENCY_ADMIN` o `PLATFORM_SUPERADMIN` accede a todos los clientes.')
lines.push('  Un `ACCOUNT_MANAGER`, `SCOUT` o `FINANCE` sólo a los que tenga asignados (`agency_client_assignments`).')
lines.push('- **Visibilidad de la candidatura**: el cliente sólo ve las candidaturas con `clientVisible = true`.')
lines.push('  No es una decisión de la interfaz: está en el `where` de la consulta y en la política de RLS.')
lines.push('- **Finanzas y presupuesto**: `FINANCE` puede editar importes de una campaña o candidatura sin')
lines.push('  poder tocar el resto de sus campos.')
lines.push('- **Sólo un superadministrador** puede crear o desactivar a otro superadministrador.')

console.info(lines.join('\n'))
