/**
 * PurchaseOrderService — CRUD and status management for purchase orders.
 *
 * All operations are company-scoped. Enforces:
 * - Unique orderNumber per company (auto-generated via numbering service)
 * - Paginated list with search by orderNumber and supplierId/status/paymentStatus filters
 * - Draft-only editing guard
 * - Status transitions validated via VALID_PURCHASE_ORDER_TRANSITIONS
 * - Document totals computed using purchase line formula
 * - Audit log on status transitions
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 11.2, 11.3, 11.4, 13.3, 16.3
 */

import { and, count, eq, like } from 'drizzle-orm'

import { BusinessRuleError, NotFoundError, ValidationError } from '../api/errors'
import { products, purchaseOrderItems, purchaseOrderPayments, purchaseOrders, suppliers } from '../db/schema'
import { getDb } from '../server'
import { logAudit } from './audit-service'
import { computeDocumentTotals, computePurchaseLineTotal } from './commercial-utils'
import { generateNextNumber, SEQUENCE_TYPES } from './numbering-service'
import { validateTransition, VALID_PURCHASE_ORDER_TRANSITIONS } from './status-transitions'
import type { PurchaseOrderStatus } from './status-transitions'
import { recordInbound } from './stock-service'
import type {
  CreatePurchaseOrderInput,
  PaginatedResult,
  PaymentStatusValue,
  PurchaseOrderDetail,
  PurchaseOrderDetailItem,
  PurchaseOrderListFilters,
  PurchaseOrderListItem,
  PurchaseOrderPaymentRecord,
  ReceiptInput,
  UpdatePurchaseOrderInput
} from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps the database `paymentStatus` column ('pending') to the API PaymentStatusValue.
 * The DB stores 'pending' as default but the API exposes 'unpaid'.
 */
