import { listStockAdjustments, createAdjustment } from '@shared/api'
import type { Pagination, PaginatedResult, StockAdjustment, AdjustmentInput } from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const stockAdjustmentKeys = {
  all: (companyId: number) => [companyId, 'stock-adjustments'] as const,
  lists: (companyId: number) => [...stockAdjustmentKeys.all(companyId), 'list'] as const,
  list: (companyId: number, pagination: Pagination) => [...stockAdjustmentKeys.lists(companyId), pagination] as const
}

// ---------------------------------------------------------------------------
// Query Hook
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated list of stock adjustments.
 *
 * Requirements: 7.1
 */
function useStockAdjustments(companyId: number, pagination: Pagination) {
  return useQuery({
    queryKey: stockAdjustmentKeys.list(companyId, pagination),
    queryFn: () => listStockAdjustments(companyId, pagination)
  })
}

/**
 * Mutation to create a stock adjustment.
 * Invalidates stock-adjustments, stock, and stock-movements caches on success.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
function useCreateStockAdjustment(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: AdjustmentInput) => createAdjustment(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockAdjustmentKeys.all(companyId) })
      queryClient.invalidateQueries({ queryKey: [companyId, 'stock'] })
      queryClient.invalidateQueries({ queryKey: [companyId, 'stock-movements'] })
    }
  })
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { stockAdjustmentKeys, useStockAdjustments, useCreateStockAdjustment }
export type { Pagination, PaginatedResult, StockAdjustment, AdjustmentInput }
