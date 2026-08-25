import { Badge } from '@/components/ui/badge'
import type { InsightDto } from '@/lib/repos/ai'

/**
 * Muestra el resultado de un análisis con IA.
 *
 * Siempre acompañado de con qué modelo se hizo y sobre qué datos: una
 * recomendación sin procedencia no se puede discutir ni auditar.
 */

const KIND_LABELS: Record<string, string> = {
  PROFILE_FIT: 'Análisis de perfil',
  CREATIVE_IDEAS: 'Ideas creativas',
  CAMPAIGN_ANALYSIS: 'Análisis de campaña',
  CAMPAIGN_REPORT: 'Reporte de campaña',
}

function Section({ title, items }: { title: string; items: unknown }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">{title}</p>
      <ul className="list-inside list-disc space-y-1 text-sm text-ink-700">
        {items.map((item, index) => (
          <li key={index}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
        ))}
      </ul>
    </div>
  )
}

/** Markdown mínimo: encabezados, listas y negritas. Nada de HTML del modelo. */
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1.5 text-sm text-ink-700">
      {lines.map((line, index) => {
        const bold = (value: string) =>
          value.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) =>
            part.startsWith('**') && part.endsWith('**') ? (
              <strong key={partIndex} className="font-semibold text-ink-900">
                {part.slice(2, -2)}
              </strong>
            ) : (
              <span key={partIndex}>{part}</span>
            ),
          )
        if (/^###\s/.test(line)) {
          return (
            <h4 key={index} className="pt-2 text-sm font-semibold text-ink-900">
              {line.replace(/^###\s/, '')}
            </h4>
          )
        }
        if (/^##\s/.test(line)) {
          return (
            <h3 key={index} className="pt-3 text-base font-semibold text-ink-900">
              {line.replace(/^##\s/, '')}
            </h3>
          )
        }
        if (/^[-*]\s/.test(line)) {
          return (
            <p key={index} className="pl-4 before:mr-1.5 before:content-['·']">
              {bold(line.replace(/^[-*]\s/, ''))}
            </p>
          )
        }
        if (line.trim() === '') return <div key={index} className="h-1" />
        return <p key={index}>{bold(line)}</p>
      })}
    </div>
  )
}

export function InsightView({
  insight,
  timezone,
  mostrarDetalleTecnico = false,
}: {
  insight: InsightDto
  timezone: string
  /**
   * Modelo, versión de instrucciones, costo y datos de entrada.
   *
   * Por defecto NO se muestra. Este componente se usa en el panel de la agencia
   * y en el portal del cliente, y un dato interno no puede depender de que
   * alguien se acuerde de ocultarlo en el lugar correcto: se muestra sólo donde
   * se pide explícitamente.
   */
  mostrarDetalleTecnico?: boolean
}) {
  const output = insight.output as Record<string, unknown> | null

  return (
    <article className="rounded-xl border border-ink-200 bg-surface p-4">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone="violet">{KIND_LABELS[insight.kind] ?? insight.kind}</Badge>
        {insight.status === 'FAILED' ? <Badge tone="rose">Falló</Badge> : null}
        {insight.clientVisible ? <Badge tone="emerald">Compartido con el cliente</Badge> : null}
        <span className="text-xs text-ink-500">
          {new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(
            new Date(insight.createdAt),
          )}
        </span>
      </header>

      {insight.status === 'FAILED' ? (
        <p className="text-sm text-rose-700">{insight.errorMessage ?? 'No se pudo generar el análisis.'}</p>
      ) : null}

      {insight.kind === 'CAMPAIGN_REPORT' && insight.outputText ? (
        <SimpleMarkdown text={insight.outputText} />
      ) : null}

      {insight.kind === 'PROFILE_FIT' && output ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-amber-600" aria-label={`Fit ${String(output.fitScore)} de 5`}>
              {'★'.repeat(Number(output.fitScore) || 0)}
            </span>
            <p className="text-sm font-medium text-ink-900">{String(output.veredicto ?? '')}</p>
          </div>
          <Section title="Por qué encaja" items={output.razones} />
          <Section title="Qué mirar antes de avanzar" items={output.riesgos} />
          <Section title="Ideas de contenido" items={output.ideasDeContenido} />
          <Section title="Datos que faltan" items={output.datosFaltantes} />
        </>
      ) : null}

      {insight.kind === 'CREATIVE_IDEAS' && output ? (
        <>
          <p className="text-sm text-ink-800">{String(output.conceptoGeneral ?? '')}</p>
          {Array.isArray(output.ideas) ? (
            <ul className="mt-3 space-y-2">
              {(output.ideas as Array<Record<string, unknown>>).map((idea, index) => (
                <li key={index} className="rounded-lg border border-ink-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink-900">{String(idea.titulo ?? '')}</p>
                    <Badge tone="slate">{String(idea.formato ?? '')}</Badge>
                    {idea.cluster ? <Badge tone="blue">{String(idea.cluster)}</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-ink-700">{String(idea.descripcion ?? '')}</p>
                  <p className="mt-1 text-xs text-ink-500">{String(idea.porQueFunciona ?? '')}</p>
                </li>
              ))}
            </ul>
          ) : null}
          <Section title="Qué evitar" items={output.queEvitar} />
        </>
      ) : null}

      {insight.kind === 'CAMPAIGN_ANALYSIS' && output ? (
        <>
          <p className="text-sm text-ink-800">{String(output.resumen ?? '')}</p>
          <Section title="Lo que va bien" items={output.loQueVaBien} />
          <Section title="Lo que preocupa" items={output.loQuePreocupa} />
          <Section title="Desvíos del brief" items={output.desviosDelBrief} />
          <Section title="Próximos pasos" items={output.proximosPasos} />
          <Section title="Datos que faltan" items={output.datosFaltantes} />
        </>
      ) : null}

      {/*
        * El pie con proveedor, versión, costo y datos de entrada es información
        * interna de la agencia. Este mismo componente se renderiza en el portal
        * del cliente, así que le mostraba cuánto le cuesta a la agencia cada
        * análisis y con qué modelo lo hace. Al cliente le alcanza con saber que
        * lo generó una IA.
        */}
      <footer className="mt-3 border-t border-ink-100 pt-2 text-[11px] text-ink-500">
        {mostrarDetalleTecnico ? (
          <>
            Generado con {insight.model} · versión de instrucciones {insight.promptVersion}
            {insight.costUsd !== null ? ` · costo US$ ${insight.costUsd.toFixed(4)}` : ''}
            {insight.inputsSummary ? ` · datos usados: ${JSON.stringify(insight.inputsSummary)}` : ''}
          </>
        ) : (
          'Generado con inteligencia artificial a partir de los datos de la campaña.'
        )}
      </footer>
    </article>
  )
}
