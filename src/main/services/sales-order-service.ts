/**
 * SalesOrderService — CRUD and status management for sales orders.
 *
 * All operations are company-scoped. Enforces:
 * - Unique orderNumber per company (auto-generated via numbering service)
 * - Paginated list with search by orderNumber and customerId/status/paymentStatus filters
 * - Draft-only editing guard
 * - Status transitions validated via VALID_SALES_ORDER_TRANSITIONS
 * - Document totals computed using sales line formula
 * - Lifecycle timestamps (confirmedAt, fulfilledAt, cancelledAt)
 * - Audit log on status transitions
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5, 11.1, 11.3, 11.4, 13.2, 16.2
 */

import { and, count, eq, like } from 'drizzle-orm'

import { BusinessRuleError, NotFoundError, OrderHasActiveFiscalDocError, ValidationError } from '../api/errors'
import { customers, invoices, orderItems, orderPayments, orders, products } from '../db/schema'
import { getDb } from '../server'
import { logAudit } from './audit-service'
import { computeDocumentTotals, computeSalesLineTotal } from './commercial-utils'
import { generateNextNumber, SEQUENCE_TYPES } from './numbering-service'
import { validateTransition, VALID_SALES_ORDER_TRANSITIONS } from './status-transitions'
import type { SalesOrderStatus } from './status-transitions'
import type {
  CreateSalesOrderInput,
  PaginatedResult,
  PaymentStatusValue,
  SalesOrderDetail,
  SalesOrderDetailItem,
  SalesOrderListFilters,
  SalesOrderListItem,
  SalesOrderPaymentRecord,
  UpdateSalesOrderInput
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
 * Returns a paginated list of sales orders for the given company with optional filtering.
 *
 * Supports:
 * - customerId filter
 * - status filter
 * - paymentStatus filter
 * - search term matching orderNumber (case-insensitive LIKE)
 * - limit/offset pagination with total count
 */
export async function list(
  companyId: number,
  filters: SalesOrderListFilters
): Promise<PaginatedResult<SalesOrderListItem>> {
  const db = getDb()

  const limit = filters.limit || 20
  const offset = filters.offset || 0

  const conditions = [eq(orders.companyId, companyId)]

  if (filters.customerId !== undefined) {
    conditions.push(eq(orders.customerId, filters.customerId))
  }

  if (filters.status !== undefined) {
    conditions.push(eq(orders.status, filters.status))
  }

  if (filters.paymentStatus !== undefined) {
    // Map 'unpaid' to 'pending' for DB query since the column default is 'pending'
    const dbPaymentStatus = filters.paymentStatus === 'unpaid' ? 'pending' : filters.paymentStatus
    conditions.push(eq(orders.paymentStatus, dbPaymentStatus))
  }

  if (filters.search) {
    const searchPattern = `%${filters.search}%`
    conditions.push(like(orders.orderNumber, searchPattern))
  }

  const whereClause = and(...conditions)

  const [countResult] = await db.select({ total: count() }).from(orders).where(whereClause)

  const total = countResult?.total ?? 0

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerName: customers.name,
      status: orders.status,
      totalAmount: orders.totalAmount,
      paymentStatus: orders.paymentStatus,
      createdAt: orders.createdAt
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(whereClause)
    .limit(limit)
    .offset(offset)

  const data: SalesOrderListItem[] = rows.map((row) => ({
    id: row.id,
    orderNumber: row.orderNumber,
    customerName: row.customerName ?? null,
    status: row.status,
    totalAmount: row.totalAmount,
    paymentStatus: mapPaymentStatus(row.paymentStatus),
    createdAt: row.createdAt
  }))

  return { data, total, limit, offset }
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

/**
 * Returns full sales order details with items (including product name/SKU),
 * payments, totalPaid, and remainingBalance.
 *
 * Throws NotFoundError if the order does not exist or does not belong to the company.
 */
export async function detail(companyId: number, id: number): Promise<SalesOrderDetail> {
  const db = getDb()

  const [order] = await db
    .select({
      id: orders.id,
      companyId: orders.companyId,
      customerId: orders.customerId,
      customerName: customers.name,
      orderNumber: orders.orderNumber,
      orderType: orders.orderType,
      status: orders.status,
      subtotal: orders.subtotal,
      discountAmount: orders.discountAmount,
      taxAmount: orders.taxAmount,
      totalAmount: orders.totalAmount,
      paymentStatus: orders.paymentStatus,
      confirmedAt: orders.confirmedAt,
      fulfilledAt: orders.fulfilledAt,
      cancelledAt: orders.cancelledAt,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(and(eq(orders.id, id), eq(orders.companyId, companyId)))

  if (!order) {
    throw new NotFoundError('Sales order not found')
  }

  // Fetch items with product info
  const itemRows = await db
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      productName: products.name,
      productSku: products.sku,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      discountAmount: orderItems.discountAmount,
      taxAmount: orderItems.taxAmount,
      totalAmount: orderItems.totalAmount,
      createdAt: orderItems.createdAt
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, id))

  const items: SalesOrderDetailItem[] = itemRows.map((row) => ({
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    productSku: row.productSku,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    discountAmount: row.discountAmount,
    taxAmount: row.taxAmount,
    totalAmount: row.totalAmount,
    createdAt: row.createdAt
  }))

  // Fetch payments
  const paymentRows = await db
    .select({
      id: orderPayments.id,
      paymentMethodId: orderPayments.paymentMethodId,
      amount: orderPayments.amount,
      status: orderPayments.status,
      transactionReference: orderPayments.transactionReference,
      paidAt: orderPayments.paidAt,
      createdAt: orderPayments.createdAt
    })
    .from(orderPayments)
    .where(eq(orderPayments.orderId, id))

  const payments: SalesOrderPaymentRecord[] = paymentRows.map((row) => ({
    id: row.id,
    paymentMethodId: row.paymentMethodId,
    amount: row.amount,
    status: row.status,
    transactionReference: row.transactionReference ?? null,
    paidAt: row.paidAt ?? null,
    createdAt: row.createdAt
  }))

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const remainingBalance = order.totalAmount - totalPaid

  return {
    id: order.id,
    companyId: order.companyId,
    customerId: order.customerId ?? null,
    customerName: order.customerName ?? null,
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    status: order.status,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    taxAmount: order.taxAmount,
    totalAmount: order.totalAmount,
    paymentStatus: mapPaymentStatus(order.paymentStatus),
    confirmedAt: order.confirmedAt ?? null,
    fulfilledAt: order.fulfilledAt ?? null,
    cancelledAt: order.cancelledAt ?? null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
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
 * Creates a new sales order for the given company.
 *
 * Validates:
 * - All referenced products exist and belong to the company
 * - Items array is not empty
 * - Quantity and unitPrice are positive
 * - discountAmount is non-negative
 *
 * Computes line totals using sales formula and document totals.
 * Auto-generates orderNumber via numbering service.
 */
export async function create(companyId: number, input: CreateSalesOrderInput): Promise<SalesOrderDetail> {
  const db = getDb()

  // Validate items
  if (!input.items || input.items.length === 0) {
    throw new ValidationError('At least one item is required', { items: 'At least one item is required' })
  }

  for (const item of input.items) {
    if (item.quantity <= 0) {
      throw new ValidationError('Item quantity must be positive', { quantity: 'Quantity must be positive' })
    }
    if (item.unitPrice <= 0) {
      throw new ValidationError('Item unit price must be positive', { unitPrice: 'Unit price must be positive' })
    }
    if (item.discountAmount !== undefined && item.discountAmount < 0) {
      throw new ValidationError('Item discount amount cannot be negative', {
        discountAmount: 'Discount amount cannot be negative'
      })
    }
  }

  // Validate all products exist in company
  const productIds = [...new Set(input.items.map((i) => i.productId))]
  for (const productId of productIds) {
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.companyId, companyId)))

    if (!product) {
      throw new ValidationError(`Product with ID ${productId} not found in this company`, {
        productId: `Product ${productId} not found`
      })
    }
  }

  const now = new Date().toISOString()

  // Compute line totals for document totals calculation
  const computedItems = input.items.map((item) => {
    const discountAmount = item.discountAmount ?? 0
    const lineTotal = computeSalesLineTotal(item.quantity, item.unitPrice, discountAmount)
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountAmount,
      taxAmount: 0,
      totalAmount: lineTotal
    }
  })

  const documentItems = computedItems.map((item) => ({
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountAmount: item.discountAmount,
    taxAmount: item.taxAmount
  }))
  const totals = computeDocumentTotals(documentItems)

  // Execute within transaction to ensure atomicity with number generation
  const result = await db.transaction(async (tx) => {
    const orderNumber = await generateNextNumber(tx, companyId, SEQUENCE_TYPES.sales_order)

    const [createdOrder] = await tx
      .insert(orders)
      .values({
        companyId,
        customerId: input.customerId,
        orderNumber,
        orderType: 'sale',
        status: 'draft',
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        paymentStatus: 'pending',
        createdAt: now,
        updatedAt: now
      })
      .returning()

    // Insert items
    for (const item of computedItems) {
      await tx.insert(orderItems).values({
        orderId: createdOrder.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        taxAmount: item.taxAmount,
        totalAmount: item.totalAmount,
        createdAt: now
      })
    }

    return createdOrder
  })

  return detail(companyId, result.id)
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Updates an existing sales order.
 *
 * Guards:
 * - Order must exist and belong to the company
 * - Order must be in 'draft' status (only draft orders are editable)
 *
 * When items are provided, replaces all existing items with the new set and recomputes totals.
 */
export async function update(companyId: number, id: number, input: UpdateSalesOrderInput): Promise<SalesOrderDetail> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Sales order not found')
  }

  if (existing.status !== 'draft') {
    throw new BusinessRuleError('Sales order can only be edited in draft status')
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
      if (item.unitPrice <= 0) {
        throw new ValidationError('Item unit price must be positive', { unitPrice: 'Unit price must be positive' })
      }
      if (item.discountAmount !== undefined && item.discountAmount < 0) {
        throw new ValidationError('Item discount amount cannot be negative', {
          discountAmount: 'Discount amount cannot be negative'
        })
      }
    }

    // Validate all products exist in company
    const productIds = [...new Set(input.items.map((i) => i.productId))]
    for (const productId of productIds) {
      const [product] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.companyId, companyId)))

      if (!product) {
        throw new ValidationError(`Product with ID ${productId} not found in this company`, {
          productId: `Product ${productId} not found`
        })
      }
    }

    // Compute new totals
    const computedItems = input.items.map((item) => {
      const discountAmount = item.discountAmount ?? 0
      const lineTotal = computeSalesLineTotal(item.quantity, item.unitPrice, discountAmount)
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount,
        taxAmount: 0,
        totalAmount: lineTotal
      }
    })

    const documentItems = computedItems.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      taxAmount: item.taxAmount
    }))
    const totals = computeDocumentTotals(documentItems)

    await db.transaction(async (tx) => {
      // Delete existing items and insert new ones
      await tx.delete(orderItems).where(eq(orderItems.orderId, id))

      for (const item of computedItems) {
        await tx.insert(orderItems).values({
          orderId: id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          taxAmount: item.taxAmount,
          totalAmount: item.totalAmount,
          createdAt: now
        })
      }

      // Update order header with new totals
      await tx
        .update(orders)
        .set({
          ...(input.customerId !== undefined && { customerId: input.customerId }),
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          updatedAt: now
        })
        .where(eq(orders.id, id))
    })
  } else {
    // Only update header fields (no items change)
    await db
      .update(orders)
      .set({
        ...(input.customerId !== undefined && { customerId: input.customerId }),
        updatedAt: now
      })
      .where(eq(orders.id, id))
  }

  return detail(companyId, id)
}

