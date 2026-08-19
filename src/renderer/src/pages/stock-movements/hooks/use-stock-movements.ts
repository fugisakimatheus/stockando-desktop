import { listStockMovements } from '@shared/api'
import type { MovementListFilters, PaginatedResult, StockMovement } from '@shared/api'
import { useQuery } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const stockMovementKeys = {
  all: (companyId: number) => [companyId, 'stock-movements'] as const,
  lists: (companyId: number) => [...stockMovementKeys.all(companyId), 'list'] as const,
  list: (companyId: number, filters: MovementListFilters) => [...stockMovementKeys.lists(companyId), filters] as const
}

// ---------------------------------------------------------------------------
// Query Hook
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated and filterable list of stock movements.
 * Supports filtering by product, warehouse, movement type, and date range.
 */
function useStockMovements(companyId: number, filters: MovementListFilters) {
  return useQuery({
    queryKey: stockMovementKeys.list(companyId, filters),
    queryFn: () => listStockMovements(companyId, filters)
  })
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { stockMovementKeys, useStockMovements }
export type { MovementListFilters, PaginatedResult, StockMovement }
