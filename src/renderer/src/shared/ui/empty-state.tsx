import { cn } from '@shared/lib/cn'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: ComponentPropsWithoutRef<'div'> & {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 px-6 py-14 text-center',
        'bg-gradient-to-b from-muted/30 via-transparent to-transparent',
        'dark:border-white/8 dark:from-white/[0.02]',
        className
      )}
      {...props}
    >
      {icon ? (
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground/70 ring-1 ring-border/50 dark:bg-white/5 dark:ring-white/8 [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="text-[13px] leading-relaxed text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
