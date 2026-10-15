import * as React from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/util/format'

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-14 text-center', className)}>
      <p className="text-sm font-medium text-ink-800">{title}</p>
      {description ? <p className="max-w-md text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ title, description }: { title: string; description?: string }) {
  return (
    <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4">
      <p className="text-sm font-semibold text-rose-900">{title}</p>
      {description ? <p className="mt-1 text-sm text-rose-800">{description}</p> : null}
    </div>
  )
}

export function InfoNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900', className)}>
      {children}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-ink-200', className)} aria-hidden="true" />
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  const t = useTranslations('general')
  return (
    <div className="space-y-2 p-5" aria-busy="true" aria-label={t('cargando2')}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  )
}
