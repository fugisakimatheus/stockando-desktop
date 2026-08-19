import { cn } from '@shared/lib/cn'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2Icon } from 'lucide-react'
import type * as React from 'react'
import {
  Button as ButtonPrimitive,
  Link as LinkPrimitive,
  type ButtonProps as ButtonPrimitiveProps,
  type LinkProps as LinkPrimitiveProps
} from 'react-aria-components'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap shadow-[0_8px_20px_rgba(15,23,42,0.06)] backdrop-blur-sm transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:shadow-[0_8px_24px_rgba(2,6,23,0.28)] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'border-primary/10 bg-gradient-to-br from-primary to-primary/90 text-primary-foreground shadow-[0_10px_24px_rgba(15,23,42,0.12)] hover:shadow-[0_12px_30px_rgba(15,23,42,0.16)] dark:from-primary/62 dark:to-primary/48',
        outline:
          'border-border/80 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 text-foreground shadow-[0_6px_16px_rgba(15,23,42,0.05)] backdrop-blur-sm hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 dark:shadow-[0_8px_24px_rgba(2,6,23,0.2)]',
        secondary:
          'border-primary/15 bg-gradient-to-br from-primary/10 to-primary/6 text-primary shadow-[0_6px_16px_rgba(15,23,42,0.05)] hover:from-primary/12 hover:to-primary/8 hover:text-primary aria-expanded:from-primary/12 aria-expanded:to-primary/8 dark:from-primary/10 dark:to-primary/6 dark:text-primary-foreground dark:shadow-[0_8px_24px_rgba(2,6,23,0.18)]',
        ghost:
          'border-transparent bg-transparent text-foreground shadow-none hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
        destructive:
          'border-destructive/20 bg-destructive/10 text-destructive shadow-[0_8px_20px_rgba(15,23,42,0.06)] hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'border-transparent bg-transparent text-primary underline-offset-4 shadow-none hover:underline'
      },
      size: {
        default: 'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  isLoading = false,
  isDisabled,
  children,
  ...props
}: Omit<ButtonPrimitiveProps, 'className'> &
  React.RefAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    className?: string
    isLoading?: boolean
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      isDisabled={isLoading || isDisabled}
      aria-busy={isLoading || undefined}
      className={cn(buttonVariants({ variant, size, className }), isLoading && 'relative')}
      {...props}
    >
      {(renderProps) => {
        const content = typeof children === 'function' ? children(renderProps) : children
        return isLoading ? (
          <>
            <span className="absolute inset-0 flex items-center justify-center">
              <Loader2Icon data-slot="spinner" className="size-4 animate-spin" aria-hidden="true" />
            </span>
            <span className="invisible inline-flex items-center gap-1.5">{content}</span>
          </>
        ) : (
          content
        )
      }}
    </ButtonPrimitive>
  )
}

function LinkButton({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: Omit<LinkPrimitiveProps, 'className'> &
  VariantProps<typeof buttonVariants> & {
    className?: string
  }) {
  return (
    <LinkPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, LinkButton, buttonVariants }
