/**
 * PaymentService — payment registration and listing for sales orders and purchase orders.
 *
 * All operations are company-scoped. Enforces:
 * - Order must be in eligible status for payments
 * - Amount must be positive
 * - Amount must not cause total paid to exceed document total
 * - Payment creation and status recalculation within a single transaction
 * - Audit log on payment creation
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 15.3, 16.4
 */

import { and, eq, sum } from 'drizzle-orm'

import { BusinessRuleError, NotFoundError, ValidationError } from '../api/errors'
import { orderPayments, orders, purchaseOrderPayments, purchaseOrders } from '../db/schema'
import { getDb } from '../server'
import { logAudit } from './audit-service'
import type { PaymentRecord, PaymentStatusValue, PaymentSummary, RegisterPaymentInput } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Computes the payment status based on totalPaid vs documentTotal.
 */
function derivePaymentStatus(totalPaid: number, documentTotal: number): PaymentStatusValue {
  if (totalPaid <= 0) return 'unpaid'
  if (totalPaid >= documentTotal) return 'paid'
  return 'partially_paid'
}

/**
 * Maps PaymentStatusValue back to DB column value.
 * The DB uses 'pending' for unpaid.
 */
function toDbPaymentStatus(status: PaymentStatusValue): string {
  if (status === 'unpaid') return 'pending'
  return status
}

/** Eligible statuses for receiving payments on a sales order. */
const SALES_ORDER_PAYMENT_ELIGIBLE_STATUSES = new Set(['confirmed', 'partially_fulfilled', 'fulfilled'])

/** Eligible statuses for receiving payments on a purchase order. */
const PURCHASE_ORDER_PAYMENT_ELIGIBLE_STATUSES = new Set(['sent', 'partially_received', 'received'])

// ---------------------------------------------------------------------------
// List payments for Sales Order
// ---------------------------------------------------------------------------

/**
 * Returns the payment summary for a given sales order, including all payments,
 * documentTotal, totalPaid, remainingBalance, and computed paymentStatus.
 *
 * Throws NotFoundError if the order does not exist or does not belong to the company.
 */
export async function listForSalesOrder(companyId: number, orderId: number): Promise<PaymentSummary> {
  const db = getDb()

  const [order] = await db
    .select({
      id: orders.id,
      totalAmount: orders.totalAmount,
      paymentStatus: orders.paymentStatus
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.companyId, companyId)))

  if (!order) {
    throw new NotFoundError('Sales order not found')
  }

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
    .where(eq(orderPayments.orderId, orderId))

  const payments: PaymentRecord[] = paymentRows.map((row) => ({
    id: row.id,
    paymentMethodId: row.paymentMethodId,
    amount: row.amount,
    status: row.status,
    transactionReference: row.transactionReference ?? null,
    paidAt: row.paidAt ?? null,
    createdAt: row.createdAt
  }))

  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0)
  const documentTotal = order.totalAmount
  const remainingBalance = documentTotal - totalPaid
  const paymentStatus = derivePaymentStatus(totalPaid, documentTotal)

  return { payments, documentTotal, totalPaid, remainingBalance, paymentStatus }
}

// ---------------------------------------------------------------------------
// List payments for Purchase Order
// ---------------------------------------------------------------------------

/**
 * Returns the payment summary for a given purchase order, including all payments,
 * documentTotal, totalPaid, remainingBalance, and computed paymentStatus.
 *
 * Throws NotFoundError if the PO does not exist or does not belong to the company.
 */
export async function listForPurchaseOrder(companyId: number, purchaseOrderId: number): Promise<PaymentSummary> {
  const db = getDb()

  const [po] = await db
    .select({
      id: purchaseOrders.id,
      totalAmount: purchaseOrders.totalAmount,
      paymentStatus: purchaseOrders.paymentStatus
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.companyId, companyId)))

  if (!po) {
    throw new NotFoundError('Purchase order not found')
  }

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
    .where(eq(purchaseOrderPayments.purchaseOrderId, purchaseOrderId))

  const payments: PaymentRecord[] = paymentRows.map((row) => ({
    id: row.id,
    paymentMethodId: row.paymentMethodId,
    amount: row.amount,
    status: row.status,
    transactionReference: row.transactionReference ?? null,
    paidAt: row.paidAt ?? null,
    createdAt: row.createdAt
  }))

  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0)
  const documentTotal = po.totalAmount
  const remainingBalance = documentTotal - totalPaid
  const paymentStatus = derivePaymentStatus(totalPaid, documentTotal)

  return { payments, documentTotal, totalPaid, remainingBalance, paymentStatus }
}

// ---------------------------------------------------------------------------
// Register payment for Sales Order
// ---------------------------------------------------------------------------

/**
 * Registers a payment against a sales order.
 *
 * Validates:
 * - Order exists and belongs to the company
 * - Order is in eligible status (confirmed, partially_fulfilled, fulfilled)
 * - Amount is positive
 * - Amount does not cause total paid to exceed document total
 *
 * Creates the payment record and recalculates payment status within a single transaction.
 * Logs an audit entry after successful creation.
 */
