/**
 * FinancialAccountService — manages financial account queries and balance updates.
 *
 * Provides:
 * - `list(companyId)` — active accounts with current balance
 * - `detail(companyId, id)` — account detail with recent transaction count
 * - `overview(companyId)` — aggregated receivable/payable/overdue totals from installments
 * - `updateBalance(tx, accountId, amount)` — atomic balance update within caller's transaction
 *
 * All queries enforce company scoping. Balance updates use SQL expressions for atomicity.
 *
 * Requirements: 3.3, 3.4, 3.5, 2.2, 12.1
 */

import { and, count, desc, eq, lt, sql, sum } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { NotFoundError } from '../api/errors'
import type * as schema from '../db/schema'
import { financialAccounts, financialTransactions, installments } from '../db/schema'
import { getDb } from '../server'
import type {
  FinancialAccountDetail,
  FinancialAccountListItem,
  FinancialOverview,
  FinancialTransaction
} from '../types/finance'

// ---------------------------------------------------------------------------
// Transaction type alias
// ---------------------------------------------------------------------------

type DrizzleTx = BetterSQLite3Database<typeof schema>

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all active financial accounts for the given company.
 *
 * Only accounts with status "active" are returned.
 */
export async function list(companyId: number): Promise<FinancialAccountListItem[]> {
  const db = getDb()

  const rows = await db
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      accountType: financialAccounts.accountType,
      bankName: financialAccounts.bankName,
      currentBalance: financialAccounts.currentBalance,
      status: financialAccounts.status
    })
    .from(financialAccounts)
    .where(and(eq(financialAccounts.companyId, companyId), eq(financialAccounts.status, 'active')))

  return rows
}

/**
 * Returns detailed information for a specific financial account.
 *
 * Includes the count of transactions from the last 30 days.
 * Throws NotFoundError if account is not found or doesn't belong to the company.
 */
export async function detail(companyId: number, id: number): Promise<FinancialAccountDetail> {
  const db = getDb()

  const [account] = await db
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      accountType: financialAccounts.accountType,
      bankName: financialAccounts.bankName,
      initialBalance: financialAccounts.initialBalance,
      currentBalance: financialAccounts.currentBalance,
      status: financialAccounts.status
    })
    .from(financialAccounts)
    .where(and(eq(financialAccounts.id, id), eq(financialAccounts.companyId, companyId)))

  if (!account) {
    throw new NotFoundError('Financial account not found')
  }

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString()

  const [txCount] = await db
    .select({ value: count() })
    .from(financialTransactions)
    .where(
      and(
        eq(financialTransactions.accountId, id),
        eq(financialTransactions.companyId, companyId),
        sql`${financialTransactions.createdAt} >= ${thirtyDaysAgoIso}`
      )
    )

  return {
    ...account,
    recentTransactionCount: txCount?.value ?? 0
  }
}

/**
 * Computes the financial overview for a company from installment data.
 *
 * Aggregates:
 * - totalReceivable: pending sales_order installments
 * - totalPayable: pending purchase_order installments
 * - totalOverdueReceivables: pending sales_order installments past due date
 * - totalOverduePayables: pending purchase_order installments past due date
 * - recentTransactions: last 10 financial transactions for the company
 */
export async function overview(companyId: number): Promise<FinancialOverview> {
  const db = getDb()

  const today = new Date().toISOString().slice(0, 10)

  // Total receivable: pending sales_order installments
  const [receivableResult] = await db
    .select({ value: sum(installments.amount) })
    .from(installments)
    .where(
      and(
        eq(installments.companyId, companyId),
        eq(installments.orderType, 'sales_order'),
        eq(installments.status, 'pending')
      )
    )

  // Total payable: pending purchase_order installments
  const [payableResult] = await db
    .select({ value: sum(installments.amount) })
    .from(installments)
    .where(
      and(
        eq(installments.companyId, companyId),
        eq(installments.orderType, 'purchase_order'),
        eq(installments.status, 'pending')
      )
    )

  // Total overdue receivables: pending sales_order installments past due
  const [overdueReceivableResult] = await db
    .select({ value: sum(installments.amount) })
    .from(installments)
    .where(
      and(
        eq(installments.companyId, companyId),
        eq(installments.orderType, 'sales_order'),
        eq(installments.status, 'pending'),
        lt(installments.dueDate, today)
      )
    )

  // Total overdue payables: pending purchase_order installments past due
  const [overduePayableResult] = await db
    .select({ value: sum(installments.amount) })
    .from(installments)
    .where(
      and(
        eq(installments.companyId, companyId),
        eq(installments.orderType, 'purchase_order'),
        eq(installments.status, 'pending'),
        lt(installments.dueDate, today)
      )
    )

  // Recent transactions: last 10 for the company
  const recentTxRows = await db
    .select({
      id: financialTransactions.id,
      companyId: financialTransactions.companyId,
      accountId: financialTransactions.accountId,
      transactionType: financialTransactions.transactionType,
      referenceType: financialTransactions.referenceType,
      referenceId: financialTransactions.referenceId,
      amount: financialTransactions.amount,
      description: financialTransactions.description,
      transactionDate: financialTransactions.transactionDate,
      createdAt: financialTransactions.createdAt
    })
    .from(financialTransactions)
    .where(eq(financialTransactions.companyId, companyId))
    .orderBy(desc(financialTransactions.createdAt))
    .limit(10)

  const recentTransactions: FinancialTransaction[] = recentTxRows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    accountId: row.accountId,
    transactionType: row.transactionType as FinancialTransaction['transactionType'],
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    amount: row.amount,
    description: row.description,
    transactionDate: row.transactionDate,
    createdAt: row.createdAt
  }))

  return {
    totalReceivable: Number(receivableResult?.value ?? 0),
    totalPayable: Number(payableResult?.value ?? 0),
    totalOverdueReceivables: Number(overdueReceivableResult?.value ?? 0),
    totalOverduePayables: Number(overduePayableResult?.value ?? 0),
    recentTransactions
  }
}

/**
 * Atomically increments (or decrements) a financial account's current balance.
 *
 * Must be called within the caller's transaction context to maintain
 * consistency with related operations (e.g., installment settlement).
 */
export async function updateBalance(tx: DrizzleTx, accountId: number, amount: number): Promise<void> {
  await tx
    .update(financialAccounts)
    .set({
      currentBalance: sql`${financialAccounts.currentBalance} + ${amount}`
    })
    .where(eq(financialAccounts.id, accountId))
}