function mapPaymentStatus(dbValue: string): PaymentStatusValue {
  if (dbValue === 'pending' || dbValue === 'unpaid') return 'unpaid'
  if (dbValue === 'partially_paid') return 'partially_paid'
  if (dbValue === 'paid') return 'paid'
  return 'unpaid'
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of purchase orders for the given company with optional filtering.
 *
 * Supports:
 * - supplierId filter
 * - status filter
 * - paymentStatus filter
 * - search term matching orderNumber (case-insensitive LIKE)
 * - limit/offset pagination with total count
 */
export async function list(
  companyId: number,
  filters: PurchaseOrderListFilters
): Promise<PaginatedResult<PurchaseOrderListItem>> {
  const db = getDb()

  const limit = filters.limit || 20
  const offset = filters.offset || 0

  const conditions = [eq(purchaseOrders.companyId, companyId)]

  if (filters.supplierId !== undefined) {
    conditions.push(eq(purchaseOrders.supplierId, filters.supplierId))
  }

  if (filters.status !== undefined) {
    conditions.push(eq(purchaseOrders.status, filters.status))
  }

  if (filters.paymentStatus !== undefined) {
    // Map 'unpaid' to 'pending' for DB query since the column default is 'pending'
    const dbPaymentStatus = filters.paymentStatus === 'unpaid' ? 'pending' : filters.paymentStatus
    conditions.push(eq(purchaseOrders.paymentStatus, dbPaymentStatus))
  }

  if (filters.search) {
    const searchPattern = `%${filters.search}%`
    const searchCondition = like(purchaseOrders.orderNumber, searchPattern)
    conditions.push(searchCondition)
  }

  const whereClause = and(...conditions)

  const [countResult] = await db.select({ total: count() }).from(purchaseOrders).where(whereClause)

  const total = countResult?.total ?? 0

  const rows = await db
    .select({
      id: purchaseOrders.id,
      orderNumber: purchaseOrders.orderNumber,
      supplierName: suppliers.name,
      status: purchaseOrders.status,
      totalAmount: purchaseOrders.totalAmount,
      paymentStatus: purchaseOrders.paymentStatus,
      expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
      createdAt: purchaseOrders.createdAt
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(whereClause)
    .limit(limit)
    .offset(offset)

  const data: PurchaseOrderListItem[] = rows.map((row) => ({
    id: row.id,
    orderNumber: row.orderNumber,
    supplierName: row.supplierName,
    status: row.status,
    totalAmount: row.totalAmount,
    paymentStatus: mapPaymentStatus(row.paymentStatus),
    expectedDeliveryDate: row.expectedDeliveryDate ?? null,
    createdAt: row.createdAt
  }))

  return { data, total, limit, offset }
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

/**
 * Returns full purchase order details with items (including receivedQuantity, product name/SKU),
 * payments, totalPaid, and remainingBalance.
 *
 * Throws NotFoundError if the PO does not exist or does not belong to the company.
 */
export async function detail(companyId: number, id: number): Promise<PurchaseOrderDetail> {
  const db = getDb()

  const [po] = await db
    .select({
      id: purchaseOrders.id,
      companyId: purchaseOrders.companyId,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      orderNumber: purchaseOrders.orderNumber,
      status: purchaseOrders.status,
      subtotal: purchaseOrders.subtotal,
      discountAmount: purchaseOrders.discountAmount,
      taxAmount: purchaseOrders.taxAmount,
      totalAmount: purchaseOrders.totalAmount,
      expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
      paymentStatus: purchaseOrders.paymentStatus,
      cancelledAt: purchaseOrders.cancelledAt,
      createdAt: purchaseOrders.createdAt,
      updatedAt: purchaseOrders.updatedAt
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, companyId)))

  if (!po) {
    throw new NotFoundError('Purchase order not found')
  }

  // Fetch items with product info
  const itemRows = await db
    .select({
      id: purchaseOrderItems.id,
      productId: purchaseOrderItems.productId,
      productName: products.name,
      productSku: products.sku,
      quantity: purchaseOrderItems.quantity,
      receivedQuantity: purchaseOrderItems.receivedQuantity,
      unitCost: purchaseOrderItems.unitCost,
      discountAmount: purchaseOrderItems.discountAmount,
      taxAmount: purchaseOrderItems.taxAmount,
      totalAmount: purchaseOrderItems.totalAmount,
      createdAt: purchaseOrderItems.createdAt
    })
    .from(purchaseOrderItems)
    .innerJoin(products, eq(purchaseOrderItems.productId, products.id))
    .where(eq(purchaseOrderItems.purchaseOrderId, id))

  const items: PurchaseOrderDetailItem[] = itemRows.map((row) => ({
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    productSku: row.productSku,
    quantity: row.quantity,
    receivedQuantity: row.receivedQuantity,
    unitCost: row.unitCost,
    discountAmount: row.discountAmount,
    taxAmount: row.taxAmount,
    totalAmount: row.totalAmount,
    createdAt: row.createdAt
  }))

  // Fetch payments
  const paymentRows = await db
    .select({
      id: purchaseOrderPayments.id,
      paymentMethodId: purchaseOrderPayments.paymentMethodId,
      amount: purchaseOrderPayments.amount,
      status: purchaseOrderPayments.status,
      transactionReference: purchaseOrderPayments.transactionReference,
      paidAt: purchaseOrderPayments.paidAt,
      createdAt: purchaseOrderPayments.createdAt
    })
    .from(purchaseOrderPayments)
    .where(eq(purchaseOrderPayments.purchaseOrderId, id))

  const payments: PurchaseOrderPaymentRecord[] = paymentRows.map((row) => ({
    id: row.id,
    paymentMethodId: row.paymentMethodId,
    amount: row.amount,
    status: row.status,
    transactionReference: row.transactionReference ?? null,
    paidAt: row.paidAt ?? null,
    createdAt: row.createdAt
  }))

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const remainingBalance = po.totalAmount - totalPaid

  return {
    id: po.id,
    companyId: po.companyId,
    supplierId: po.supplierId,
    supplierName: po.supplierName,
    orderNumber: po.orderNumber,
    status: po.status,
    subtotal: po.subtotal,
    discountAmount: po.discountAmount,
    taxAmount: po.taxAmount,
    totalAmount: po.totalAmount,
    expectedDeliveryDate: po.expectedDeliveryDate ?? null,
    paymentStatus: mapPaymentStatus(po.paymentStatus),
    cancelledAt: po.cancelledAt ?? null,
    createdAt: po.createdAt,
    updatedAt: po.updatedAt,
    items,
    payments,
    totalPaid,
    remainingBalance
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Creates a new purchase order for the given company.
 *
 * Validates:
 * - Supplier exists and belongs to the company
 * - All referenced products exist and belong to the company
 * - Items array is not empty
 * - Quantity and unitCost are positive
 *
 * Computes line totals using purchase formula and document totals.
 * Auto-generates orderNumber via numbering service.
 */
export async function create(companyId: number, input: CreatePurchaseOrderInput): Promise<PurchaseOrderDetail> {
  const db = getDb()

  // Validate supplier exists in company
  const [supplier] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.companyId, companyId)))

  if (!supplier) {
    throw new NotFoundError('Supplier not found')
  }

  // Validate items
  if (!input.items || input.items.length === 0) {
    throw new ValidationError('At least one item is required', { items: 'At least one item is required' })
  }

  for (const item of input.items) {
    if (item.quantity <= 0) {
      throw new ValidationError('Item quantity must be positive', { quantity: 'Quantity must be positive' })
    }
    if (item.unitCost <= 0) {
      throw new ValidationError('Item unit cost must be positive', { unitCost: 'Unit cost must be positive' })
    }
    if (item.discountAmount !== undefined && item.discountAmount < 0) {
      throw new ValidationError('Item discount amount cannot be negative', {
        discountAmount: 'Discount amount cannot be negative'
      })
    }
  }

  // Validate all products exist in company
  const productIds = input.items.map((i) => i.productId)
  const existingProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.companyId, companyId)))

  const existingProductIds = new Set(existingProducts.map((p) => p.id))
  for (const productId of productIds) {
    if (!existingProductIds.has(productId)) {
      throw new NotFoundError(`Product with id ${productId} not found`)
    }
  }

  const now = new Date().toISOString()

  // Compute line totals for document totals calculation
  const itemsForTotals = input.items.map((item) => ({
    quantity: item.quantity,
    unitPrice: item.unitCost,
    discountAmount: item.discountAmount ?? 0,
    taxAmount: 0
  }))

  const docTotals = computeDocumentTotals(itemsForTotals)

  // Execute within transaction to ensure atomicity with number generation
  const result = await db.transaction(async (tx) => {
    const orderNumber = await generateNextNumber(tx, companyId, SEQUENCE_TYPES.purchase_order)

    const [po] = await tx
      .insert(purchaseOrders)
      .values({
        companyId,
        supplierId: input.supplierId,
        orderNumber,
        status: 'draft',
        subtotal: docTotals.subtotal,
        discountAmount: docTotals.discountAmount,
        taxAmount: docTotals.taxAmount,
        totalAmount: docTotals.totalAmount,
        expectedDeliveryDate: input.expectedDeliveryDate ?? null,
        paymentStatus: 'pending',
        createdAt: now,
        updatedAt: now
      })
      .returning()

    // Insert items
    for (const item of input.items) {
      const lineTotal = computePurchaseLineTotal(item.quantity, item.unitCost, item.discountAmount ?? 0)

      await tx.insert(purchaseOrderItems).values({
        purchaseOrderId: po.id,
        productId: item.productId,
        quantity: item.quantity,
        receivedQuantity: 0,
        unitCost: item.unitCost,
        discountAmount: item.discountAmount ?? 0,
        taxAmount: 0,
        totalAmount: lineTotal,
        createdAt: now
      })
    }

    return po
  })

  return detail(companyId, result.id)
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Updates an existing purchase order.
 *
 * Guards:
 * - PO must exist and belong to the company
 * - PO must be in 'draft' status (only draft orders are editable)
 *
 * When items are provided, replaces all existing items with the new set and recomputes totals.
 */