export async function registerForSalesOrder(
  companyId: number,
  orderId: number,
  input: RegisterPaymentInput
): Promise<PaymentRecord> {
  const db = getDb()

  // Validate amount
  if (input.amount <= 0) {
    throw new ValidationError('Payment amount must be greater than zero', {
      amount: 'Amount must be greater than zero'
    })
  }

  // Fetch order
  const [order] = await db
    .select({
      id: orders.id,
      status: orders.status,
      totalAmount: orders.totalAmount
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.companyId, companyId)))

  if (!order) {
    throw new NotFoundError('Sales order not found')
  }

  // Validate eligible status
  if (!SALES_ORDER_PAYMENT_ELIGIBLE_STATUSES.has(order.status)) {
    throw new BusinessRuleError(
      `Cannot register payment for sales order in "${order.status}" status. Allowed statuses: confirmed, partially_fulfilled, fulfilled`
    )
  }

  // Compute current total paid
  const [sumResult] = await db
    .select({ total: sum(orderPayments.amount) })
    .from(orderPayments)
    .where(eq(orderPayments.orderId, orderId))

  const currentTotalPaid = Number(sumResult?.total ?? 0)
  const remaining = order.totalAmount - currentTotalPaid

  // Validate amount doesn't exceed remaining
  if (input.amount > remaining) {
    throw new BusinessRuleError(`Payment amount (${input.amount}) exceeds remaining balance (${remaining})`)
  }

  const now = new Date().toISOString()

  // Execute within transaction
  const result = await db.transaction(async (tx) => {
    const [payment] = await tx
      .insert(orderPayments)
      .values({
        orderId,
        paymentMethodId: input.paymentMethodId,
        amount: input.amount,
        status: 'completed',
        transactionReference: input.transactionReference ?? null,
        paidAt: input.paidAt,
        createdAt: now
      })
      .returning()

    // Recalculate payment status
    const newTotalPaid = currentTotalPaid + input.amount
    const newPaymentStatus = derivePaymentStatus(newTotalPaid, order.totalAmount)

    await tx
      .update(orders)
      .set({ paymentStatus: toDbPaymentStatus(newPaymentStatus) })
      .where(eq(orders.id, orderId))

    return payment
  })

  // Audit log
  await logAudit({
    companyId,
    entityType: 'payment',
    entityId: String(result.id),
    action: 'create',
    details: `orderId:${orderId}`
  })

  return {
    id: result.id,
    paymentMethodId: result.paymentMethodId,
    amount: result.amount,
    status: result.status,
    transactionReference: result.transactionReference ?? null,
    paidAt: result.paidAt ?? null,
    createdAt: result.createdAt
  }
}

// ---------------------------------------------------------------------------
// Register payment for Purchase Order
// ---------------------------------------------------------------------------

/**
 * Registers a payment against a purchase order.
 *
 * Validates:
 * - PO exists and belongs to the company
 * - PO is in eligible status (sent, partially_received, received)
 * - Amount is positive
 * - Amount does not cause total paid to exceed document total
 *
 * Creates the payment record and recalculates payment status within a single transaction.
 * Logs an audit entry after successful creation.
 */
export async function registerForPurchaseOrder(
  companyId: number,
  purchaseOrderId: number,
  input: RegisterPaymentInput
): Promise<PaymentRecord> {
  const db = getDb()

  // Validate amount
  if (input.amount <= 0) {
    throw new ValidationError('Payment amount must be greater than zero', {
      amount: 'Amount must be greater than zero'
    })
  }

  // Fetch purchase order
  const [po] = await db
    .select({
      id: purchaseOrders.id,
      status: purchaseOrders.status,
      totalAmount: purchaseOrders.totalAmount
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, purchaseOrderId), eq(purchaseOrders.companyId, companyId)))

  if (!po) {
    throw new NotFoundError('Purchase order not found')
  }

  // Validate eligible status
  if (!PURCHASE_ORDER_PAYMENT_ELIGIBLE_STATUSES.has(po.status)) {
    throw new BusinessRuleError(
      `Cannot register payment for purchase order in "${po.status}" status. Allowed statuses: sent, partially_received, received`
    )
  }

  // Compute current total paid
  const [sumResult] = await db
    .select({ total: sum(purchaseOrderPayments.amount) })
    .from(purchaseOrderPayments)
    .where(eq(purchaseOrderPayments.purchaseOrderId, purchaseOrderId))

  const currentTotalPaid = Number(sumResult?.total ?? 0)
  const remaining = po.totalAmount - currentTotalPaid

  // Validate amount doesn't exceed remaining
  if (input.amount > remaining) {
    throw new BusinessRuleError(`Payment amount (${input.amount}) exceeds remaining balance (${remaining})`)
  }

  const now = new Date().toISOString()

  // Execute within transaction
  const result = await db.transaction(async (tx) => {
    const [payment] = await tx
      .insert(purchaseOrderPayments)
      .values({
        purchaseOrderId,
        paymentMethodId: input.paymentMethodId,
        amount: input.amount,
        status: 'completed',
        transactionReference: input.transactionReference ?? null,
        paidAt: input.paidAt,
        createdAt: now
      })
      .returning()

    // Recalculate payment status
    const newTotalPaid = currentTotalPaid + input.amount
    const newPaymentStatus = derivePaymentStatus(newTotalPaid, po.totalAmount)

    await tx
      .update(purchaseOrders)
      .set({ paymentStatus: toDbPaymentStatus(newPaymentStatus) })
      .where(eq(purchaseOrders.id, purchaseOrderId))

    return payment
  })

  // Audit log
  await logAudit({
    companyId,
    entityType: 'payment',
    entityId: String(result.id),
    action: 'create',
    details: `purchaseOrderId:${purchaseOrderId}`
  })

  return {
    id: result.id,
    paymentMethodId: result.paymentMethodId,
    amount: result.amount,
    status: result.status,
    transactionReference: result.transactionReference ?? null,
    paidAt: result.paidAt ?? null,
    createdAt: result.createdAt
  }
}
