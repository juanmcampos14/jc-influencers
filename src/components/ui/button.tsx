import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/util/format'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-[background-color,color,box-shadow,transform] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Negro con la etiqueta en lima: la firma de JC, y 18:1 de contraste.
        primary: 'bg-brand-600 text-on-brand shadow-sm hover:bg-brand-700',
        secondary: 'bg-surface text-ink-800 border border-ink-300 shadow-xs hover:bg-ink-50 hover:border-ink-400',
        ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
        danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
        subtle: 'bg-ink-100 text-ink-800 hover:bg-ink-200',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4',
        lg: 'h-11 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { buttonVariants }
