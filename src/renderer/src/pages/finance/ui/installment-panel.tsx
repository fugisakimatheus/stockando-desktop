import type { InstallmentItem, OrderType, SettleInstallmentInput } from '@shared/api'
import { cn } from '@shared/lib/cn'
import { Button } from '@shared/ui/button'
import { EmptyState } from '@shared/ui/empty-state'
import { ErrorState } from '@shared/ui/error-state'
import { FinancialSummaryCard } from '@shared/ui/financial-summary-card'
import { LoadingState } from '@shared/ui/loading-state'
import { BanknoteIcon, CalendarIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { useFinancialAccounts } from '../hooks/use-financial-accounts'
import { useInstallments, useSettleInstallment } from '../hooks/use-installments'
import { InstallmentTimeline } from './installment-timeline'
import { SettlementForm } from './settlement-form'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InstallmentPanelProps {
  companyId: number
  orderType: OrderType
  orderId: number
  className?: string
}

// ---------------------------------------------------------------------------
// InstallmentPanel
// ---------------------------------------------------------------------------

function InstallmentPanel({ companyId, orderType, orderId, className }: InstallmentPanelProps): React.JSX.Element {
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentItem | null>(null)

  const {
    data: summary,
    isLoading: isLoadingSummary,
    isError: isSummaryError,
    refetch: refetchSummary
  } = useInstallments(companyId, orderType, orderId)

  const { data: accounts = [], isLoading: isLoadingAccounts } = useFinancialAccounts(companyId)

  const settleMutation = useSettleInstallment(companyId)

  const handleSettleClick = useCallback((installment: InstallmentItem) => {
    setSelectedInstallment(installment)
  }, [])

  const handleSettlementClose = useCallback(() => {
    setSelectedInstallment(null)
  }, [])

  const handleSettlementSubmit = useCallback(
    (data: SettleInstallmentInput) => {
      if (!selectedInstallment) return

      settleMutation.mutate(
        { id: selectedInstallment.id, ...data },
        {
          onSuccess: () => {
            toast.success('Parcela liquidada com sucesso!')
            setSelectedInstallment(null)
          },
          onError: () => {
            toast.error('Erro ao liquidar parcela. Tente novamente.')
          }
        }
      )
    },
    [selectedInstallment, settleMutation]
  )

  // Loading state
  if (isLoadingSummary) {
    return <LoadingState message="Carregando parcelas..." className={className} />
  }

  // Error state
  if (isSummaryError) {
    return (
      <ErrorState
        title="Erro ao carregar parcelas"
        description="Não foi possível carregar o plano de pagamento."
        onRetry={() => refetchSummary()}
        className={className}
      />
    )
  }

  // Empty state — no payment plan
  if (!summary || summary.installments.length === 0) {
    return (
      <EmptyState
        icon={<CalendarIcon />}
        title="Nenhum plano de pagamento"
        description="Este pedido ainda não possui parcelas cadastradas."
        className={className}
      />
    )
  }

  const pendingInstallments = summary.installments.filter((i) => i.status === 'pending')

  return (
    <div className={cn('space-y-4', className)}>
      {/* Financial summary */}
      <FinancialSummaryCard
        totalExpected={summary.totalExpected}
        totalPaid={summary.totalPaid}
        totalOverdue={summary.totalOverdue}
        remainingBalance={summary.remainingBalance}
        financialStatus={summary.financialStatus}
      />

      {/* Timeline with settlement actions */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">Parcelas</h4>

        <InstallmentTimeline installments={summary.installments} />

        {/* Settlement action buttons for pending installments */}
        {pendingInstallments.length > 0 && (
          <div className="space-y-2 pt-2">
            {pendingInstallments.map((installment) => (
              <div
                key={installment.id}
                className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 dark:border-white/10"
              >
                <span className="text-sm text-muted-foreground">Parcela {installment.installmentNumber}</span>
                <Button variant="outline" size="sm" onPress={() => handleSettleClick(installment)}>
                  <BanknoteIcon data-icon="inline-start" />
                  Liquidar
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settlement dialog */}
      <SettlementForm
        installment={selectedInstallment}
        accounts={accounts}
        onSubmit={handleSettlementSubmit}
        onClose={handleSettlementClose}
        isOpen={selectedInstallment !== null}
        isPending={settleMutation.isPending || isLoadingAccounts}
      />
    </div>
  )
}

export { InstallmentPanel }
export type { InstallmentPanelProps }
