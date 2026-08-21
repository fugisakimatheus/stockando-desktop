/**
 * FinancialTransactionService — manages financial transactions for accounts.
 *
 * Provides:
 * - `listForAccount(companyId, accountId, pagination)` — paginated transaction list with running balance
 * - `create(tx, companyId, input)` — transactional transaction insert with audit logging
 *
 * Running balance is computed from the account's initial balance plus the cumulative
 * sum of all transactions ordered chronologically.
 *
 * Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 9.4, 12.1
 */

import { and, count, desc, eq, lte, or, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { NotFoundError } from '../api/errors'
import type * as schema from '../db/schema'
import { financialAccounts, financialTransactions } from '../db/schema'
import { getDb } from '../server'
import type {
  CreateTransactionInput,
  FinancialTransaction,
  Pagination,
  TransactionListResult,
  TransactionWithBalance
} from '../types/finance'
import { log } from './audit-service'
import type { AuditLogEntry } from './types'

// ---------------------------------------------------------------------------
// Transaction type alias
// ---------------------------------------------------------------------------

type DrizzleTx = BetterSQLite3Database<typeof schema>

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of transactions for a financial account with running balance.
 *
 * Running balance is computed as: account initialBalance + cumulative sum of all prior
 * transaction amounts (ordered by transactionDate ASC, id ASC).
 *
 * Transactions are returned in DESC order (most recent first) for display.
 * Each transaction includes its running balance at that point in time.
 *
 * Enforces company scoping — the account must belong to the given company.
 */
export async function listForAccount(
  companyId: number,
  accountId: number,
  pagination: Pagination
): Promise<TransactionListResult> {
  const db = getDb()

  // Validate the account exists and belongs to the company
  const [account] = await db
    .select({
      id: financialAccounts.id,
      initialBalance: financialAccounts.initialBalance
    })
    .from(financialAccounts)
    .where(and(eq(financialAccounts.id, accountId), eq(financialAccounts.companyId, companyId)))

  if (!account) {
    throw new NotFoundError(`Financial account with id ${accountId} not found`)
  }

  // Get total count
  const [totalResult] = await db
    .select({ value: count() })
    .from(financialTransactions)
    .where(and(eq(financialTransactions.companyId, companyId), eq(financialTransactions.accountId, accountId)))

  const total = totalResult?.value ?? 0

  // Fetch paginated transactions ordered by transactionDate DESC, id DESC (most recent first)
  const rows = await db
    .select({
      id: financialTransactions.id,
      transactionType: financialTransactions.transactionType,
      referenceType: financialTransactions.referenceType,
      referenceId: financialTransactions.referenceId,
      amount: financialTransactions.amount,
      description: financialTransactions.description,
      transactionDate: financialTransactions.transactionDate,
      createdAt: financialTransactions.createdAt
    })
    .from(financialTransactions)
    .where(and(eq(financialTransactions.companyId, companyId), eq(financialTransactions.accountId, accountId)))
    .orderBy(desc(financialTransactions.transactionDate), desc(financialTransactions.id))
    .limit(pagination.limit)
    .offset(pagination.offset)

  // Compute running balance for each transaction.
  // Strategy: for each transaction in the page, the running balance is:
  //   initialBalance + SUM(signed amounts of all transactions up to and including this one)
  //
  // A transaction's signed amount is:
  //   +amount for "inbound", -amount for "outbound"
  //
  // We compute this by finding the cumulative sum of all transactions that come
  // chronologically before or at the same position as the current transaction.
  const transactions: TransactionWithBalance[] = await Promise.all(
    rows.map(async (row) => {
      // Sum all transactions up to and including this one (by date ASC, id ASC order)
      const [sumResult] = await db
        .select({
          total: sql<number>`COALESCE(SUM(CASE WHEN transaction_type = 'inbound' THEN amount ELSE -amount END), 0)`
        })
        .from(financialTransactions)
        .where(
          and(
            eq(financialTransactions.companyId, companyId),
            eq(financialTransactions.accountId, accountId),
            or(
              sql`${financialTransactions.transactionDate} < ${row.transactionDate}`,
              and(eq(financialTransactions.transactionDate, row.transactionDate), lte(financialTransactions.id, row.id))
            )
          )
        )

      const cumulativeSum = sumResult?.total ?? 0
      const runningBalance = account.initialBalance + cumulativeSum

      return {
        id: row.id,
        transactionType: row.transactionType as TransactionWithBalance['transactionType'],
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        amount: row.amount,
        description: row.description,
        transactionDate: row.transactionDate,
        runningBalance,
        createdAt: row.createdAt
      }
    })
  )

  return {
    transactions,
    total,
    limit: pagination.limit,
    offset: pagination.offset
  }
}

/**
 * Creates a financial transaction within the caller's transaction context.
 *
 * Classifies the transaction as "inbound" for sales order settlements and
 * "outbound" for purchase order settlements based on the input transactionType.
 *
 * Records an audit log entry for the transaction creation.
 *
 * Must be called within a db.transaction() block — the caller manages the transaction.
 */
export async function create(
  tx: DrizzleTx,
  companyId: number,
  input: CreateTransactionInput
): Promise<FinancialTransaction> {
  const now = new Date().toISOString()

  const [inserted] = await tx
    .insert(financialTransactions)
    .values({
      companyId,
      accountId: input.accountId,
      transactionType: input.transactionType,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      amount: input.amount,
      description: input.description ?? null,
      transactionDate: input.transactionDate,
      createdAt: now
    })
    .returning()

  // Record audit log within the same transaction
  const auditEntry: AuditLogEntry = {
    companyId,
    entityType: 'financial_transaction',
    entityId: String(inserted.id),
    action: 'created',
    details: JSON.stringify({
      amount: input.amount,
      accountId: input.accountId,
      transactionType: input.transactionType,
      referenceType: input.referenceType,
      referenceId: input.referenceId
    })
  }

  await log(tx, auditEntry)

  return {
    id: inserted.id,
    companyId: inserted.companyId,
    accountId: inserted.accountId,
    transactionType: inserted.transactionType as FinancialTransaction['transactionType'],
    referenceType: inserted.referenceType,
    referenceId: inserted.referenceId,
    amount: inserted.amount,
    description: inserted.description,
    transactionDate: inserted.transactionDate,
    createdAt: inserted.createdAt
  }
}
