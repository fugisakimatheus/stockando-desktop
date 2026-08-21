import { cn } from '@shared/lib/cn'
import { ReceiptIcon } from 'lucide-react'

import { EmptyState } from './empty-state'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentRecord {
  id: number
  amount: number
  paidAt: string
  transactionReference: string | null
  createdAt: string
}

interface PaymentHistoryProps {
  payments: readonly PaymentRecord[]
  documentTotal: number
  totalPaid: number
  remainingBalance: number
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date)
}

// ---------------------------------------------------------------------------
// PaymentHistory
// ---------------------------------------------------------------------------

function PaymentHistory({
  payments,
  documentTotal,
  totalPaid,
  remainingBalance,
  className
}: PaymentHistoryProps): React.JSX.Element {
  return (
    <div className={cn('grid gap-4', className)}>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Total do documento" value={formatCurrency(documentTotal)} />
        <SummaryCard label="Total pago" value={formatCurrency(totalPaid)} variant="success" />
        <SummaryCard label="Saldo restante" value={formatCurrency(remainingBalance)} variant="warning" />
      </div>

      {/* Payment list */}
      {payments.length === 0 ? (
        <EmptyState
          icon={<ReceiptIcon />}
          title="Nenhum pagamento registrado"
          description="Os pagamentos registrados aparecerão aqui."
        />
      ) : (
        <div className="rounded-xl border border-border/70 dark:border-white/10">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground dark:border-white/10">
            <span>Data</span>
            <span className="text-right">Valor</span>
            <span className="text-right">Referência</span>
          </div>
          <ul className="divide-y divide-border/50 dark:divide-white/5">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2.5 transition-colors hover:bg-muted/30"
              >
                <span className="text-sm text-foreground">{formatDate(payment.paidAt)}</span>
                <span className="text-sm font-medium text-foreground">{formatCurrency(payment.amount)}</span>
                <span className="truncate text-right text-sm text-muted-foreground">
                  {payment.transactionReference || '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SummaryCard (internal)
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  variant = 'default'
}: {
  label: string
  value: string
  variant?: 'default' | 'success' | 'warning'
}): React.JSX.Element {
  const valueColor = {
    default: 'text-foreground',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400'
  }[variant]

  return (
    <div className="rounded-xl border border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 px-3 py-2.5 dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-semibold', valueColor)}>{value}</p>
    </div>
  )
}

export { PaymentHistory }
export type { PaymentHistoryProps, PaymentRecord }
