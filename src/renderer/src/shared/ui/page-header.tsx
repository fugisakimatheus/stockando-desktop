import { cn } from '@shared/lib/cn'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

function PageHeaderRoot({ className, children, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-border/70 bg-gradient-to-br from-primary/3 via-primary/2 to-primary/1 p-4 shadow-[0_10px_38px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 dark:shadow-[0_10px_40px_rgba(2,6,23,0.3)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function PageHeaderTitle({ className, ...props }: ComponentPropsWithoutRef<'h2'>) {
  return <h2 className={cn('text-xl font-semibold tracking-tight text-foreground', className)} {...props} />
}

function PageHeaderDescription({ className, ...props }: ComponentPropsWithoutRef<'p'>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}

function PageHeaderActions({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)} {...props} />
}

function PageHeaderContent({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('flex flex-col gap-1', className)} {...props} />
}

function PageHeader({ children, className, ...props }: ComponentPropsWithoutRef<'div'> & { children?: ReactNode }) {
  return (
    <PageHeaderRoot className={className} {...props}>
      {children}
    </PageHeaderRoot>
  )
}

export const PageHeaderCompound = Object.assign(PageHeader, {
  Root: PageHeaderRoot,
  Title: PageHeaderTitle,
  Description: PageHeaderDescription,
  Actions: PageHeaderActions,
  Content: PageHeaderContent
})

export { PageHeaderCompound as PageHeader }
