import { cn } from '@shared/lib/cn'
import { AlertCircleIcon, RefreshCwIcon } from 'lucide-react'
import type { ComponentPropsWithoutRef } from 'react'

import { Button } from './button'

function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  className,
  ...props
}: ComponentPropsWithoutRef<'div'> & {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div
      data-slot="error-state"
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-gradient-to-br from-destructive/6 via-destructive/4 to-destructive/2 px-6 py-10 text-center shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:border-destructive/15 dark:from-destructive/10 dark:via-destructive/6 dark:to-destructive/3',
        className
      )}
      {...props}
    >
      <div className="mb-3 flex items-center justify-center text-destructive">
        <AlertCircleIcon className="size-10" />
      </div>
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {onRetry ? (
        <div className="mt-4">
          <Button variant="outline" size="sm" onPress={onRetry}>
            <RefreshCwIcon data-icon="inline-start" />
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export { ErrorState }
