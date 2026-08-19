/**
 * Shared type definitions and constants for the catalog and inventory domain.
 *
 * Contains discriminant constants, request/response interfaces, pagination types,
 * and audit log entry types used across the service layer.
 */

import type {
  categories,
  products,
  stock,
  stockAdjustments,
  stockMovements,
  unitsOfMeasure,
  warehouses
} from '../db/schema'

// ---------------------------------------------------------------------------
// Drizzle inferred types
// ---------------------------------------------------------------------------

export type Category = typeof categories.$inferSelect
export type CategoryInsert = typeof categories.$inferInsert

export type UnitOfMeasure = typeof unitsOfMeasure.$inferSelect
export type UnitOfMeasureInsert = typeof unitsOfMeasure.$inferInsert

export type Product = typeof products.$inferSelect
export type ProductInsert = typeof products.$inferInsert

export type Warehouse = typeof warehouses.$inferSelect
export type WarehouseInsert = typeof warehouses.$inferInsert

export type StockRecord = typeof stock.$inferSelect
export type StockRecordInsert = typeof stock.$inferInsert

export type StockMovement = typeof stockMovements.$inferSelect
export type StockMovementInsert = typeof stockMovements.$inferInsert

export type StockAdjustment = typeof stockAdjustments.$inferSelect
export type StockAdjustmentInsert = typeof stockAdjustments.$inferInsert

// ---------------------------------------------------------------------------
// Discriminant constants
// ---------------------------------------------------------------------------

export const MOVEMENT_TYPES = {
  inbound: 'inbound',
  outbound: 'outbound',
  transfer_in: 'transfer_in',
  transfer_out: 'transfer_out',
  adjustment: 'adjustment'
} as const satisfies Record<string, string>

export type MovementType = (typeof MOVEMENT_TYPES)[keyof typeof MOVEMENT_TYPES]

export const ADJUSTMENT_TYPES = {
  increase: 'increase',
  decrease: 'decrease',
  correction: 'correction'
} as const satisfies Record<string, string>

export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[keyof typeof ADJUSTMENT_TYPES]

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface Pagination {
  limit: number
  offset: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

// ---------------------------------------------------------------------------
// Category request types
// ---------------------------------------------------------------------------

export interface CreateCategoryInput {
  name: string
  parentCategoryId?: number | null
}

export interface UpdateCategoryInput {
  name?: string
  parentCategoryId?: number | null
  status?: 'active' | 'inactive'
}

// ---------------------------------------------------------------------------
// Unit of Measure request types
// ---------------------------------------------------------------------------

export interface CreateUnitInput {
  name: string
  symbol: string
}

export interface UpdateUnitInput {
  name?: string
  symbol?: string
  status?: 'active' | 'inactive'
}

// ---------------------------------------------------------------------------
// Product request types
// ---------------------------------------------------------------------------

export interface CreateProductInput {
  sku: string
  name: string
  description?: string
  barcode?: string
  costPrice?: number
  salePrice?: number
  categoryId?: number | null
  unitId?: number | null
  trackInventory?: boolean
}

export interface UpdateProductInput {
  name?: string
  description?: string
  barcode?: string
  costPrice?: number
  salePrice?: number
  categoryId?: number | null
  unitId?: number | null
  trackInventory?: boolean
  status?: 'active' | 'inactive'
}

// ---------------------------------------------------------------------------
// Warehouse request types
// ---------------------------------------------------------------------------

export interface CreateWarehouseInput {
  name: string
  code: string
  address?: string
}

export interface UpdateWarehouseInput {
  name?: string
  address?: string | null
  status?: 'active' | 'inactive'
}

// ---------------------------------------------------------------------------
// Stock movement request types
// ---------------------------------------------------------------------------

export interface InboundMovementInput {
  productId: number
  warehouseId: number
  quantity: number
  unitCost?: number
  referenceType?: string
  referenceId?: string
  notes?: string
}

export interface OutboundMovementInput {
  productId: number
  warehouseId: number
  quantity: number
  unitCost?: number
  referenceType?: string
  referenceId?: string
  notes?: string
}

export interface TransferInput {
  productId: number
  sourceWarehouseId: number
  destinationWarehouseId: number
  quantity: number
  notes?: string
}

// ---------------------------------------------------------------------------
// Stock adjustment request types
// ---------------------------------------------------------------------------

export interface AdjustmentInput {
  productId: number
  warehouseId: number
  adjustmentType: AdjustmentType
  quantity: number
  unitCost?: number
  reason: string
  notes?: string
  createdByUserId: number
}

// ---------------------------------------------------------------------------
// Product response types
// ---------------------------------------------------------------------------

export interface ProductListItem {
  id: number
  sku: string
  name: string
  categoryName: string | null
  unitSymbol: string | null
  costPrice: number | null
  salePrice: number | null
  trackInventory: boolean
  status: string
}

export interface ProductDetail extends Product {
  categoryName: string | null
  unitName: string | null
  unitSymbol: string | null
}

// ---------------------------------------------------------------------------
// Stock response types
// ---------------------------------------------------------------------------

export interface StockBalance {
  warehouseId: number
  warehouseName: string
  warehouseCode: string
  quantity: number
  reservedQuantity: number
}

export interface WarehouseStockItem {
  productId: number
  productName: string
  productSku: string
  quantity: number
  reservedQuantity: number
}

export interface ReconciliationResult {
  productId: number
  warehouseId: number
  computedBalance: number
  materializedBalance: number
  discrepancy: number
  isConsistent: boolean
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

export interface ProductListFilters extends Pagination {
  categoryId?: number
  status?: string
  search?: string
}

export interface MovementListFilters extends Pagination {
  productId?: number
  warehouseId?: number
  movementType?: MovementType
  startDate?: string
  endDate?: string
}

// ---------------------------------------------------------------------------
// Audit log entry
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  companyId: number
  entityType: string
  entityId: string
  action: string
  userId?: number
  details?: string
}
