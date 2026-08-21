import type { InstallmentItem } from '@shared/api'
import { cn } from '@shared/lib/cn'
import { CheckCircle2Icon, CircleDotIcon, AlertCircleIcon } from 'lucide-react'
import { match } from 'ts-pattern'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InstallmentTimelineProps {
  installments: InstallmentItem[]
  className?: string
}

type TimelineStatus = 'paid' | 'overdue' | 'pending'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDate(iso: string): string {
  const date = new Date(iso + 'T00:00:00')
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function resolveStatus(installment: InstallmentItem): TimelineStatus {
  if (installment.status === 'paid') return 'paid'
  if (installment.isOverdue) return 'overdue'
  return 'pending'
}

function getStatusIndicator(status: TimelineStatus): {
  icon: typeof CheckCircle2Icon
  dotClass: string
  lineClass: string
} {
  return match(status)
    .with('paid', () => ({
      icon: CheckCircle2Icon,
      dotClass: 'text-green-600 dark:text-green-400',
      lineClass: 'bg-green-300 dark:bg-green-700'
    }))
    .with('overdue', () => ({
      icon: AlertCircleIcon,
      dotClass: 'text-red-600 dark:text-red-400',
      lineClass: 'bg-red-300 dark:bg-red-700'
    }))
    .with('pending', () => ({
      icon: CircleDotIcon,
      dotClass: 'text-muted-foreground',
      lineClass: 'bg-border dark:bg-white/10'
    }))
    .exhaustive()
}

function getStatusLabel(status: TimelineStatus): string {
  return match(status)
    .with('paid', () => 'Pago')
    .with('overdue', () => 'Vencido')
    .with('pending', () => 'Pendente')
    .exhaustive()
}

function getStatusBadgeClass(status: TimelineStatus): string {
  return match(status)
    .with(
      'paid',
      () =>
        'border-green-200/70 bg-green-50 text-green-700 dark:border-green-800/50 dark:bg-green-950/40 dark:text-green-300'
    )
    .with(
      'overdue',
      () => 'border-red-200/70 bg-red-50 text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300'
    )
    .with('pending', () => 'border-border/60 bg-muted/60 text-muted-foreground dark:border-white/10 dark:bg-muted/40')
    .exhaustive()
}

// ---------------------------------------------------------------------------
// InstallmentTimeline
// ---------------------------------------------------------------------------

function InstallmentTimeline({ installments, className }: InstallmentTimelineProps): React.JSX.Element {
  if (installments.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-8 text-sm text-muted-foreground', className)}>
        Nenhuma parcela encontrada.
      </div>
    )
  }

  return (
    <div className={cn('relative', className)} role="list" aria-label="Timeline de parcelas">
      {installments.map((installment, index) => {
        const status = resolveStatus(installment)
        const indicator = getStatusIndicator(status)
        const Icon = indicator.icon
        const isLast = index === installments.length - 1

        return (
          <div key={installment.id} className="relative flex gap-3 pb-4 last:pb-0" role="listitem">
            {/* Vertical line connector */}
            <div className="flex flex-col items-center">
              <Icon className={cn('size-5 shrink-0', indicator.dotClass)} aria-hidden="true" />
              {!isLast && (
                <div className={cn('mt-1 w-0.5 flex-1 rounded-full', indicator.lineClass)} aria-hidden="true" />
              )}
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col gap-1 pb-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">Parcela {installment.installmentNumber}</span>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                    getStatusBadgeClass(status)
                  )}
                >
                  {getStatusLabel(status)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground tabular-nums">{formatCurrency(installment.amount)}</span>
                <span className="text-xs text-muted-foreground">
                  {status === 'paid' && installment.settledAt
                    ? `Pago em ${formatDate(installment.settledAt)}`
                    : `Vence em ${formatDate(installment.dueDate)}`}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export { InstallmentTimeline }
export type { InstallmentTimelineProps }
