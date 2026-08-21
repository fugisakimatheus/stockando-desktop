import { cn } from '@shared/lib/cn'
import { match } from 'ts-pattern'

type FiscalDocumentStatus = 'draft' | 'authorized' | 'cancelled' | 'denied'

interface FiscalStatusBadgeProps {
  status: FiscalDocumentStatus
  className?: string
}

type StatusColorScheme = {
  bg: string
  text: string
  border: string
}

function getFiscalStatusColorScheme(status: FiscalDocumentStatus): StatusColorScheme {
  return match(status)
    .with('draft', () => ({
      bg: 'bg-muted/60 dark:bg-muted/40',
      text: 'text-muted-foreground',
      border: 'border-border/60 dark:border-white/10'
    }))
    .with('authorized', () => ({
      bg: 'bg-green-50 dark:bg-green-950/40',
      text: 'text-green-700 dark:text-green-300',
      border: 'border-green-200/70 dark:border-green-800/50'
    }))
    .with('cancelled', () => ({
      bg: 'bg-red-50 dark:bg-red-950/40',
      text: 'text-red-700 dark:text-red-300',
      border: 'border-red-200/70 dark:border-red-800/50'
    }))
    .with('denied', () => ({
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      text: 'text-rose-800 dark:text-rose-300',
      border: 'border-rose-200/70 dark:border-rose-800/50'
    }))
    .exhaustive()
}

const FISCAL_STATUS_LABELS: Record<FiscalDocumentStatus, string> = {
  draft: 'Rascunho',
  authorized: 'Autorizada',
  cancelled: 'Cancelada',
  denied: 'Denegada'
}

function getFiscalStatusLabel(status: FiscalDocumentStatus): string {
  return FISCAL_STATUS_LABELS[status]
}

function FiscalStatusBadge({ status, className }: FiscalStatusBadgeProps): React.JSX.Element {
  const colors = getFiscalStatusColorScheme(status)
  const label = getFiscalStatusLabel(status)

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

export { FiscalStatusBadge, getFiscalStatusLabel }
export type { FiscalStatusBadgeProps, FiscalDocumentStatus }
