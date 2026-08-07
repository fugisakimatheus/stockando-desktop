import { cn } from '@shared/lib/cn'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

function EmptyState({
  title,
  description,
  action,
  className,
  ...props
}: ComponentPropsWithoutRef<'div'> & {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-gradient-to-br from-primary/8 via-primary/5 to-primary/2 px-6 py-10 text-center shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:border-white/10',
        className
      )}
      {...props}
    >
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