export async function update(
  companyId: number,
  id: number,
  input: UpdatePurchaseOrderInput
): Promise<PurchaseOrderDetail> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Purchase order not found')
  }

  if (existing.status !== 'draft') {
    throw new BusinessRuleError('Purchase order can only be edited in draft status')
  }

  // Validate supplier if provided
  if (input.supplierId !== undefined) {
    const [supplier] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.companyId, companyId)))

    if (!supplier) {
      throw new NotFoundError('Supplier not found')
    }
  }

  const now = new Date().toISOString()

  // If items are provided, validate and replace
  if (input.items !== undefined) {
    if (input.items.length === 0) {
      throw new ValidationError('At least one item is required', { items: 'At least one item is required' })
    }

    for (const item of input.items) {
      if (item.quantity <= 0) {
        throw new ValidationError('Item quantity must be positive', { quantity: 'Quantity must be positive' })
      }
      if (item.unitCost <= 0) {
        throw new ValidationError('Item unit cost must be positive', { unitCost: 'Unit cost must be positive' })
      }
      if (item.discountAmount !== undefined && item.discountAmount < 0) {
        throw new ValidationError('Item discount amount cannot be negative', {
          discountAmount: 'Discount amount cannot be negative'
        })
      }
    }

    // Validate all products exist in company
    const productIds = input.items.map((i) => i.productId)
    const existingProducts = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.companyId, companyId)))

    const existingProductIds = new Set(existingProducts.map((p) => p.id))
    for (const productId of productIds) {
      if (!existingProductIds.has(productId)) {
        throw new NotFoundError(`Product with id ${productId} not found`)
      }
    }

    // Compute new totals
    const itemsForTotals = input.items.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitCost,
      discountAmount: item.discountAmount ?? 0,
      taxAmount: 0
    }))

    const docTotals = computeDocumentTotals(itemsForTotals)

    // Delete existing items and insert new ones, update PO totals
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id))

    for (const item of input.items) {
      const lineTotal = computePurchaseLineTotal(item.quantity, item.unitCost, item.discountAmount ?? 0)

      await db.insert(purchaseOrderItems).values({
        purchaseOrderId: id,
        productId: item.productId,
        quantity: item.quantity,
        receivedQuantity: 0,
        unitCost: item.unitCost,
        discountAmount: item.discountAmount ?? 0,
        taxAmount: 0,
        totalAmount: lineTotal,
        createdAt: now
      })
    }

    await db
      .update(purchaseOrders)
      .set({
        ...(input.supplierId !== undefined && { supplierId: input.supplierId }),
        ...(input.expectedDeliveryDate !== undefined && { expectedDeliveryDate: input.expectedDeliveryDate }),
        subtotal: docTotals.subtotal,
        discountAmount: docTotals.discountAmount,
        taxAmount: docTotals.taxAmount,
        totalAmount: docTotals.totalAmount,
        updatedAt: now
      })
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, companyId)))
  } else {
    // Only update header fields
    await db
      .update(purchaseOrders)
      .set({
        ...(input.supplierId !== undefined && { supplierId: input.supplierId }),
        ...(input.expectedDeliveryDate !== undefined && { expectedDeliveryDate: input.expectedDeliveryDate }),
        updatedAt: now
      })
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, companyId)))
  }

  return detail(companyId, id)
}

