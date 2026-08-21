import { cn } from '@shared/lib/cn'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { useState } from 'react'
import { match } from 'ts-pattern'

import type { DocumentType } from './status-badge'

// ---------------------------------------------------------------------------
// Transition maps (mirrors src/main/services/status-transitions.ts)
// ---------------------------------------------------------------------------

const QUOTE_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['accepted', 'rejected', 'cancelled'],
  accepted: ['converted'],
  rejected: [],
  converted: [],
  cancelled: []
}

const SALES_ORDER_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['partially_fulfilled', 'fulfilled', 'cancelled'],
  partially_fulfilled: ['fulfilled'],
  fulfilled: [],
  cancelled: []
}

const PURCHASE_ORDER_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['partially_received', 'received', 'cancelled'],
  partially_received: ['received'],
  received: [],
  cancelled: []
}

function getTransitionMap(documentType: DocumentType): Record<string, readonly string[]> {
  return match(documentType)
    .with('quote', () => QUOTE_TRANSITIONS)
    .with('salesOrder', () => SALES_ORDER_TRANSITIONS)
    .with('purchaseOrder', () => PURCHASE_ORDER_TRANSITIONS)
    .exhaustive()
}

// ---------------------------------------------------------------------------
// Transition metadata (labels, visual style, destructive flag)
// ---------------------------------------------------------------------------

interface TransitionMeta {
  label: string
  variant: 'default' | 'secondary' | 'outline' | 'destructive'
  destructive: boolean
}

const TRANSITION_META: Record<string, TransitionMeta> = {
  sent: { label: 'Enviar', variant: 'default', destructive: false },
  confirmed: { label: 'Confirmar', variant: 'default', destructive: false },
  accepted: { label: 'Aceitar', variant: 'default', destructive: false },
  rejected: { label: 'Rejeitar', variant: 'outline', destructive: false },
  converted: { label: 'Converter em Pedido', variant: 'default', destructive: false },
  cancelled: { label: 'Cancelar', variant: 'destructive', destructive: true },
  partially_fulfilled: { label: 'Atendimento Parcial', variant: 'secondary', destructive: false },
  fulfilled: { label: 'Marcar como Atendido', variant: 'default', destructive: false },
  partially_received: { label: 'Recebimento Parcial', variant: 'secondary', destructive: false },
  received: { label: 'Marcar como Recebido', variant: 'default', destructive: false }
}

function getTransitionMeta(targetStatus: string): TransitionMeta {
  return (
    TRANSITION_META[targetStatus] ?? {
      label: targetStatus,
      variant: 'outline' as const,
      destructive: false
    }
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface StatusTransitionActionsProps {
  documentType: DocumentType
  currentStatus: string
  onTransition: (targetStatus: string) => void
  disabled?: boolean
  className?: string
}

function StatusTransitionActions({
  documentType,
  currentStatus,
  onTransition,
  disabled = false,
  className
}: StatusTransitionActionsProps): React.JSX.Element {
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null)

  const transitionMap = getTransitionMap(documentType)
  const validTargets = transitionMap[currentStatus] ?? []

  function handleClick(targetStatus: string): void {
    const meta = getTransitionMeta(targetStatus)
    if (meta.destructive) {
      setConfirmTarget(targetStatus)
    } else {
      onTransition(targetStatus)
    }
  }

  function handleConfirm(): void {
    if (confirmTarget) {
      onTransition(confirmTarget)
      setConfirmTarget(null)
    }
  }

  if (validTargets.length === 0) {
    return <div className={className} />
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {validTargets.map((target) => {
        const meta = getTransitionMeta(target)
        return (
          <Button
            key={target}
            variant={meta.variant}
            size="sm"
            isDisabled={disabled}
            onPress={() => handleClick(target)}
          >
            {meta.label}
          </Button>
        )
      })}

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null)
        }}
        title="Confirmar cancelamento"
        description="Tem certeza que deseja cancelar este documento? Esta ação não pode ser desfeita."
        confirmLabel="Sim, cancelar"
        cancelLabel="Voltar"
        onConfirm={handleConfirm}
        variant="destructive"
      />
    </div>
  )
}

export { StatusTransitionActions }
export type { StatusTransitionActionsProps }
