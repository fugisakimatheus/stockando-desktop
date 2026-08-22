import { cn } from '@shared/lib/cn'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { SidebarProvider } from './sidebar'

function PageShell({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  sidebar,
  sidebarClassName
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  sidebar?: ReactNode
  sidebarClassName?: string
}) {
  const content = <div className={cn('flex flex-1 flex-col', contentClassName)}>{children}</div>

  const body = sidebar ? (
    <div className="flex flex-1 flex-col gap-4 lg:flex-row">
      <aside className={cn('w-full shrink-0 lg:w-72', sidebarClassName)}>{sidebar}</aside>
      <div className="flex min-w-0 flex-1 flex-col">{content}</div>
    </div>
  ) : (
    content
  )

  const shellContent = (
    <>
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 p-4 shadow-[0_10px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 dark:shadow-[0_10px_45px_rgba(2,6,23,0.35)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            {title ? <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1> : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      </div>
      {body}
    </>
  )

  return (
    <div
      className={cn(
        'flex flex-1 flex-col gap-6 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.05),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.025),_transparent_34%)] p-6 dark:bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.08),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(96,165,250,0.04),_transparent_34%)]',
        className
      )}
    >
      {sidebar ? <SidebarProvider defaultOpen>{shellContent}</SidebarProvider> : shellContent}
    </div>
  )
}

interface PageSectionProps extends ComponentPropsWithoutRef<'section'> {
  title?: string
  description?: string
}

function PageSection({ title, description, className, children, ...props }: PageSectionProps) {
  return (
    <section
      className={cn(
        'flex flex-col gap-4 rounded-2xl border border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur-sm dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 dark:shadow-[0_10px_35px_rgba(2,6,23,0.25)]',
        className
      )}
      {...props}
    >
      {(title || description) && (
        <div className="space-y-1">
          {title && <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

function PageWidget({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] backdrop-blur-sm dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3',
        className
      )}
      {...props}
    />
  )
}

export { PageSection, PageSection as Section, PageShell, PageWidget }
