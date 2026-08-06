import { cn } from '@shared/lib/cn'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'animate-pulse rounded-xl bg-muted/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:bg-muted/70',
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
