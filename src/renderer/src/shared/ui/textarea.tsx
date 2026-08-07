import { cn } from '@shared/lib/cn'
import * as React from 'react'
import { composeRenderProps, TextArea as TextareaPrimitive } from 'react-aria-components'

function Textarea({ className, ...props }: React.ComponentProps<typeof TextareaPrimitive>) {
  return (
    <TextareaPrimitive
      data-slot="textarea"
      className={composeRenderProps(className, (className) =>
        cn(
          'flex field-sizing-content min-h-20 w-full rounded-xl border border-border/80 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 px-3 py-2.5 text-base shadow-[0_4px_12px_rgba(15,23,42,0.04)] backdrop-blur-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 dark:shadow-[0_4px_14px_rgba(2,6,23,0.18)] dark:disabled:bg-muted/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
          className
        )
      )}
      {...props}
    />
  )
}

export { Textarea }
