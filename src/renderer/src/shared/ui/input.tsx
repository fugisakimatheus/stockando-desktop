'use client'

import { cn } from '@shared/lib/cn'
import * as React from 'react'
import { composeRenderProps, Input as InputPrimitive } from 'react-aria-components'

function Input({ className, type, ...props }: React.ComponentProps<typeof InputPrimitive>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={composeRenderProps(className, (className) =>
        cn(
          'h-9 w-full min-w-0 rounded-xl border border-border/80 bg-gradient-to-br from-background/90 via-background/80 to-background/70 px-3 py-2 text-base shadow-[0_4px_12px_rgba(15,23,42,0.04)] backdrop-blur-sm transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:border-white/10 dark:from-background/80 dark:via-background/70 dark:to-background/60 dark:shadow-[0_4px_14px_rgba(2,6,23,0.18)] dark:disabled:bg-muted/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
          className
        )
      )}
      {...props}
    />
  )
}

export { Input }
