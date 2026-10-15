'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/util/format'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { title: string; description?: string }) {
  const t = useTranslations('general')
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[color:color-mix(in_srgb,var(--jc-text)_45%,transparent)] backdrop-blur-[1px]" />
      <DialogPrimitive.Content
        className={cn(
          // `dvh` y no `vh`: en Safari de iPhone `100vh` incluye la barra del
          // navegador, así que el pie del diálogo -- donde están Guardar y
          // Cerrar -- quedaba debajo del borde visible.
          'fixed left-1/2 top-1/2 z-50 flex w-[min(38rem,calc(100vw-2rem))] max-h-[calc(100dvh-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-ink-200 bg-surface shadow-lg',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
          <div>
            <DialogPrimitive.Title className="text-base font-semibold text-ink-900">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-ink-500">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="-m-2 grid size-11 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"
            aria-label={t('cerrar')}
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
