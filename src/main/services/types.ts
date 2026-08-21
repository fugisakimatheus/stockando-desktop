/**
 * Shared type definitions and constants for the catalog and inventory domain.
 *
 * Contains discriminant constants, request/response interfaces, pagination types,
 * and audit log entry types used across the service layer.
 */

import type {
  categories,
  customers,
  products,
  quotes,
  stock,
  stockAdjustments,
  stockMovements,
  suppliers,
  unitsOfMeasure,
  warehouses
} from '../db/schema'
import type { QuoteStatus, SalesOrderStatus, PurchaseOrderStatus } from './status-transitions'

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

export type Supplier = typeof suppliers.$inferSelect
export type SupplierInsert = typeof suppliers.$inferInsert

export type Quote = typeof quotes.$inferSelect

export type Customer = typeof customers.$inferSelect

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

// ---------------------------------------------------------------------------
// Customer request/response types
// ---------------------------------------------------------------------------

export interface CustomerListFilters extends Pagination {
  search?: string
  status?: string
}

export interface CreateCustomerInput {
  name: string
  documentNumber?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  customerType?: 'individual' | 'business'
}

export interface UpdateCustomerInput {
  name?: string
  documentNumber?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  status?: 'active' | 'inactive'
}

export interface CustomerListItem {
  id: number
  name: string
  documentNumber: string | null
  email: string | null
  phone: string | null
  status: string
}

export interface CustomerDetail {
  id: number
  companyId: number
  name: string
  documentNumber: string | null
  email: string | null
  phone: string | null
  address: string | null
  customerType: string
  status: string
  createdAt: string
  updatedAt: string
  quoteCount: number
  salesOrderCount: number
}

// ---------------------------------------------------------------------------
// Supplier request/response types
// ---------------------------------------------------------------------------

export interface SupplierListFilters extends Pagination {
  search?: string
  status?: string
}

export interface CreateSupplierInput {
  name: string
  documentNumber: string
  tradeName?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
}

export interface UpdateSupplierInput {
  name?: string
  tradeName?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  status?: 'active' | 'inactive'
}

export interface SupplierListItem {
  id: number
  name: string
  documentNumber: string
  tradeName: string | null
  email: string | null
  status: string
}

export interface SupplierDetail {
  id: number
  companyId: number
  name: string
  documentNumber: string
  tradeName: string | null
  email: string | null
  phone: string | null
  address: string | null
  status: string
  createdAt: string
  updatedAt: string
  purchaseOrderCount: number
}

// ---------------------------------------------------------------------------
// Quote request/response types
// ---------------------------------------------------------------------------

export interface QuoteListFilters extends Pagination {
  customerId?: number
  status?: QuoteStatus
  search?: string
}

export interface QuoteItemInput {
  productId: number
  quantity: number
  unitPrice: number
  discountAmount?: number
}

export interface CreateQuoteInput {
  customerId: number
  validUntil?: string | null
  notes?: string | null
  items: QuoteItemInput[]
}

export interface UpdateQuoteInput {
  customerId?: number
  validUntil?: string | null
  notes?: string | null
  items?: QuoteItemInput[]
}

export interface QuoteListItem {
  id: number
  quoteNumber: string
  customerName: string | null
  status: string
  totalAmount: number
  validUntil: string | null
  createdAt: string
}

export interface QuoteDetailItem {
  id: number
  productId: number
  productName: string
  productSku: string
  quantity: number
  unitPrice: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  createdAt: string
}

export interface QuoteDetail {
  id: number
  companyId: number
  customerId: number | null
  customerName: string | null
  quoteNumber: string
  status: string
  validUntil: string | null
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  notes: string | null
  cancelledAt: string | null
  convertedAt: string | null
  createdAt: string
  updatedAt: string
  items: QuoteDetailItem[]
}

// ---------------------------------------------------------------------------
// Sales Order request/response types
// ---------------------------------------------------------------------------

export interface SalesOrderListFilters extends Pagination {
  customerId?: number
  status?: SalesOrderStatus
  paymentStatus?: PaymentStatusValue
  search?: string
}

