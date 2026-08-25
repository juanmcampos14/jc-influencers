'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogTrigger, DialogClose } from './dialog'
import { Button } from './button'

/** Confirmación explícita para acciones sensibles (borrar, revocar, publicar). */
export function ConfirmButton({
  title,
  description,
  confirmLabel = 'Confirmar',
  tone = 'danger',
  onConfirm,
  children,
  pending,
}: {
  title: string
  description: string
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  onConfirm: () => void
  children: React.ReactNode
  pending?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title={title} description={description} className="w-[min(28rem,calc(100vw-2rem))]">
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary" type="button">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            variant={tone}
            type="button"
            disabled={pending}
            onClick={() => {
              onConfirm()
              setOpen(false)
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
