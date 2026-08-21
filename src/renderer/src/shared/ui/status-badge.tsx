import { cn } from '@shared/lib/cn'
import { match } from 'ts-pattern'

type DocumentType = 'quote' | 'salesOrder' | 'purchaseOrder'

interface StatusBadgeProps {
  status: string
  variant?: DocumentType
  className?: string
}

type StatusColorScheme = {
  bg: string
  text: string
  border: string
}

function getStatusColorScheme(status: string): StatusColorScheme {
  return match(status)
    .with('draft', () => ({
      bg: 'bg-muted/60 dark:bg-muted/40',
      text: 'text-muted-foreground',
      border: 'border-border/60 dark:border-white/10'
    }))
    .with('sent', () => ({
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      text: 'text-blue-700 dark:text-blue-300',
      border: 'border-blue-200/70 dark:border-blue-800/50'
    }))
    .with('confirmed', () => ({
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      text: 'text-blue-700 dark:text-blue-300',
      border: 'border-blue-200/70 dark:border-blue-800/50'
    }))
    .with('accepted', () => ({
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-200/70 dark:border-amber-800/50'
    }))
    .with('partially_fulfilled', () => ({
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-200/70 dark:border-amber-800/50'
    }))
    .with('partially_received', () => ({
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-200/70 dark:border-amber-800/50'
    }))
    .with('fulfilled', () => ({
      bg: 'bg-green-50 dark:bg-green-950/40',
      text: 'text-green-700 dark:text-green-300',
      border: 'border-green-200/70 dark:border-green-800/50'
    }))
    .with('received', () => ({
      bg: 'bg-green-50 dark:bg-green-950/40',
      text: 'text-green-700 dark:text-green-300',
      border: 'border-green-200/70 dark:border-green-800/50'
    }))
    .with('converted', () => ({
      bg: 'bg-green-50 dark:bg-green-950/40',
      text: 'text-green-700 dark:text-green-300',
      border: 'border-green-200/70 dark:border-green-800/50'
    }))
    .with('paid', () => ({
      bg: 'bg-green-50 dark:bg-green-950/40',
      text: 'text-green-700 dark:text-green-300',
      border: 'border-green-200/70 dark:border-green-800/50'
    }))
    .with('rejected', () => ({
      bg: 'bg-red-50 dark:bg-red-950/40',
      text: 'text-red-700 dark:text-red-300',
      border: 'border-red-200/70 dark:border-red-800/50'
    }))
    .with('cancelled', () => ({
      bg: 'bg-red-50 dark:bg-red-950/40',
      text: 'text-red-700 dark:text-red-300',
      border: 'border-red-200/70 dark:border-red-800/50'
    }))
    .otherwise(() => ({
      bg: 'bg-muted/60 dark:bg-muted/40',
      text: 'text-muted-foreground',
      border: 'border-border/60 dark:border-white/10'
    }))
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  confirmed: 'Confirmado',
  accepted: 'Aceito',
  rejected: 'Rejeitado',
  converted: 'Convertido',
  cancelled: 'Cancelado',
  partially_fulfilled: 'Parc. Atendido',
  fulfilled: 'Atendido',
  partially_received: 'Parc. Recebido',
  received: 'Recebido',
  paid: 'Pago',
  unpaid: 'Não Pago',
  partially_paid: 'Parc. Pago'
}

function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

function StatusBadge({ status, className }: StatusBadgeProps): React.JSX.Element {
  const colors = getStatusColorScheme(status)
  const label = getStatusLabel(status)

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        colors.bg,
        colors.text,
        colors.border,
        className
      )}
    >
      {label}
    </span>
  )
}

export { StatusBadge, getStatusLabel }
export type { StatusBadgeProps, DocumentType }