// ---------------------------------------------------------------------------
// Status Transition
// ---------------------------------------------------------------------------

/**
 * Transitions the purchase order to a new status.
 *
 * Validates the transition according to VALID_PURCHASE_ORDER_TRANSITIONS.
 * Sets cancelledAt when transitioning to 'cancelled'.
 * Records an audit log entry.
 */
export async function transitionStatus(
  companyId: number,
  id: number,
  targetStatus: PurchaseOrderStatus
): Promise<PurchaseOrderDetail> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Purchase order not found')
  }

  const currentStatus = existing.status as PurchaseOrderStatus
  const result = validateTransition(currentStatus, targetStatus, VALID_PURCHASE_ORDER_TRANSITIONS)

  if (!result.valid) {
    throw new BusinessRuleError(
      `Cannot transition purchase order from "${currentStatus}" to "${targetStatus}". Allowed transitions: ${result.allowed.join(', ') || 'none (terminal status)'}`
    )
  }

  const now = new Date().toISOString()

  const updateData: Record<string, unknown> = {
    status: targetStatus,
    updatedAt: now
  }

  if (targetStatus === 'cancelled') {
    updateData.cancelledAt = now
  }

  await db
    .update(purchaseOrders)
    .set(updateData)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, companyId)))

  await logAudit({
    companyId,
    entityType: 'purchase_order',
    entityId: String(id),
    action: `status_change:${currentStatus}→${targetStatus}`
  })

  return detail(companyId, id)
}

