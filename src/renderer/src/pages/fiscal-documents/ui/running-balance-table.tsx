import type { TransactionWithBalance } from '@shared/api'
import { cn } from '@shared/lib/cn'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { ArrowDownLeftIcon, ArrowUpRightIcon } from 'lucide-react'
import { match } from 'ts-pattern'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunningBalanceTableProps {
  transactions: TransactionWithBalance[]
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(isoDate))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function RunningBalanceTable({ transactions, className }: RunningBalanceTableProps): React.JSX.Element {
  return (
    <Table className={className} aria-label="Transações financeiras">
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => (
          <TableRow key={tx.id}>
            <TableCell className="text-muted-foreground">{formatDate(tx.transactionDate)}</TableCell>
            <TableCell>{tx.description ?? '—'}</TableCell>
            <TableCell>
              <TransactionTypeBadge type={tx.transactionType} />
            </TableCell>
            <TableCell className="text-right">
              <AmountCell type={tx.transactionType} amount={tx.amount} />
            </TableCell>
            <TableCell className="text-right font-medium">{formatCurrency(tx.runningBalance)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TransactionTypeBadge({ type }: { type: TransactionWithBalance['transactionType'] }): React.JSX.Element {
  return match(type)
    .with('inbound', () => (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
        <ArrowDownLeftIcon className="size-3" />
        Entrada
      </span>
    ))
    .with('outbound', () => (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400">
        <ArrowUpRightIcon className="size-3" />
        Saída
      </span>
    ))
    .exhaustive()
}

function AmountCell({
  type,
  amount
}: {
  type: TransactionWithBalance['transactionType']
  amount: number
}): React.JSX.Element {
  const colorClass = match(type)
    .with('inbound', () => 'text-green-700 dark:text-green-400')
    .with('outbound', () => 'text-red-700 dark:text-red-400')
    .exhaustive()

  return (
    <span className={cn('font-medium', colorClass)}>
      {type === 'outbound' ? '−' : '+'} {formatCurrency(amount)}
    </span>
  )
}

export { RunningBalanceTable }
export type { RunningBalanceTableProps }
