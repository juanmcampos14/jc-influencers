import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/util/format'

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('text-sm font-medium text-ink-700', className)}
      {...props}
    />
  )
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400',
        'disabled:cursor-not-allowed disabled:bg-ink-100',
        'aria-[invalid=true]:border-rose-500',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-[80px] w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400',
        'aria-[invalid=true]:border-rose-500',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 w-full rounded-lg border border-ink-300 bg-white px-2 text-sm text-ink-900',
        className,
      )}
      {...props}
    />
  )
}

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn('size-4 rounded border-ink-300 text-brand-600 accent-[oklch(0.51_0.17_262)]', className)}
      {...props}
    />
  )
}

type FieldProps = {
  label: string
  htmlFor?: string
  hint?: string
  errors?: string[]
  required?: boolean
  children: React.ReactNode
  className?: string
}

/** Campo de formulario con etiqueta, ayuda y error, siempre asociados por id. */
export function Field({ label, htmlFor, hint, errors, required, children, className }: FieldProps) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-rose-600" aria-hidden="true">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-ink-500">{hint}</p> : null}
      {errors && errors.length > 0 ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-rose-600">
          {errors.join(' ')}
        </p>
      ) : null}
    </div>
  )
}
