import {
  listSalesOrders,
  getSalesOrder,
  createSalesOrder,
  updateSalesOrder,
  transitionSalesOrderStatus
} from '@shared/api'
import type {
  SalesOrder,
  SalesOrderDetail,
  SalesOrderDetailItem,
  SalesOrderListItem,
  SalesOrderListFilters,
  SalesOrderStatus,
  CreateSalesOrderInput,
  UpdateSalesOrderInput,
  PaginatedResult
} from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const salesOrderKeys = {
  all: (companyId: number) => [companyId, 'sales-orders'] as const,
  lists: (companyId: number) => [...salesOrderKeys.all(companyId), 'list'] as const,
  list: (companyId: number, filters: SalesOrderListFilters) => [...salesOrderKeys.lists(companyId), filters] as const,
  details: (companyId: number) => [...salesOrderKeys.all(companyId), 'detail'] as const,
  detail: (companyId: number, id: number) => [...salesOrderKeys.details(companyId), id] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated list of sales orders for the given company,
 * supporting filtering by customer, status, payment status, and search term.
 */
function useSalesOrders(companyId: number, filters: SalesOrderListFilters) {
  return useQuery({
    queryKey: salesOrderKeys.list(companyId, filters),
    queryFn: () => listSalesOrders(companyId, filters)
  })
}

/**
 * Fetches a single sales order detail with items, payments, totalPaid, and remainingBalance.
 * Only enabled when orderId is defined.
 */
function useSalesOrderDetail(companyId: number, orderId: number | undefined) {
  return useQuery({
    queryKey: salesOrderKeys.detail(companyId, orderId ?? 0),
    queryFn: () => getSalesOrder(companyId, orderId as number),
    enabled: orderId !== undefined
  })
}

/**
 * Mutation to create a new sales order.
 * Invalidates the sales orders list cache on success.
 */
function useCreateSalesOrder(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateSalesOrderInput) => createSalesOrder(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesOrderKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to update an existing sales order (draft only).
 * Invalidates the sales orders list and detail cache on success.
 */
function useUpdateSalesOrder(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: UpdateSalesOrderInput & { id: number }) => updateSalesOrder(companyId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesOrderKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to transition a sales order to a new status.
 * Invalidates the sales orders cache on success.
 */
function useTransitionSalesOrderStatus(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: SalesOrderStatus }) =>
      transitionSalesOrderStatus(companyId, id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesOrderKeys.all(companyId) })
    }
  })
}

export {
  salesOrderKeys,
  useSalesOrders,
  useSalesOrderDetail,
  useCreateSalesOrder,
  useUpdateSalesOrder,
  useTransitionSalesOrderStatus
}
export type {
  SalesOrder,
  SalesOrderDetail,
  SalesOrderDetailItem,
  SalesOrderListItem,
  SalesOrderListFilters,
  SalesOrderStatus,
  CreateSalesOrderInput,
  UpdateSalesOrderInput,
  PaginatedResult
}
