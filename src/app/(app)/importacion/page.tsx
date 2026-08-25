import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table'
import { requireContext } from '@/lib/auth/current'
import { can } from '@/lib/authz/context'
import { listImportRuns } from '@/lib/import/runner'
import { formatDateTime } from '@/lib/util/format'
import { ImportWizard } from './import-wizard'

export const metadata: Metadata = { title: 'Importación' }
export const dynamic = 'force-dynamic'

const STATUS: Record<string, { label: string; tone: string }> = {
  PREVIEW: { label: 'Previsualización', tone: 'amber' },
  CONFIRMED: { label: 'Aplicada', tone: 'emerald' },
  CANCELLED: { label: 'Cancelada', tone: 'slate' },
  FAILED: { label: 'Fallida', tone: 'rose' },
}

export default async function ImportPage() {
  const ctx = await requireContext()
  const importable = ctx.clients.filter((client) => can(ctx, 'import.run', client.id))
  const activeClientId = importable.find((client) => client.id === ctx.activeClientId)?.id ?? importable[0]?.id ?? null
  const runs = activeClientId ? await listImportRuns(ctx, activeClientId) : []

  if (importable.length === 0) {
    return (
      <>
        <PageHeader title="Importación" />
        <div className="px-5 py-6 sm:px-8">
          <Card>
            <EmptyState title="No tenés permiso para importar" description="Pedile acceso a un administrador de agencia." />
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Importar desde Excel"
        description="Se lee el archivo completo, hoja por hoja. Primero ves un reporte y después decidís si aplicarlo."
      />
      <div className="space-y-6 px-5 py-6 sm:px-8">
        <ImportWizard
          clients={importable.map((client) => ({ id: client.id, name: client.name }))}
          defaultClientId={activeClientId ?? importable[0]!.id}
        />

        <Card>
          <CardHeader>
            <CardTitle>Importaciones anteriores</CardTitle>
          </CardHeader>
          {runs.length === 0 ? (
            <EmptyState title="Sin importaciones" description="Todavía no importaste ningún archivo para este cliente." />
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Archivo</Th>
                    <Th>Estado</Th>
                    <Th className="text-right">Filas</Th>
                    <Th>Inicio</Th>
                    <Th>Fin</Th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const status = STATUS[run.status] ?? { label: run.status, tone: 'slate' }
                    return (
                      <Tr key={run.id}>
                        <Td className="text-sm">{run.filename}</Td>
                        <Td>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </Td>
                        <Td className="text-right tabular-nums">{run.rowCount}</Td>
                        <Td className="whitespace-nowrap text-xs text-ink-600">
                          {formatDateTime(run.startedAt, ctx.user.timezone)}
                        </Td>
                        <Td className="whitespace-nowrap text-xs text-ink-600">
                          {formatDateTime(run.finishedAt, ctx.user.timezone)}
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  )
}
