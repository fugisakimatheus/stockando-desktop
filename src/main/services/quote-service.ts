/**
 * QuoteService — CRUD operations and lifecycle management for quotes.
 *
 * All operations are company-scoped. Enforces:
 * - Product existence validation within the company
 * - Line total and document total computation with half-up rounding
 * - Sequential quoteNumber generation
 * - Status transition validation (only valid transitions allowed)
 * - Edit guards (only draft/sent quotes are editable)
 * - Lifecycle timestamps (cancelledAt, convertedAt)
 * - Audit log on status transitions
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 4.2, 4.3, 11.1, 11.3, 11.4, 13.2, 16.1
 */

import { and, count, eq, like } from 'drizzle-orm'

import { BusinessRuleError, NotFoundError, ValidationError } from '../api/errors'
import { customers, orderItems, orders, products, quoteItems, quoteOrderConversions, quotes } from '../db/schema'
import { getDb } from '../server'
import { logAudit } from './audit-service'
import { computeDocumentTotals, computeSalesLineTotal } from './commercial-utils'
import { generateNextNumber, SEQUENCE_TYPES } from './numbering-service'
import { validateTransition, VALID_QUOTE_TRANSITIONS } from './status-transitions'
import type { QuoteStatus } from './status-transitions'
import type {
  CreateQuoteInput,
  PaginatedResult,
  QuoteDetail,
  QuoteDetailItem,
  QuoteListFilters,
  QuoteListItem,
  SalesOrderDetail,
  UpdateQuoteInput
} from './types'

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of quotes for the given company.
 * Supports search by quoteNumber, customerId, and status filtering.
 */
export async function list(companyId: number, filters: QuoteListFilters): Promise<PaginatedResult<QuoteListItem>> {
  const db = getDb()

  // Build WHERE conditions
  const conditions = [eq(quotes.companyId, companyId)]

  if (filters.customerId) {
    conditions.push(eq(quotes.customerId, filters.customerId))
  }

  if (filters.status) {
    conditions.push(eq(quotes.status, filters.status))
  }

  if (filters.search) {
    const pattern = `%${filters.search}%`
    conditions.push(like(quotes.quoteNumber, pattern))
  }

  const where = and(...conditions)

  const [totalResult, rows] = await Promise.all([
    db.select({ total: count() }).from(quotes).where(where),
    db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        customerName: customers.name,
        status: quotes.status,
        totalAmount: quotes.totalAmount,
        validUntil: quotes.validUntil,
        createdAt: quotes.createdAt
      })
      .from(quotes)
      .leftJoin(customers, eq(quotes.customerId, customers.id))
      .where(where)
      .limit(filters.limit)
      .offset(filters.offset)
  ])

  return {
    data: rows as QuoteListItem[],
    total: totalResult[0]?.total ?? 0,
    limit: filters.limit,
    offset: filters.offset
  }
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

/**
 * Returns a single quote with its items, including product name and SKU for each item.
 */
