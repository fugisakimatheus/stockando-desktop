import {
  listSalesOrderPayments,
  registerSalesOrderPayment,
  listPurchaseOrderPayments,
  registerPurchaseOrderPayment
} from '@shared/api'
import type { RegisterPaymentInput, PaymentRecord, PaymentSummary } from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { salesOrderKeys } from './use-sales-orders'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const paymentKeys = {
  salesOrder: (companyId: number, orderId: number) => [companyId, 'payments', 'sales-order', orderId] as const,
  purchaseOrder: (companyId: number, purchaseOrderId: number) =>
    [companyId, 'payments', 'purchase-order', purchaseOrderId] as const
}

// ---------------------------------------------------------------------------
// Sales Order Payment Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches the payment summary for a sales order including all payment records,
 * document total, total paid, remaining balance, and payment status.
 * Only enabled when orderId is defined.
 */
function useSalesOrderPayments(companyId: number, orderId: number | undefined) {
  return useQuery({
    queryKey: paymentKeys.salesOrder(companyId, orderId ?? 0),
    queryFn: () => listSalesOrderPayments(companyId, orderId as number),
    enabled: orderId !== undefined
  })
}

/**
 * Mutation to register a payment against a sales order.
 * Invalidates the payment keys AND the parent sales order detail on success.
 */
function useRegisterSalesOrderPayment(companyId: number, orderId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: RegisterPaymentInput) => registerSalesOrderPayment(companyId, orderId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.salesOrder(companyId, orderId) })
      queryClient.invalidateQueries({ queryKey: salesOrderKeys.detail(companyId, orderId) })
    }
  })
}

// ---------------------------------------------------------------------------
// Purchase Order Payment Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches the payment summary for a purchase order including all payment records,
 * document total, total paid, remaining balance, and payment status.
 * Only enabled when purchaseOrderId is defined.
 */
function usePurchaseOrderPayments(companyId: number, purchaseOrderId: number | undefined) {
  return useQuery({
    queryKey: paymentKeys.purchaseOrder(companyId, purchaseOrderId ?? 0),
    queryFn: () => listPurchaseOrderPayments(companyId, purchaseOrderId as number),
    enabled: purchaseOrderId !== undefined
  })
}

/**
 * Mutation to register a payment against a purchase order.
 * Invalidates the payment keys AND the parent purchase order detail on success.
 */
function useRegisterPurchaseOrderPayment(companyId: number, purchaseOrderId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: RegisterPaymentInput) => registerPurchaseOrderPayment(companyId, purchaseOrderId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: paymentKeys.purchaseOrder(companyId, purchaseOrderId)
      })
      queryClient.invalidateQueries({
        queryKey: [companyId, 'purchase-orders', 'detail', purchaseOrderId]
      })
    }
  })
}

export {
  paymentKeys,
  useSalesOrderPayments,
  useRegisterSalesOrderPayment,
  usePurchaseOrderPayments,
  useRegisterPurchaseOrderPayment
}
export type { RegisterPaymentInput, PaymentRecord, PaymentSummary }
