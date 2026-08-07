import { cn } from '@shared/lib/cn'
import type { ComponentPropsWithoutRef } from 'react'

function Stack({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('flex flex-col gap-4', className)} {...props} />
}

function Row({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('flex flex-wrap items-center gap-3', className)} {...props} />
}

function Grid({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3', className)} {...props} />
}

export { Grid, Row, Stack }
