/**
 * Typed API client helpers for catalog and inventory endpoints.
 *
 * All functions require a `companyId` to enforce company-scoped data isolation
 * via the `x-company-id` header. Types are self-contained — no imports from
 * the main process.
 */

import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Shared types (renderer-side mirror of service types)
// ---------------------------------------------------------------------------

interface Pagination {
  limit: number
  offset: number
}

interface PaginatedResult<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

// ---------------------------------------------------------------------------
// Category types
// ---------------------------------------------------------------------------

interface Category {
  id: number
  companyId: number
  name: string
  parentCategoryId: number | null
  status: string
  createdAt: string
  updatedAt: string
}

interface CreateCategoryInput {
  name: string
  parentCategoryId?: number | null
}

interface UpdateCategoryInput {
  name?: string
  parentCategoryId?: number | null
  status?: 'active' | 'inactive'
}

// ---------------------------------------------------------------------------
// Unit of Measure types
// ---------------------------------------------------------------------------

interface UnitOfMeasure {
  id: number
  companyId: number
  name: string
  symbol: string
  status: string
  createdAt: string
  updatedAt: string
}

interface CreateUnitInput {
  name: string
  symbol: string
}

interface UpdateUnitInput {
  name?: string
  symbol?: string
  status?: 'active' | 'inactive'
}

// ---------------------------------------------------------------------------
// Product types
// ---------------------------------------------------------------------------

interface Product {
  id: number
  companyId: number
  categoryId: number | null
  unitId: number | null
  sku: string
  name: string
  description: string | null
  barcode: string | null
  costPrice: number | null
  salePrice: number | null
  trackInventory: boolean
  status: string
  createdAt: string
  updatedAt: string
}

