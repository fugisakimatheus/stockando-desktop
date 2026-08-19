import { cn } from '@shared/lib/cn'
import type { ComponentPropsWithoutRef } from 'react'

import { Spinner } from './spinner'

function LoadingState({
  message,
  className,
  ...props
}: ComponentPropsWithoutRef<'div'> & {
  message?: string
}) {
  return (
    <div
      data-slot="loading-state"
      className={cn('flex flex-col items-center justify-center gap-3 px-6 py-10', className)}
      {...props}
    >
      <Spinner className="size-6" />
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  )
}

export { LoadingState }
