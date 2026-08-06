import { cn } from '@shared/lib/cn'
import { Keyboard as KbdPrimitive } from 'react-aria-components'

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <KbdPrimitive
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-md border border-border/70 bg-muted/80 px-1 font-sans text-xs font-medium text-muted-foreground shadow-[0_2px_8px_rgba(15,23,42,0.04)] select-none in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:border-white/10 dark:bg-muted/70 dark:shadow-[0_2px_8px_rgba(2,6,23,0.16)] [&_svg:not([class*='size-'])]:size-3",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <KbdPrimitive data-slot="kbd-group" className={cn('inline-flex items-center gap-1', className)} {...props} />
}

export { Kbd, KbdGroup }
