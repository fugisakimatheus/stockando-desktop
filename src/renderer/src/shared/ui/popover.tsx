import { cn } from '@shared/lib/cn'
import * as React from 'react'
import {
  DialogTrigger,
  Heading,
  Popover as PopoverPrimitive,
  type DialogTriggerProps,
  type PopoverProps as PopoverPrimitiveProps
} from 'react-aria-components'

function PopoverTrigger({ children, ...props }: DialogTriggerProps) {
  return (
    <DialogTrigger data-slot="popover-trigger" {...props}>
      {children}
    </DialogTrigger>
  )
}

function Popover({
  className,
  placement = 'bottom',
  offset = 4,
  crossOffset = 0,
  ...props
}: Omit<PopoverPrimitiveProps, 'className'> & {
  className?: string
}) {
  return (
    <PopoverPrimitive
      data-slot="popover-content"
      placement={placement}
      offset={offset}
      crossOffset={crossOffset}
      className={cn(
        'z-50 flex w-72 origin-(--trigger-anchor-point) flex-col gap-2.5 rounded-2xl border border-border/70 bg-popover/95 p-2.5 text-sm text-popover-foreground shadow-[0_16px_45px_rgba(15,23,42,0.16)] ring-1 ring-foreground/10 outline-hidden backdrop-blur-xl duration-100 data-entering:animate-in data-entering:fade-in-0 data-entering:zoom-in-95 data-exiting:animate-out data-exiting:fade-out-0 data-exiting:zoom-out-95 data-[placement=bottom]:slide-in-from-top-2 data-[placement=left]:slide-in-from-right-2 data-[placement=right]:slide-in-from-left-2 data-[placement=top]:slide-in-from-bottom-2 dark:border-white/10 dark:bg-popover/90 dark:shadow-[0_16px_45px_rgba(2,6,23,0.28)]',
        className
      )}
      {...props}
    />
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="popover-header" className={cn('flex flex-col gap-0.5 text-sm', className)} {...props} />
}

function PopoverTitle({ className, ...props }: React.ComponentProps<typeof Heading>) {
  return <Heading data-slot="popover-title" className={cn('font-medium', className)} {...props} />
}

function PopoverDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="popover-description" className={cn('text-muted-foreground', className)} {...props} />
}

export { Popover, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger }
