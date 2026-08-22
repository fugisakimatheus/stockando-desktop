import {
  createSalesOrder,
  getSalesOrder,
  listSalesOrders,
  transitionSalesOrderStatus,
  updateSalesOrder
} from '@shared/api'
import type {
  CreateSalesOrderInput,
  PaginatedResult,
  SalesOrder,
  SalesOrderDetail,
  SalesOrderDetailItem,
  SalesOrderListFilters,
  SalesOrderListItem,
  SalesOrderStatus,
  UpdateSalesOrderInput
} from '@shared/api'
import { createPaginatedQueryHooks } from '@shared/lib'
import { useMutation, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Generated hooks via factory
// ---------------------------------------------------------------------------

const {
  keys: salesOrderKeys,
  useList: useSalesOrders,
  useDetail: useSalesOrderDetail,
  useCreate: useCreateSalesOrder,
  useUpdate: useUpdateSalesOrder
} = createPaginatedQueryHooks<
  SalesOrderListItem,
  SalesOrderDetail,
  SalesOrderListFilters,
  CreateSalesOrderInput,
  UpdateSalesOrderInput,
  SalesOrderDetail,
  SalesOrderDetail
>({
  domain: 'sales-orders',
  list: (companyId, filters) => listSalesOrders(companyId, filters),
  detail: (companyId, id) => getSalesOrder(companyId, id),
  create: (companyId, input) => createSalesOrder(companyId, input),
  update: (companyId, id, data) => updateSalesOrder(companyId, id, data)
})

// ---------------------------------------------------------------------------
// Custom hook: status transition (not covered by generic factory)
// ---------------------------------------------------------------------------

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
  useCreateSalesOrder,
  useSalesOrderDetail,
  useSalesOrders,
  useTransitionSalesOrderStatus,
  useUpdateSalesOrder
}
export type {
  CreateSalesOrderInput,
  PaginatedResult,
  SalesOrder,
  SalesOrderDetail,
  SalesOrderDetailItem,
  SalesOrderListFilters,
  SalesOrderListItem,
  SalesOrderStatus,
  UpdateSalesOrderInput
}
