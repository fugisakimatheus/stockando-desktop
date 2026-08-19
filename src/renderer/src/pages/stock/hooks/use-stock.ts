import {
  getProductStock,
  getWarehouseStock,
  recordInbound,
  recordOutbound,
  recordTransfer,
  createAdjustment,
  reconcileStock
} from '@shared/api'
import type {
  StockBalance,
  WarehouseStockItem,
  PaginatedResult,
  Pagination,
  StockMovement,
  InboundMovementInput,
  OutboundMovementInput,
  TransferInput,
  TransferResult,
  AdjustmentInput,
  StockAdjustment,
  ReconciliationResult
} from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const stockKeys = {
  all: (companyId: number) => [companyId, 'stock'] as const,
  product: (companyId: number, productId: number) => [...stockKeys.all(companyId), 'product', productId] as const,
  warehouse: (companyId: number, warehouseId: number, pagination: Pagination) =>
    [...stockKeys.all(companyId), 'warehouse', warehouseId, pagination] as const
}

const stockMovementKeys = {
  all: (companyId: number) => [companyId, 'stock-movements'] as const
}

// ---------------------------------------------------------------------------
// Query Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches stock balances for a product across all warehouses.
 */
function useProductStock(companyId: number, productId: number) {
  return useQuery({
    queryKey: stockKeys.product(companyId, productId),
    queryFn: () => getProductStock(companyId, productId),
    enabled: productId > 0
  })
}

/**
 * Fetches paginated product stock overview at a warehouse.
 */
function useWarehouseOverview(companyId: number, warehouseId: number, pagination: Pagination) {
  return useQuery({
    queryKey: stockKeys.warehouse(companyId, warehouseId, pagination),
    queryFn: () => getWarehouseStock(companyId, warehouseId, pagination),
    enabled: warehouseId > 0
  })
}

// ---------------------------------------------------------------------------
// Mutation Hooks
// ---------------------------------------------------------------------------

/**
 * Records an inbound stock movement.
 * Invalidates stock and stock-movement caches on success.
 */
function useRecordInbound(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: InboundMovementInput) => recordInbound(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockKeys.all(companyId) })
      queryClient.invalidateQueries({ queryKey: stockMovementKeys.all(companyId) })
    }
  })
}

/**
 * Records an outbound stock movement.
 * Invalidates stock and stock-movement caches on success.
 */
function useRecordOutbound(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: OutboundMovementInput) => recordOutbound(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockKeys.all(companyId) })
      queryClient.invalidateQueries({ queryKey: stockMovementKeys.all(companyId) })
    }
  })
}

/**
 * Records a transfer between two warehouses.
 * Invalidates stock and stock-movement caches on success.
 */
function useRecordTransfer(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: TransferInput) => recordTransfer(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockKeys.all(companyId) })
      queryClient.invalidateQueries({ queryKey: stockMovementKeys.all(companyId) })
    }
  })
}

/**
 * Creates a stock adjustment (increase, decrease, or correction).
 * Invalidates stock, stock-movement, and stock-adjustment caches on success.
 */
function useCreateAdjustment(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: AdjustmentInput) => createAdjustment(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockKeys.all(companyId) })
      queryClient.invalidateQueries({ queryKey: stockMovementKeys.all(companyId) })
    }
  })
}

/**
 * Runs a reconciliation check for a product at a warehouse.
 * Returns computed vs. materialized balance comparison.
 */
function useReconcile(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { productId: number; warehouseId: number }) =>
      reconcileStock(companyId, input.productId, input.warehouseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockKeys.all(companyId) })
    }
  })
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  stockKeys,
  useProductStock,
  useWarehouseOverview,
  useRecordInbound,
  useRecordOutbound,
  useRecordTransfer,
  useCreateAdjustment,
  useReconcile
}

export type {
  StockBalance,
  WarehouseStockItem,
  PaginatedResult,
  Pagination,
  StockMovement,
  InboundMovementInput,
  OutboundMovementInput,
  TransferInput,
  TransferResult,
  AdjustmentInput,
  StockAdjustment,
  ReconciliationResult
}
