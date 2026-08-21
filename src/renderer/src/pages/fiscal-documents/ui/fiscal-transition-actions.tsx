import type { FiscalDocumentStatus } from '@shared/api'
import { cn } from '@shared/lib/cn'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { FileTextIcon, SendIcon, XCircleIcon } from 'lucide-react'
import { useState } from 'react'
import { match } from 'ts-pattern'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FiscalTransitionActionsProps {
  status: FiscalDocumentStatus
  onAuthorize?: () => void
  onCancel?: () => void
  onGenerateDanfe?: () => void
  isLoading?: boolean
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function FiscalTransitionActions({
  status,
  onAuthorize,
  onCancel,
  onGenerateDanfe,
  isLoading = false,
  className
}: FiscalTransitionActionsProps): React.JSX.Element {
  const [confirmAction, setConfirmAction] = useState<'cancel' | null>(null)

  function handleCancelConfirm(): void {
    onCancel?.()
    setConfirmAction(null)
  }

  const actions = match(status)
    .with('draft', () => (
      <Button variant="default" size="sm" isDisabled={isLoading} isLoading={isLoading} onPress={() => onAuthorize?.()}>
        <SendIcon data-icon="inline-start" className="size-3.5" />
        Autorizar
      </Button>
    ))
    .with('authorized', () => (
      <>
        <Button variant="destructive" size="sm" isDisabled={isLoading} onPress={() => setConfirmAction('cancel')}>
          <XCircleIcon data-icon="inline-start" className="size-3.5" />
          Cancelar
        </Button>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={isLoading}
          isLoading={isLoading}
          onPress={() => onGenerateDanfe?.()}
        >
          <FileTextIcon data-icon="inline-start" className="size-3.5" />
          Gerar DANFE
        </Button>
      </>
    ))
    .with('cancelled', () => null)
    .with('denied', () => null)
    .exhaustive()

  if (!actions) {
    return <div className={className} />
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {actions}

      <ConfirmDialog
        open={confirmAction === 'cancel'}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
        title="Cancelar documento fiscal"
        description="Tem certeza que deseja cancelar este documento fiscal? Esta ação não pode ser desfeita e requer justificativa."
        confirmLabel="Sim, cancelar"
        cancelLabel="Voltar"
        onConfirm={handleCancelConfirm}
        variant="destructive"
        isLoading={isLoading}
      />
    </div>
  )
}

export { FiscalTransitionActions }
export type { FiscalTransitionActionsProps }
