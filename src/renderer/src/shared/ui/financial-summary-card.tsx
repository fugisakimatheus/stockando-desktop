import { cn } from '@shared/lib/cn'
import { match } from 'ts-pattern'

type FinancialStatus = 'unpaid' | 'partially_paid' | 'paid'

interface FinancialSummaryCardProps {
  totalExpected: number
  totalPaid: number
  totalOverdue: number
  remainingBalance: number
  financialStatus: FinancialStatus
  className?: string
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

function getStatusIndicator(status: FinancialStatus): { label: string; color: string } {
  return match(status)
    .with('paid', () => ({
      label: 'Pago',
      color: 'text-green-700 dark:text-green-300'
    }))
    .with('partially_paid', () => ({
      label: 'Parcialmente Pago',
      color: 'text-amber-700 dark:text-amber-300'
    }))
    .with('unpaid', () => ({
      label: 'Não Pago',
      color: 'text-muted-foreground'
    }))
    .exhaustive()
}

function FinancialSummaryCard({
  totalExpected,
  totalPaid,
  totalOverdue,
  remainingBalance,
  financialStatus,
  className
}: FinancialSummaryCardProps): React.JSX.Element {
  const statusIndicator = getStatusIndicator(financialStatus)

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 p-4 text-sm shadow-[0_10px_30px_rgba(15,23,42,0.05)] dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 dark:shadow-[0_10px_35px_rgba(2,6,23,0.25)]',
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Resumo Financeiro</h3>
        <span className={cn('text-xs font-medium', statusIndicator.color)}>{statusIndicator.label}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">Total Previsto</p>
          <p className="text-sm font-medium text-foreground">{formatBRL(totalExpected)}</p>
        </div>

        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">Total Pago</p>
          <p className="text-sm font-medium text-green-700 dark:text-green-300">{formatBRL(totalPaid)}</p>
        </div>

        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">Total Vencido</p>
          <p
            className={cn(
              'text-sm font-medium',
              totalOverdue > 0 ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'
            )}
          >
            {formatBRL(totalOverdue)}
          </p>
        </div>

        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">Saldo Restante</p>
          <p className="text-sm font-medium text-foreground">{formatBRL(remainingBalance)}</p>
        </div>
      </div>
    </div>
  )
}

export { FinancialSummaryCard, formatBRL }
export type { FinancialSummaryCardProps, FinancialStatus }
