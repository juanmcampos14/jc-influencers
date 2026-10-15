import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
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
  const t = await getTranslations('importacion')
  const idioma = await getLocale()
  const importable = ctx.clients.filter((client) => can(ctx, 'import.run', client.id))
  const activeClientId = importable.find((client) => client.id === ctx.activeClientId)?.id ?? importable[0]?.id ?? null
  const runs = activeClientId ? await listImportRuns(ctx, activeClientId) : []

  if (importable.length === 0) {
    return (
      <>
        <PageHeader title={t('titulo')} />
        <div className="px-5 py-6 sm:px-8">
          <Card>
            <EmptyState title={t('sinPermisoTitulo')} description={t('sinPermisoBajada')} />
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={t('importarDesdeExcel')}
        description={t('bajada')}
      />
      <div className="space-y-6 px-5 py-6 sm:px-8">
        <ImportWizard
          clients={importable.map((client) => ({ id: client.id, name: client.name }))}
          defaultClientId={activeClientId ?? importable[0]!.id}
        />

        <Card>
          <CardHeader>
            <CardTitle>{t('importacionesAnteriores')}</CardTitle>
            {runs.length >= 50 ? (
              <p className="text-xs text-ink-500">{t('ultimas50')}</p>
            ) : null}
          </CardHeader>
          {runs.length === 0 ? (
            <EmptyState title={t('sinImportacionesTitulo')} description={t('sinImportacionesBajada')} />
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>{t('archivo')}</Th>
                    <Th>{t('estado')}</Th>
                    <Th className="text-right">{t('personasEnElArchivo')}</Th>
                    <Th>{t('inicio')}</Th>
                    <Th>{t('fin')}</Th>
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
                        <Td className="text-right tabular-nums">
                          {run.rowCount ?? <span className="text-ink-400">—</span>}
                        </Td>
                        <Td className="whitespace-nowrap text-xs text-ink-600">
                          {formatDateTime(run.startedAt, ctx.user.timezone, idioma)}
                        </Td>
                        <Td className="whitespace-nowrap text-xs text-ink-600">
                          {formatDateTime(run.finishedAt, ctx.user.timezone, idioma)}
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