export async function detail(companyId: number, id: number): Promise<QuoteDetail> {
  const db = getDb()

  const quoteRows = await db
    .select({
      id: quotes.id,
      companyId: quotes.companyId,
      customerId: quotes.customerId,
      customerName: customers.name,
      quoteNumber: quotes.quoteNumber,
      status: quotes.status,
      validUntil: quotes.validUntil,
      subtotal: quotes.subtotal,
      discountAmount: quotes.discountAmount,
      taxAmount: quotes.taxAmount,
      totalAmount: quotes.totalAmount,
      notes: quotes.notes,
      cancelledAt: quotes.cancelledAt,
      convertedAt: quotes.convertedAt,
      createdAt: quotes.createdAt,
      updatedAt: quotes.updatedAt
    })
    .from(quotes)
    .leftJoin(customers, eq(quotes.customerId, customers.id))
    .where(and(eq(quotes.id, id), eq(quotes.companyId, companyId)))

  const quote = quoteRows[0]

  if (!quote) {
    throw new NotFoundError('Quote not found')
  }

  // Fetch items with product info
  const items = await db
    .select({
      id: quoteItems.id,
      productId: quoteItems.productId,
      productName: products.name,
      productSku: products.sku,
      quantity: quoteItems.quantity,
      unitPrice: quoteItems.unitPrice,
      discountAmount: quoteItems.discountAmount,
      taxAmount: quoteItems.taxAmount,
      totalAmount: quoteItems.totalAmount,
      createdAt: quoteItems.createdAt
    })
    .from(quoteItems)
    .innerJoin(products, eq(quoteItems.productId, products.id))
    .where(eq(quoteItems.quoteId, id))

  return {
    ...quote,
    items: items as QuoteDetailItem[]
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Creates a new quote for the given company.
 *
 * Validates:
 * - At least one item is provided (items array can be empty per spec)
 * - Each item's product exists in the company
 * - Item quantity > 0, unitPrice > 0, discountAmount >= 0
 *
 * Computes line totals and document total using commercial-utils.
 * Generates a sequential quoteNumber via numbering-service.
 */
export async function create(companyId: number, input: CreateQuoteInput): Promise<QuoteDetail> {
  const db = getDb()

  // Validate items
  validateItems(input.items)

  // Validate all products exist in the company
  await validateProductsExist(
    companyId,
    input.items.map((item) => item.productId)
  )

  const now = new Date().toISOString()

  // Compute line totals for each item
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

  // Compute document totals
  const documentItems = computedItems.map((item) => ({
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountAmount: item.discountAmount,
    taxAmount: item.taxAmount
  }))
  const totals = computeDocumentTotals(documentItems)

  // Execute within a transaction to generate quoteNumber atomically
  const result = await db.transaction(async (tx) => {
    const quoteNumber = await generateNextNumber(tx, companyId, SEQUENCE_TYPES.quote)

    const [createdQuote] = await tx
      .insert(quotes)
      .values({
        companyId,
        customerId: input.customerId,
        quoteNumber,
        status: 'draft',
        validUntil: input.validUntil ?? null,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now
      })
      .returning()

    // Insert items
    if (computedItems.length > 0) {
      await tx.insert(quoteItems).values(
        computedItems.map((item) => ({
          quoteId: createdQuote.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          taxAmount: item.taxAmount,
          totalAmount: item.totalAmount,
          createdAt: now
        }))
      )
    }

    return createdQuote
  })

  // Return the full detail
  return detail(companyId, result.id)
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Updates an existing quote (header and/or items).
 *
 * Validates:
 * - Quote exists and belongs to the company
 * - Quote is in an editable status (draft or sent)
 * - If items are provided, validates products and recomputes totals
 */
export async function update(companyId: number, id: number, input: UpdateQuoteInput): Promise<QuoteDetail> {
  const db = getDb()

  // Fetch existing quote
  const [existing] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, id), eq(quotes.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Quote not found')
  }

  // Guard: only draft or sent quotes are editable
  if (existing.status !== 'draft' && existing.status !== 'sent') {
    throw new BusinessRuleError(
      `Cannot edit quote in "${existing.status}" status. Only draft or sent quotes can be edited.`
    )
  }

  const now = new Date().toISOString()

  // If items are provided, validate and recompute
  if (input.items !== undefined) {
    validateItems(input.items)
    await validateProductsExist(
      companyId,
      input.items.map((item) => item.productId)
    )

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
      // Update quote header
      await tx
        .update(quotes)
        .set({
          ...(input.customerId !== undefined && { customerId: input.customerId }),
          ...(input.validUntil !== undefined && { validUntil: input.validUntil }),
          ...(input.notes !== undefined && { notes: input.notes }),
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          updatedAt: now
        })
        .where(eq(quotes.id, id))

      // Replace items: delete existing and insert new
      await tx.delete(quoteItems).where(eq(quoteItems.quoteId, id))

      if (computedItems.length > 0) {
        await tx.insert(quoteItems).values(
          computedItems.map((item) => ({
            quoteId: id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            taxAmount: item.taxAmount,
            totalAmount: item.totalAmount,
            createdAt: now
          }))
        )
      }
    })
  } else {
    // Only update header fields (no items change)
    await db
      .update(quotes)
      .set({
        ...(input.customerId !== undefined && { customerId: input.customerId }),
        ...(input.validUntil !== undefined && { validUntil: input.validUntil }),
        ...(input.notes !== undefined && { notes: input.notes }),
        updatedAt: now
      })
      .where(eq(quotes.id, id))
  }

  return detail(companyId, id)
}

// ---------------------------------------------------------------------------
// Status Transition
// ---------------------------------------------------------------------------

/**
 * Transitions a quote's status, validating the transition and setting
 * lifecycle timestamps as needed.
 *
 * Records an audit log entry on each successful transition.
 */
export async function transitionStatus(companyId: number, id: number, targetStatus: QuoteStatus): Promise<QuoteDetail> {
  const db = getDb()

  const [existing] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, id), eq(quotes.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Quote not found')
  }

  const currentStatus = existing.status as QuoteStatus
  const result = validateTransition(currentStatus, targetStatus, VALID_QUOTE_TRANSITIONS)

  if (!result.valid) {
    throw new BusinessRuleError(
      `Cannot transition quote from "${result.currentStatus}" to "${targetStatus}". Allowed transitions: ${result.allowed.length > 0 ? result.allowed.join(', ') : 'none (terminal status)'}.`
    )
  }

  const now = new Date().toISOString()

  // Build update fields based on target status
  const updateFields: Record<string, unknown> = {
    status: targetStatus,
    updatedAt: now
  }

  if (targetStatus === 'cancelled') {
    updateFields.cancelledAt = now
  }

  if (targetStatus === 'converted') {
    updateFields.convertedAt = now
  }

  await db.update(quotes).set(updateFields).where(eq(quotes.id, id))

  // Audit log
  await logAudit({
    companyId,
    entityType: 'quote',
    entityId: String(id),
    action: `status_change:${currentStatus}→${targetStatus}`
  })

  return detail(companyId, id)
}

// ---------------------------------------------------------------------------
// Convert to Order
// ---------------------------------------------------------------------------