export interface OrderItemInput {
  productId: number
  quantity: number
  unitPrice: number
  discountAmount?: number
}

export interface CreateSalesOrderInput {
  customerId: number
  items: OrderItemInput[]
}

export interface UpdateSalesOrderInput {
  customerId?: number
  items?: OrderItemInput[]
}

export interface SalesOrderListItem {
  id: number
  orderNumber: string
  customerName: string | null
  status: string
  totalAmount: number
  paymentStatus: PaymentStatusValue
  createdAt: string
}

export interface SalesOrderDetailItem {
  id: number
  productId: number
  productName: string
  productSku: string
  quantity: number
  unitPrice: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  createdAt: string
}

export interface SalesOrderPaymentRecord {
  id: number
  paymentMethodId: number
  amount: number
  status: string
  transactionReference: string | null
  paidAt: string | null
  createdAt: string
}

export interface SalesOrderDetail {
  id: number
  companyId: number
  customerId: number | null
  customerName: string | null
  orderNumber: string
  orderType: string
  status: string
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  paymentStatus: PaymentStatusValue
  confirmedAt: string | null
  fulfilledAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
  items: SalesOrderDetailItem[]
  payments: SalesOrderPaymentRecord[]
  totalPaid: number
  remainingBalance: number
}

// ---------------------------------------------------------------------------
// Purchase Order request/response types
// ---------------------------------------------------------------------------

export type PaymentStatusValue = 'unpaid' | 'partially_paid' | 'paid'

export interface PurchaseOrderListFilters extends Pagination {
  supplierId?: number
  status?: PurchaseOrderStatus
  paymentStatus?: PaymentStatusValue
  search?: string
}

export interface PurchaseOrderItemInput {
  productId: number
  quantity: number
  unitCost: number
  discountAmount?: number
}

export interface CreatePurchaseOrderInput {
  supplierId: number
  expectedDeliveryDate?: string | null
  items: PurchaseOrderItemInput[]
}

export interface UpdatePurchaseOrderInput {
  supplierId?: number
  expectedDeliveryDate?: string | null
  items?: PurchaseOrderItemInput[]
}

export interface PurchaseOrderListItem {
  id: number
  orderNumber: string
  supplierName: string
  status: string
  totalAmount: number
  paymentStatus: PaymentStatusValue
  expectedDeliveryDate: string | null
  createdAt: string
}

export interface PurchaseOrderDetailItem {
  id: number
  productId: number
  productName: string
  productSku: string
  quantity: number
  receivedQuantity: number
  unitCost: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  createdAt: string
}

export interface PurchaseOrderPaymentRecord {
  id: number
  paymentMethodId: number
  amount: number
  status: string
  transactionReference: string | null
  paidAt: string | null
  createdAt: string
}

export interface PurchaseOrderDetail {
  id: number
  companyId: number
  supplierId: number
  supplierName: string
  orderNumber: string
  status: string
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  expectedDeliveryDate: string | null
  paymentStatus: PaymentStatusValue
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
  items: PurchaseOrderDetailItem[]
  payments: PurchaseOrderPaymentRecord[]
  totalPaid: number
  remainingBalance: number
}

// ---------------------------------------------------------------------------
// Payment Service request/response types
// ---------------------------------------------------------------------------

export interface RegisterPaymentInput {
  paymentMethodId: number
  amount: number
  transactionReference?: string | null
  paidAt: string
}

export interface PaymentRecord {
  id: number
  paymentMethodId: number
  amount: number
  status: string
  transactionReference: string | null
  paidAt: string | null
  createdAt: string
}

export interface PaymentSummary {
  payments: PaymentRecord[]
  documentTotal: number
  totalPaid: number
  remainingBalance: number
  paymentStatus: PaymentStatusValue
}

// ---------------------------------------------------------------------------
// Purchase Order Receipt types
// ---------------------------------------------------------------------------

export interface ReceiptItemInput {
  purchaseOrderItemId: number
  receivedQuantity: number
  warehouseId: number
}

export interface ReceiptInput {
  items: ReceiptItemInput[]
  notes?: string
}