// ---------------------------------------------------------------------------
// Receipt Recording
// ---------------------------------------------------------------------------

/**
 * Records a receipt for a purchase order, updating received quantities and
 * generating inbound stock movements.
 *
 * Validates:
 * - PO exists and belongs to the company
 * - PO is in "sent" or "partially_received" status
 * - Each receipt item references a valid PO item belonging to this PO
 * - Received quantity does not exceed ordered quantity
 *
 * Within a single transaction:
 * 1. Updates receivedQuantity on each purchase order item
 * 2. Generates inbound stock movements via StockService
 * 3. Auto-transitions status: "received" if all fully received, "partially_received" otherwise
 * 4. Records audit log entry
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 15.2, 16.3
 */
export async function recordReceipt(companyId: number, id: number, input: ReceiptInput): Promise<PurchaseOrderDetail> {
  const db = getDb()

  // Validate PO exists and belongs to company
  const [existing] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Purchase order not found')
  }

  // Validate PO is in an acceptable status for receipts
  if (existing.status !== 'sent' && existing.status !== 'partially_received') {
    throw new BusinessRuleError('Purchase order must be in "sent" or "partially_received" status to record a receipt')
  }

  // Validate input has items
  if (!input.items || input.items.length === 0) {
    throw new ValidationError('At least one receipt item is required', {
      items: 'At least one receipt item is required'
    })
  }

  // Validate all received quantities are positive
  for (const item of input.items) {
    if (item.receivedQuantity <= 0) {
      throw new ValidationError('Received quantity must be positive', {
        receivedQuantity: 'Received quantity must be positive'
      })
    }
  }

  // Execute within a single transaction for atomicity
  await db.transaction(async (tx) => {
    // Fetch all PO items for this purchase order
    const poItems = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id))

    const poItemsMap = new Map(poItems.map((item) => [item.id, item]))

    // Process each receipt item
    for (const receiptItem of input.items) {
      const poItem = poItemsMap.get(receiptItem.purchaseOrderItemId)

      // Validate PO item exists and belongs to this PO
      if (!poItem) {
        throw new NotFoundError(
          `Purchase order item with id ${receiptItem.purchaseOrderItemId} not found on this purchase order`
        )
      }

      // Check that received + new does not exceed ordered
      const newTotalReceived = poItem.receivedQuantity + receiptItem.receivedQuantity
      if (newTotalReceived > poItem.quantity) {
        throw new ValidationError(
          `Received quantity (${newTotalReceived}) would exceed ordered quantity (${poItem.quantity}) for item ${receiptItem.purchaseOrderItemId}`,
          { receivedQuantity: 'Received quantity would exceed ordered quantity' }
        )
      }

      // Update the receivedQuantity on the PO item
      await tx
        .update(purchaseOrderItems)
        .set({ receivedQuantity: newTotalReceived })
        .where(eq(purchaseOrderItems.id, receiptItem.purchaseOrderItemId))

      // Generate inbound stock movement via StockService
      await recordInbound(companyId, {
        productId: poItem.productId,
        warehouseId: receiptItem.warehouseId,
        quantity: receiptItem.receivedQuantity,
        unitCost: poItem.unitCost,
        referenceType: 'purchase_order',
        referenceId: String(id),
        notes: input.notes
      })
    }

    // After processing all items, determine the new status
    // Re-fetch all PO items to get updated receivedQuantity values
    const updatedPoItems = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id))

    const allFullyReceived = updatedPoItems.every((item) => item.receivedQuantity >= item.quantity)

    const newStatus: PurchaseOrderStatus = allFullyReceived ? 'received' : 'partially_received'

    const now = new Date().toISOString()

    // Update PO status
    await tx.update(purchaseOrders).set({ status: newStatus, updatedAt: now }).where(eq(purchaseOrders.id, id))
  })

  // Record audit log entry
  await logAudit({
    companyId,
    entityType: 'purchase_order',
    entityId: String(id),
    action: 'receipt_recorded'
  })

  return detail(companyId, id)
}