/**
 * Converts an accepted quote into a sales order.
 *
 * Executes within a single database transaction:
 * 1. Validates quote is in "accepted" status
 * 2. Generates a sales order number
 * 3. Creates the sales order with same customer, status "draft", and copied totals
 * 4. Copies all quote items to order items
 * 5. Records conversion link in quoteOrderConversions
 * 6. Updates quote status to "converted" with convertedAt timestamp
 *
 * On any failure the entire transaction is rolled back.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 15.1, 16.5
 */
export async function convertToOrder(
  companyId: number,
  id: number
): Promise<{ quote: QuoteDetail; salesOrder: SalesOrderDetail }> {
  const db = getDb()

  // Fetch existing quote
  const [existing] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, id), eq(quotes.companyId, companyId)))

  if (!existing) {
    throw new NotFoundError('Quote not found')
  }

  // Validate quote is in "accepted" status
  if (existing.status !== 'accepted') {
    throw new BusinessRuleError(
      `Cannot convert quote in "${existing.status}" status. Only accepted quotes can be converted to orders.`
    )
  }

  // Fetch quote items
  const existingItems = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id))

  const now = new Date().toISOString()

  // Execute the entire conversion within a single transaction
  const result = await db.transaction(async (tx) => {
    // 1. Generate sales order number
    const orderNumber = await generateNextNumber(tx, companyId, SEQUENCE_TYPES.sales_order)

    // 2. Create the sales order with same customer, copied totals, status "draft"
    const [createdOrder] = await tx
      .insert(orders)
      .values({
        companyId,
        customerId: existing.customerId,
        orderNumber,
        orderType: 'sale',
        status: 'draft',
        subtotal: existing.subtotal,
        discountAmount: existing.discountAmount,
        taxAmount: existing.taxAmount,
        totalAmount: existing.totalAmount,
        paymentStatus: 'unpaid',
        createdAt: now,
        updatedAt: now
      })
      .returning()

    // 3. Copy all quote items to order items
    if (existingItems.length > 0) {
      await tx.insert(orderItems).values(
        existingItems.map((item) => ({
          orderId: createdOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          taxAmount: item.taxAmount,
          totalAmount: item.totalAmount,
          createdAt: now
        }))
      )
    }

    // 4. Record conversion link
    await tx.insert(quoteOrderConversions).values({
      quoteId: id,
      orderId: createdOrder.id,
      convertedAt: now,
      createdAt: now
    })

    // 5. Update quote status to "converted" with convertedAt timestamp
    await tx
      .update(quotes)
      .set({
        status: 'converted',
        convertedAt: now,
        updatedAt: now
      })
      .where(eq(quotes.id, id))

    return createdOrder
  })

  // Audit log — after successful transaction
  await logAudit({
    companyId,
    entityType: 'quote',
    entityId: String(id),
    action: 'converted',
    details: JSON.stringify({ salesOrderId: result.id, orderNumber: result.orderNumber })
  })

  // Return both the updated quote and the created sales order
  const updatedQuote = await detail(companyId, id)
  const salesOrder = await getSalesOrderDetail(companyId, result.id)

  return { quote: updatedQuote, salesOrder }
}

/**
 * Internal helper to retrieve sales order detail for conversion result.
 * Fetches the order with items and basic payment info.
 */
async function getSalesOrderDetail(companyId: number, orderId: number): Promise<SalesOrderDetail> {
  const db = getDb()

  const orderRows = await db
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
    .where(and(eq(orders.id, orderId), eq(orders.companyId, companyId)))

  const order = orderRows[0]

  if (!order) {
    throw new NotFoundError('Sales order not found')
  }

  // Fetch items with product info
  const items = await db
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
    .where(eq(orderItems.orderId, orderId))

  return {
    ...order,
    customerName: order.customerName ?? null,
    paymentStatus: (order.paymentStatus as 'unpaid' | 'partially_paid' | 'paid') ?? 'unpaid',
    items: items as SalesOrderDetail['items'],
    payments: [],
    totalPaid: 0,
    remainingBalance: order.totalAmount
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Validates item inputs: quantity > 0, unitPrice > 0, discountAmount >= 0.
 */
function validateItems(items: CreateQuoteInput['items']): void {
  const errors: Record<string, string> = {}

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    if (item.quantity <= 0) {
      errors[`items[${i}].quantity`] = 'Quantity must be greater than 0'
    }

    if (item.unitPrice <= 0) {
      errors[`items[${i}].unitPrice`] = 'Unit price must be greater than 0'
    }

    const discountAmount = item.discountAmount ?? 0
    if (discountAmount < 0) {
      errors[`items[${i}].discountAmount`] = 'Discount amount must be 0 or greater'
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid item data', errors)
  }
}

/**
 * Validates that all product IDs exist and belong to the given company.
 */
async function validateProductsExist(companyId: number, productIds: number[]): Promise<void> {
  if (productIds.length === 0) return

  const db = getDb()

  // Deduplicate product IDs
  const uniqueIds = [...new Set(productIds)]

  for (const productId of uniqueIds) {
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
}
