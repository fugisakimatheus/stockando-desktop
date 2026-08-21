/**
 * InstallmentService — manages payment installment plans for orders.
 *
 * Provides:
 * - `listForOrder(companyId, orderType, orderId)` — installments with computed totals and derived status
 * - `createPlan(companyId, input)` — validate sum matches Document_Total, create installment records
 * - `settle(companyId, installmentId, input)` — atomic settlement with transaction + balance update + audit
 *
 * All queries enforce company scoping. Settlement executes atomically within a
 * single SQLite transaction for consistency.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.3, 2.6, 2.7, 9.1, 15.1
 */

import { and, eq } from 'drizzle-orm'
import { match } from 'ts-pattern'

import {
  BusinessRuleError,
  InvalidSettlementAmountError,
  InstallmentSumMismatchError,
  NotFoundError
} from '../api/errors'
import { financialAccounts, installments, orders, purchaseOrders } from '../db/schema'
import { getDb } from '../server'
import type {
  CreatePaymentPlanInput,
  InstallmentItem,
  InstallmentSummary,
  OrderType,
  SettleInstallmentInput,
  SettlementResult,
  TransactionType
} from '../types/finance'
import { log, logAudit } from './audit-service'
import { updateBalance } from './financial-account-service'
import { create as createTransaction } from './financial-transaction-service'
import { classifyOverdue, computeInstallmentTotals, deriveFinancialStatus } from './financial-utils'
import type { AuditLogEntry } from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the installment summary for an order including all installments,
 * computed totals, derived financial status, and overdue classification.
 *
 * Enforces company scoping — the order must belong to the given company.
 */
export async function listForOrder(
  companyId: number,
  orderType: OrderType,
  orderId: number
): Promise<InstallmentSummary> {
  const db = getDb()

  // Get the order's Document_Total
  const documentTotal = await getOrderTotal(companyId, orderType, orderId)

  // Fetch all installments for the order
  const rows = await db
    .select()
    .from(installments)
    .where(
      and(
        eq(installments.companyId, companyId),
        eq(installments.orderType, orderType),
        eq(installments.orderId, orderId)
      )
    )
    .orderBy(installments.installmentNumber)

  // Map rows to InstallmentItem with overdue classification
  const items: InstallmentItem[] = rows.map((row) => ({
    id: row.id,
    installmentNumber: row.installmentNumber,
    amount: row.amount,
    dueDate: row.dueDate,
    status: row.status as InstallmentItem['status'],
    isOverdue: classifyOverdue(row.status as InstallmentItem['status'], row.dueDate),
    settledAt: row.settledAt,
    accountId: row.accountId
  }))

  // Compute totals
  const totals = computeInstallmentTotals(
    items.map((item) => ({
      amount: item.amount,
      status: item.status,
      dueDate: item.dueDate
    }))
  )

  // Derive financial status
  const financialStatus = deriveFinancialStatus(totals.totalExpected, totals.totalPaid)

  return {
    orderId,
    orderType,
    documentTotal,
    totalExpected: totals.totalExpected,
    totalPaid: totals.totalPaid,
    totalOverdue: totals.totalOverdue,
    remainingBalance: totals.remainingBalance,
    financialStatus,
    installments: items
  }
}

/**
 * Creates a payment plan (set of installments) for an order.
 *
 * Validates that the sum of all installment amounts equals the order's Document_Total.
 * Rejects with INSTALLMENT_SUM_MISMATCH if the sum does not match.
 */
export async function createPlan(companyId: number, input: CreatePaymentPlanInput): Promise<InstallmentSummary> {
  const db = getDb()

  // Get the order's Document_Total
  const documentTotal = await getOrderTotal(companyId, input.orderType, input.orderId)

  // Validate installment amounts sum to Document_Total
  const installmentSum = input.installments.reduce((sum, inst) => sum + inst.amount, 0)

  // Use a small epsilon for floating-point comparison
  if (Math.abs(installmentSum - documentTotal) > 0.01) {
    throw new InstallmentSumMismatchError(
      `Installment amounts sum to ${installmentSum} but order total is ${documentTotal}`
    )
  }

  const now = new Date().toISOString()

  // Insert all installments with sequential installmentNumber
  for (let i = 0; i < input.installments.length; i++) {
    const inst = input.installments[i]
    await db.insert(installments).values({
      companyId,
      orderId: input.orderId,
      orderType: input.orderType,
      installmentNumber: i + 1,
      amount: inst.amount,
      dueDate: inst.dueDate,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    })
  }

  // Record audit log
  await logAudit({
    companyId,
    entityType: 'payment_plan',
    entityId: `${input.orderType}:${input.orderId}`,
    action: 'created',
    details: JSON.stringify({
      orderType: input.orderType,
      orderId: input.orderId,
      installmentCount: input.installments.length,
      totalAmount: documentTotal
    })
  })

  // Return the full summary
  return listForOrder(companyId, input.orderType, input.orderId)
}

/**
 * Settles an installment within a single database transaction.
 *
 * Validates:
 * - Installment exists and belongs to the company
 * - Installment is in "pending" status
 * - Installment amount is > 0
 * - Financial account exists, belongs to the company, and is active
 *
 * Within the transaction:
 * 1. Updates installment status to "paid" with settledAt and accountId
 * 2. Creates a Financial_Transaction linked to the account
 * 3. Updates the financial account balance
 * 4. Records an audit log entry
 */
