import { Button } from '@shared/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface BootstrapErrorScreenProps {
  message: string
  code?: string
  onRetry: () => void
}

function BootstrapErrorScreen({ message, code, onRetry }: BootstrapErrorScreenProps) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 shadow-[0_8px_24px_rgba(239,68,68,0.08)]">
          <AlertTriangle className="size-8 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">Falha na inicialização</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>

        {code ? (
          <div className="w-full rounded-xl border border-border/70 bg-muted/50 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Código do erro</p>
            <p className="mt-0.5 font-mono text-sm text-foreground">{code}</p>
          </div>
        ) : null}

        <Button onPress={onRetry} variant="outline" size="lg" className="gap-2">
          <RefreshCw className="size-4" data-icon="inline-start" />
          <span>Tentar novamente</span>
        </Button>
      </div>
    </div>
  )
}

export { BootstrapErrorScreen }
export type { BootstrapErrorScreenProps }
