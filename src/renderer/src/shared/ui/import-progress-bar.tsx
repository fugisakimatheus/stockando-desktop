import { cn } from '@shared/lib/cn'
import { FileSearchIcon, UploadIcon } from 'lucide-react'
import type { ComponentPropsWithoutRef } from 'react'

type ImportPhase = 'validating' | 'importing'

interface ImportProgressBarProps extends ComponentPropsWithoutRef<'div'> {
  phase: ImportPhase
  progress: number
  message?: string
}

const PHASE_CONFIG = {
  validating: {
    label: 'Validating',
    icon: FileSearchIcon
  },
  importing: {
    label: 'Importing',
    icon: UploadIcon
  }
} as const

function ImportProgressBar({ phase, progress, message, className, ...props }: ImportProgressBarProps) {
  const config = PHASE_CONFIG[phase]
  const Icon = config.icon
  const clampedProgress = Math.max(0, Math.min(100, progress))

  return (
    <div
      data-slot="import-progress-bar"
      className={cn(
        'rounded-2xl border border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3',
        className
      )}
      {...props}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Icon className="size-4 text-primary" />
          <span>{config.label}</span>
        </div>
        <span className="text-sm font-medium text-muted-foreground tabular-nums">{Math.round(clampedProgress)}%</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted/60 dark:bg-muted/40">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-300 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>

      {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
    </div>
  )
}

export { ImportProgressBar }
export type { ImportProgressBarProps, ImportPhase }
