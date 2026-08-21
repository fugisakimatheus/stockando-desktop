import {
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  transitionPurchaseOrderStatus,
  recordPurchaseOrderReceipt
} from '@shared/api'
import type {
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderListItem,
  PurchaseOrderListFilters,
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  PurchaseOrderStatus,
  ReceiptInput,
  CommercialPaginatedResult
} from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const purchaseOrderKeys = {
  all: (companyId: number) => [companyId, 'purchase-orders'] as const,
  lists: (companyId: number) => [...purchaseOrderKeys.all(companyId), 'list'] as const,
  list: (companyId: number, filters: PurchaseOrderListFilters) =>
    [...purchaseOrderKeys.lists(companyId), filters] as const,
  details: (companyId: number) => [...purchaseOrderKeys.all(companyId), 'detail'] as const,
  detail: (companyId: number, id: number) => [...purchaseOrderKeys.details(companyId), id] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated list of purchase orders for the given company,
 * supporting filtering by supplier, status, payment status, and search term.
 */
function usePurchaseOrders(companyId: number, filters: PurchaseOrderListFilters) {
  return useQuery({
    queryKey: purchaseOrderKeys.list(companyId, filters),
    queryFn: () => listPurchaseOrders(companyId, filters)
  })
}

/**
 * Fetches a single purchase order detail with items, payments, and computed balances.
 * Only enabled when purchaseOrderId is defined.
 */
function usePurchaseOrderDetail(companyId: number, purchaseOrderId: number | undefined) {
  return useQuery({
    queryKey: purchaseOrderKeys.detail(companyId, purchaseOrderId ?? 0),
    queryFn: () => getPurchaseOrder(companyId, purchaseOrderId as number),
    enabled: purchaseOrderId !== undefined
  })
}

/**
 * Mutation to create a new purchase order.
 * Invalidates the purchase orders list cache on success.
 */
function useCreatePurchaseOrder(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreatePurchaseOrderInput) => createPurchaseOrder(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to update an existing purchase order (draft only).
 * Invalidates the purchase orders list and detail cache on success.
 */
function useUpdatePurchaseOrder(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: UpdatePurchaseOrderInput & { id: number }) =>
      updatePurchaseOrder(companyId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to transition a purchase order's status.
 * Invalidates the purchase orders cache on success.
 */
function useTransitionPurchaseOrderStatus(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: PurchaseOrderStatus }) =>
      transitionPurchaseOrderStatus(companyId, id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to record a receipt of items against a purchase order.
 * Invalidates both the purchase order detail and stock queries on success,
 * since receipts generate inbound stock movements.
 */
function useRecordReceipt(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...input }: ReceiptInput & { id: number }) => recordPurchaseOrderReceipt(companyId, id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: purchaseOrderKeys.detail(companyId, variables.id)
      })
      queryClient.invalidateQueries({
        queryKey: purchaseOrderKeys.lists(companyId)
      })
      queryClient.invalidateQueries({
        queryKey: [companyId, 'stock']
      })
    }
  })
}

export {
  purchaseOrderKeys,
  usePurchaseOrders,
  usePurchaseOrderDetail,
  useCreatePurchaseOrder,
  useUpdatePurchaseOrder,
  useTransitionPurchaseOrderStatus,
  useRecordReceipt
}
export type {
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderListItem,
  PurchaseOrderListFilters,
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  PurchaseOrderStatus,
  ReceiptInput,
  CommercialPaginatedResult as PaginatedResult
}