// ---------------------------------------------------------------------------
// Status Transition
// ---------------------------------------------------------------------------

/**
 * Transitions the sales order to a new status.
 *
 * Validates the transition according to VALID_SALES_ORDER_TRANSITIONS.
 * Sets lifecycle timestamps:
 * - confirmedAt when transitioning to 'confirmed'
 * - fulfilledAt when transitioning to 'fulfilled'
 * - cancelledAt when transitioning to 'cancelled'
 *
 * Records an audit log entry.
 */
export async function transitionStatus(
  companyId: number,
  id: number,
  targetStatus: SalesOrderStatus
): Promise<SalesOrderDetail> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Sales order not found')
  }

  const currentStatus = existing.status as SalesOrderStatus
  const result = validateTransition(currentStatus, targetStatus, VALID_SALES_ORDER_TRANSITIONS)

  if (!result.valid) {
    throw new BusinessRuleError(
      `Cannot transition sales order from "${currentStatus}" to "${targetStatus}". Allowed transitions: ${result.allowed.length > 0 ? result.allowed.join(', ') : 'none (terminal status)'}.`
    )
  }

  const now = new Date().toISOString()

  const updateData: Record<string, unknown> = {
    status: targetStatus,
    updatedAt: now
  }

  if (targetStatus === 'confirmed') {
    updateData.confirmedAt = now
  }

  if (targetStatus === 'fulfilled') {
    updateData.fulfilledAt = now
  }

  if (targetStatus === 'cancelled') {
    // Requirement 11.3: Block cancellation if an authorized fiscal document exists
    const [activeFiscalDoc] = await db
      .select({ id: invoices.id, documentNumber: invoices.documentNumber })
      .from(invoices)
      .where(and(eq(invoices.orderId, id), eq(invoices.companyId, companyId), eq(invoices.status, 'authorized')))
      .limit(1)

    if (activeFiscalDoc) {
      throw new OrderHasActiveFiscalDocError(
        `Cannot cancel order: fiscal document #${activeFiscalDoc.documentNumber} is authorized and must be cancelled first`
      )
    }

    updateData.cancelledAt = now
  }

  await db.update(orders).set(updateData).where(eq(orders.id, id))

  await logAudit({
    companyId,
    entityType: 'sales_order',
    entityId: String(id),
    action: `status_change:${currentStatus}→${targetStatus}`
  })

  return detail(companyId, id)
}