export async function settle(
  companyId: number,
  installmentId: number,
  input: SettleInstallmentInput
): Promise<SettlementResult> {
  const db = getDb()

  return db.transaction(async (tx) => {
    // 1. Load installment and validate
    const [installment] = await tx
      .select()
      .from(installments)
      .where(and(eq(installments.id, installmentId), eq(installments.companyId, companyId)))

    if (!installment) {
      throw new NotFoundError(`Installment with id ${installmentId} not found`)
    }

    if (installment.status !== 'pending') {
      throw new BusinessRuleError(
        `Installment must be in pending status to settle. Current status: ${installment.status}`
      )
    }

    // Validate amount > 0 (Requirement 1.8)
    if (installment.amount <= 0) {
      throw new InvalidSettlementAmountError()
    }

    // 2. Validate financial account exists, belongs to company, and is active
    const [account] = await tx
      .select()
      .from(financialAccounts)
      .where(and(eq(financialAccounts.id, input.accountId), eq(financialAccounts.companyId, companyId)))

    if (!account) {
      throw new NotFoundError(`Financial account with id ${input.accountId} not found`)
    }

    if (account.status !== 'active') {
      throw new BusinessRuleError('Financial account must be active for settlement')
    }

    // 3. Update installment to "paid"
    const now = new Date().toISOString()
    await tx
      .update(installments)
      .set({
        status: 'paid',
        settledAt: now,
        accountId: input.accountId,
        updatedAt: now
      })
      .where(eq(installments.id, installmentId))

    // 4. Determine transaction type based on order type
    const transactionType: TransactionType = match(installment.orderType)
      .with('sales_order', () => 'inbound' as const)
      .with('purchase_order', () => 'outbound' as const)
      .otherwise(() => 'inbound' as const)

    // 5. Create Financial_Transaction
    const transaction = await createTransaction(tx, companyId, {
      accountId: input.accountId,
      transactionType,
      referenceType: installment.orderType,
      referenceId: String(installment.orderId),
      amount: installment.amount,
      description: input.description ?? `Settlement of installment #${installment.installmentNumber}`,
      transactionDate: input.transactionDate
    })

    // 6. Update account balance (positive for inbound, negative for outbound)
    const signedAmount = transactionType === 'inbound' ? installment.amount : -installment.amount
    await updateBalance(tx, input.accountId, signedAmount)

    // 7. Record audit log
    const auditEntry: AuditLogEntry = {
      companyId,
      entityType: 'installment',
      entityId: String(installmentId),
      action: 'settled',
      details: JSON.stringify({
        amount: installment.amount,
        accountId: input.accountId,
        transactionType,
        transactionId: transaction.id,
        orderType: installment.orderType,
        orderId: installment.orderId
      })
    }
    await log(tx, auditEntry)

    // 8. Build the result
    const updatedInstallment: InstallmentItem = {
      id: installment.id,
      installmentNumber: installment.installmentNumber,
      amount: installment.amount,
      dueDate: installment.dueDate,
      status: 'paid',
      isOverdue: false,
      settledAt: now,
      accountId: input.accountId
    }

    // Get the updated summary (outside transaction scope we re-read from the same tx)
    const updatedSummary = await buildSummaryFromTx(
      tx,
      companyId,
      installment.orderType as OrderType,
      installment.orderId
    )

    return {
      installment: updatedInstallment,
      transaction,
      updatedSummary
    }
  })
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Retrieves the Document_Total for an order based on orderType.
 * Throws NotFoundError if the order doesn't exist or doesn't belong to the company.
 */
async function getOrderTotal(companyId: number, orderType: OrderType, orderId: number): Promise<number> {
  const db = getDb()

  return match(orderType)
    .with('sales_order', async () => {
      const [order] = await db
        .select({ totalAmount: orders.totalAmount })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.companyId, companyId)))

      if (!order) {
        throw new NotFoundError(`Sales order with id ${orderId} not found`)
      }
      return order.totalAmount
    })
    .with('purchase_order', async () => {
      const [order] = await db
        .select({ totalAmount: purchaseOrders.totalAmount })
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.id, orderId), eq(purchaseOrders.companyId, companyId)))

      if (!order) {
        throw new NotFoundError(`Purchase order with id ${orderId} not found`)
      }
      return order.totalAmount
    })
    .exhaustive()
}

/**
 * Builds an InstallmentSummary from within a transaction context.
 * Used after settlement to return the refreshed summary.
 */
async function buildSummaryFromTx(
  tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
  companyId: number,
  orderType: OrderType,
  orderId: number
): Promise<InstallmentSummary> {
  // Get the order total
  const documentTotal = await getOrderTotal(companyId, orderType, orderId)

  // Fetch installments from within the transaction
  const rows = await tx
    .select()
    .from(installments)
    .where(
      and(
        eq(installments.companyId, companyId),
        eq(installments.orderType, orderType),
        eq(installments.orderId, orderId)
      )
    )
    .orderBy(installments.installmentNumber)

  const items: InstallmentItem[] = rows.map((row) => ({
    id: row.id,
    installmentNumber: row.installmentNumber,
    amount: row.amount,
    dueDate: row.dueDate,
    status: row.status as InstallmentItem['status'],
    isOverdue: classifyOverdue(row.status as InstallmentItem['status'], row.dueDate),
    settledAt: row.settledAt,
    accountId: row.accountId
  }))

  const totals = computeInstallmentTotals(
    items.map((item) => ({
      amount: item.amount,
      status: item.status,
      dueDate: item.dueDate
    }))
  )

  const financialStatus = deriveFinancialStatus(totals.totalExpected, totals.totalPaid)

  return {
    orderId,
    orderType,
    documentTotal,
    totalExpected: totals.totalExpected,
    totalPaid: totals.totalPaid,
    totalOverdue: totals.totalOverdue,
    remainingBalance: totals.remainingBalance,
    financialStatus,
    installments: items
  }
}
