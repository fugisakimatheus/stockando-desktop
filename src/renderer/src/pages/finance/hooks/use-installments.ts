import { listInstallments, createPaymentPlan, settleInstallment } from '@shared/api'
import type {
  OrderType,
  InstallmentSummary,
  CreatePaymentPlanInput,
  SettleInstallmentInput,
  SettlementResult
} from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const installmentKeys = {
  all: (companyId: number) => [companyId, 'installments'] as const,
  lists: (companyId: number) => [...installmentKeys.all(companyId), 'list'] as const,
  list: (companyId: number, orderType: OrderType, orderId: number) =>
    [...installmentKeys.lists(companyId), orderType, orderId] as const
}

const financialAccountKeys = {
  all: (companyId: number) => [companyId, 'financial-accounts'] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches the installment summary for a given order, including
 * computed totals (totalExpected, totalPaid, totalOverdue) and financial status.
 */
function useInstallments(companyId: number, orderType: OrderType, orderId: number) {
  return useQuery({
    queryKey: installmentKeys.list(companyId, orderType, orderId),
    queryFn: () => listInstallments(companyId, orderType, orderId),
    enabled: orderId > 0
  })
}

/**
 * Mutation to create a payment plan (set of installments) for an order.
 * Invalidates all installment queries on success.
 */
function useCreatePaymentPlan(companyId: number, orderType: OrderType, orderId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreatePaymentPlanInput) => createPaymentPlan(companyId, orderType, orderId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: installmentKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to settle a single installment.
 * Invalidates installment queries and financial account queries on success,
 * since settlement affects account balances.
 */
function useSettleInstallment(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...input }: SettleInstallmentInput & { id: number }) => settleInstallment(companyId, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: installmentKeys.all(companyId) })
      queryClient.invalidateQueries({ queryKey: financialAccountKeys.all(companyId) })
    }
  })
}

export { installmentKeys, financialAccountKeys, useInstallments, useCreatePaymentPlan, useSettleInstallment }
export type { OrderType, InstallmentSummary, CreatePaymentPlanInput, SettleInstallmentInput, SettlementResult }