interface ProductListItem {
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

interface ProductDetail extends Product {
  categoryName: string | null
  unitName: string | null
  unitSymbol: string | null
}

interface CreateProductInput {
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

interface UpdateProductInput {
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

interface ProductListFilters extends Pagination {
  categoryId?: number
  status?: string
  search?: string
}

// ---------------------------------------------------------------------------
// Warehouse types
// ---------------------------------------------------------------------------

interface Warehouse {
  id: number
  companyId: number
  name: string
  code: string
  address: string | null
  status: string
  createdAt: string
  updatedAt: string
}

interface CreateWarehouseInput {
  name: string
  code: string
  address?: string
}

interface UpdateWarehouseInput {
  name?: string
  address?: string | null
  status?: 'active' | 'inactive'
}

// ---------------------------------------------------------------------------
// Stock types
// ---------------------------------------------------------------------------

interface StockBalance {
  warehouseId: number
  warehouseName: string
  warehouseCode: string
  quantity: number
  reservedQuantity: number
}

interface WarehouseStockItem {
  productId: number
  productName: string
  productSku: string
  quantity: number
  reservedQuantity: number
}

interface ReconciliationResult {
  productId: number
  warehouseId: number
  computedBalance: number
  materializedBalance: number
  discrepancy: number
  isConsistent: boolean
}

// ---------------------------------------------------------------------------
// Stock Movement types
// ---------------------------------------------------------------------------

const MOVEMENT_TYPES = {
  inbound: 'inbound',
  outbound: 'outbound',
  transfer_in: 'transfer_in',
  transfer_out: 'transfer_out',
  adjustment: 'adjustment'
} as const

type MovementType = (typeof MOVEMENT_TYPES)[keyof typeof MOVEMENT_TYPES]

interface StockMovement {
  id: number
  companyId: number
  productId: number
  warehouseId: number
  movementType: string
  quantity: number
  unitCost: number | null
  referenceType: string | null
  referenceId: string | null
  notes: string | null
  createdAt: string
}

interface InboundMovementInput {
  productId: number
  warehouseId: number
  quantity: number
  unitCost?: number
  referenceType?: string
  referenceId?: string
  notes?: string
}

interface OutboundMovementInput {
  productId: number
  warehouseId: number
  quantity: number
  unitCost?: number
  referenceType?: string
  referenceId?: string
  notes?: string
}

interface TransferInput {
  productId: number
  sourceWarehouseId: number
  destinationWarehouseId: number
  quantity: number
  notes?: string
}

interface TransferResult {
  source: StockMovement
  destination: StockMovement
}

interface MovementListFilters extends Pagination {
  productId?: number
  warehouseId?: number
  movementType?: MovementType
  startDate?: string
  endDate?: string
}

// ---------------------------------------------------------------------------
// Stock Adjustment types
// ---------------------------------------------------------------------------

const ADJUSTMENT_TYPES = {
  increase: 'increase',
  decrease: 'decrease',
  correction: 'correction'
} as const

type AdjustmentType = (typeof ADJUSTMENT_TYPES)[keyof typeof ADJUSTMENT_TYPES]

interface StockAdjustment {
  id: number
  companyId: number
  productId: number
  warehouseId: number
  adjustmentType: string
  quantity: number
  unitCost: number | null
  reason: string
  notes: string | null
  createdByUserId: number
  createdAt: string
}

interface AdjustmentInput {
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
// Internal helpers
// ---------------------------------------------------------------------------

function companyHeaders(companyId: number): Record<string, string> {
  return { 'x-company-id': String(companyId) }
}

function buildQueryString<T extends object>(params: T): string {
  const parts: string[] = []

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  }

  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

// ---------------------------------------------------------------------------
// Categories API
// ---------------------------------------------------------------------------

function listCategories(companyId: number): Promise<Category[]> {
  return apiClient<Category[]>('/categories', {
    headers: companyHeaders(companyId)
  })
}

function createCategory(companyId: number, input: CreateCategoryInput): Promise<Category> {
  return apiClient<Category>('/categories', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function updateCategory(companyId: number, id: number, input: UpdateCategoryInput): Promise<Category> {
  return apiClient<Category>(`/categories/${id}`, {
    method: 'PUT',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function deleteCategory(companyId: number, id: number): Promise<void> {
  return apiClient<void>(`/categories/${id}`, {
    method: 'DELETE',
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Units of Measure API
// ---------------------------------------------------------------------------

function listUnitsOfMeasure(companyId: number): Promise<UnitOfMeasure[]> {
  return apiClient<UnitOfMeasure[]>('/units-of-measure', {
    headers: companyHeaders(companyId)
  })
}

function createUnit(companyId: number, input: CreateUnitInput): Promise<UnitOfMeasure> {
  return apiClient<UnitOfMeasure>('/units-of-measure', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function updateUnit(companyId: number, id: number, input: UpdateUnitInput): Promise<UnitOfMeasure> {
  return apiClient<UnitOfMeasure>(`/units-of-measure/${id}`, {
    method: 'PUT',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function deleteUnit(companyId: number, id: number): Promise<void> {
  return apiClient<void>(`/units-of-measure/${id}`, {
    method: 'DELETE',
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Products API
// ---------------------------------------------------------------------------

function listProducts(companyId: number, filters: ProductListFilters): Promise<PaginatedResult<ProductListItem>> {
  const query = buildQueryString(filters)
  return apiClient<PaginatedResult<ProductListItem>>(`/products${query}`, {
    headers: companyHeaders(companyId)
  })
}

function getProduct(companyId: number, id: number): Promise<ProductDetail> {
  return apiClient<ProductDetail>(`/products/${id}`, {
    headers: companyHeaders(companyId)
  })
}

function createProduct(companyId: number, input: CreateProductInput): Promise<Product> {
  return apiClient<Product>('/products', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function updateProduct(companyId: number, id: number, input: UpdateProductInput): Promise<Product> {
  return apiClient<Product>(`/products/${id}`, {
    method: 'PUT',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function deleteProduct(companyId: number, id: number): Promise<void> {
  return apiClient<void>(`/products/${id}`, {
    method: 'DELETE',
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Warehouses API
// ---------------------------------------------------------------------------

function listWarehouses(companyId: number): Promise<Warehouse[]> {
  return apiClient<Warehouse[]>('/warehouses', {
    headers: companyHeaders(companyId)
  })
}

function createWarehouse(companyId: number, input: CreateWarehouseInput): Promise<Warehouse> {
  return apiClient<Warehouse>('/warehouses', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function updateWarehouse(companyId: number, id: number, input: UpdateWarehouseInput): Promise<Warehouse> {
  return apiClient<Warehouse>(`/warehouses/${id}`, {
    method: 'PUT',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function deleteWarehouse(companyId: number, id: number): Promise<void> {
  return apiClient<void>(`/warehouses/${id}`, {
    method: 'DELETE',
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Stock API
// ---------------------------------------------------------------------------

function getProductStock(companyId: number, productId: number): Promise<StockBalance[]> {
  return apiClient<StockBalance[]>(`/stock/product/${productId}`, {
    headers: companyHeaders(companyId)
  })
}

function getWarehouseStock(
  companyId: number,
  warehouseId: number,
  pagination?: Pagination
): Promise<PaginatedResult<WarehouseStockItem>> {
  const query = pagination ? buildQueryString(pagination) : ''
  return apiClient<PaginatedResult<WarehouseStockItem>>(`/stock/warehouse/${warehouseId}${query}`, {
    headers: companyHeaders(companyId)
  })
}

function reconcileStock(companyId: number, productId: number, warehouseId: number): Promise<ReconciliationResult> {
  return apiClient<ReconciliationResult>('/stock/reconcile', {
    method: 'POST',
    body: { productId, warehouseId },
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Stock Movements API
// ---------------------------------------------------------------------------

function listStockMovements(companyId: number, filters: MovementListFilters): Promise<PaginatedResult<StockMovement>> {
  const query = buildQueryString(filters)
  return apiClient<PaginatedResult<StockMovement>>(`/stock-movements${query}`, {
    headers: companyHeaders(companyId)
  })
}

function recordInbound(companyId: number, input: InboundMovementInput): Promise<StockMovement> {
  return apiClient<StockMovement>('/stock-movements/inbound', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function recordOutbound(companyId: number, input: OutboundMovementInput): Promise<StockMovement> {
  return apiClient<StockMovement>('/stock-movements/outbound', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function recordTransfer(companyId: number, input: TransferInput): Promise<TransferResult> {
  return apiClient<TransferResult>('/stock-movements/transfer', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Stock Adjustments API
// ---------------------------------------------------------------------------

function listStockAdjustments(companyId: number, pagination: Pagination): Promise<PaginatedResult<StockAdjustment>> {
  const query = buildQueryString(pagination)
  return apiClient<PaginatedResult<StockAdjustment>>(`/stock-adjustments${query}`, {
    headers: companyHeaders(companyId)
  })
}

function createAdjustment(companyId: number, input: AdjustmentInput): Promise<StockAdjustment> {
  return apiClient<StockAdjustment>('/stock-adjustments', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  // Categories
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  // Units of Measure
  listUnitsOfMeasure,
  createUnit,
  updateUnit,
  deleteUnit,
  // Products
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  // Warehouses
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  // Stock
  getProductStock,
  getWarehouseStock,
  reconcileStock,
  // Stock Movements
  listStockMovements,
  recordInbound,
  recordOutbound,
  recordTransfer,
  // Stock Adjustments
  listStockAdjustments,
  createAdjustment,
  // Constants
  MOVEMENT_TYPES,
  ADJUSTMENT_TYPES
}

export type {
  // Shared
  Pagination,
  PaginatedResult,
  // Categories
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  // Units of Measure
  UnitOfMeasure,
  CreateUnitInput,
  UpdateUnitInput,
  // Products
  Product,
  ProductListItem,
  ProductDetail,
  CreateProductInput,
  UpdateProductInput,
  ProductListFilters,
  // Warehouses
  Warehouse,
  CreateWarehouseInput,
  UpdateWarehouseInput,
  // Stock
  StockBalance,
  WarehouseStockItem,
  ReconciliationResult,
  // Stock Movements
  MovementType,
  StockMovement,
  InboundMovementInput,
  OutboundMovementInput,
  TransferInput,
  TransferResult,
  MovementListFilters,
  // Stock Adjustments
  AdjustmentType,
  StockAdjustment,
  AdjustmentInput
}
