import { cn } from '@shared/lib/cn'
import { CheckCircle2Icon, XCircleIcon } from 'lucide-react'
import { match } from 'ts-pattern'

import { Spinner } from './spinner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'failure'

interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus
  responseTimeMs?: number
  error?: string
  className?: string
}

// ---------------------------------------------------------------------------
// ConnectionStatusIndicator
// ---------------------------------------------------------------------------

function ConnectionStatusIndicator({
  status,
  responseTimeMs,
  error,
  className
}: ConnectionStatusIndicatorProps): React.JSX.Element | null {
  return match(status)
    .with('idle', () => null)
    .with('testing', () => (
      <div
        data-slot="connection-status"
        className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}
      >
        <Spinner className="size-3.5" />
        <span>Testando...</span>
      </div>
    ))
    .with('success', () => (
      <div
        data-slot="connection-status"
        className={cn('flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400', className)}
      >
        <CheckCircle2Icon className="size-4" />
        <span>
          Conectado
          {responseTimeMs != null ? ` (${responseTimeMs}ms)` : ''}
        </span>
      </div>
    ))
    .with('failure', () => (
      <div data-slot="connection-status" className={cn('flex items-center gap-2 text-sm text-destructive', className)}>
        <XCircleIcon className="size-4" />
        <span>{error ?? 'Falha na conexão'}</span>
      </div>
    ))
    .exhaustive()
}

export { ConnectionStatusIndicator }
export type { ConnectionStatusIndicatorProps, ConnectionStatus }
