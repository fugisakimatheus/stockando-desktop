/**
 * Property-based tests for Financial Services.
 *
 * **Validates: Requirements 2.4, 2.5, 3.4**
 *
 * Property 7: Transaction type classification
 * "For any transaction created with transactionType 'inbound', the stored record
 * SHALL have transactionType 'inbound'. Same for 'outbound'. The classification
 * is preserved exactly as provided."
 *
 * Property 8: Running balance computation
 * "For any account with N transactions (mix of inbound and outbound), the running
 * balance of the chronologically last transaction SHALL equal initialBalance +
 * sum(signedAmounts) where inbound is +amount and outbound is -amount."
 *
 * Property 6: Financial overview aggregation
 * "For any set of installments (mix of sales_order/purchase_order, pending/paid,
 * various due dates), the financial overview SHALL correctly compute:
 *   totalReceivable = sum of pending sales_order installment amounts
 *   totalPayable = sum of pending purchase_order installment amounts
 *   totalOverdueReceivables = sum of pending sales_order installments with dueDate < today
 *   totalOverduePayables = sum of pending purchase_order installments with dueDate < today"
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'
import { overview } from '../financial-account-service'
import { create, listForAccount } from '../financial-transaction-service'

vi.mock('../../server', () => ({
  getDb: vi.fn()
}))

import { getDb } from '../../server'

const mockedGetDb = vi.mocked(getDb)

// ---------------------------------------------------------------------------
// Test database setup
// ---------------------------------------------------------------------------

function createTestDb(): Database.Database {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  sqlite.exec(`
    CREATE TABLE companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      document_number TEXT NOT NULL,
      trade_name TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE financial_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      bank_name TEXT,
      initial_balance REAL NOT NULL DEFAULT 0,
      current_balance REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE financial_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
      transaction_type TEXT NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      amount REAL NOT NULL,
      description TEXT,
      transaction_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX financial_transactions_company_idx ON financial_transactions(company_id);
    CREATE INDEX financial_transactions_account_idx ON financial_transactions(account_id);
    CREATE INDEX financial_transactions_date_idx ON financial_transactions(transaction_date);

    CREATE TABLE installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL,
      order_type TEXT NOT NULL,
      installment_number INTEGER NOT NULL,
      amount REAL NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      settled_at TEXT,
      account_id INTEGER REFERENCES financial_accounts(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX installments_company_order_idx ON installments(company_id, order_id, order_type);
    CREATE INDEX installments_company_status_idx ON installments(company_id, status);

    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX audit_logs_company_idx ON audit_logs(company_id);
    CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
    CREATE INDEX audit_logs_user_idx ON audit_logs(user_id);
  `)

  return sqlite
}

function seedCompanyAndUser(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (1, 'Test Company', '12345678000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

    INSERT INTO users (id, company_id, name, email, role, status, created_at, updated_at)
    VALUES (1, 1, 'Admin User', 'admin@test.com', 'admin', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

function seedAccount(sqlite: Database.Database, initialBalance: number): void {
  sqlite.exec(`
    INSERT INTO financial_accounts (id, company_id, name, account_type, initial_balance, current_balance, status, created_at, updated_at)
    VALUES (1, 1, 'Test Account', 'checking', ${initialBalance}, ${initialBalance}, 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const transactionTypeArb = fc.constantFrom('inbound' as const, 'outbound' as const)

const amountArb = fc
  .double({ min: 0.01, max: 99999.99, noNaN: true, noDefaultInfinity: true })
  .map((v) => Math.round(v * 100) / 100)

const initialBalanceArb = fc
  .double({ min: 0, max: 99999.99, noNaN: true, noDefaultInfinity: true })
  .map((v) => Math.round(v * 100) / 100)

const transactionDateArb = fc.integer({ min: 1, max: 28 }).chain((day) =>
  fc.integer({ min: 1, max: 12 }).map((month) => {
    const d = String(day).padStart(2, '0')
    const m = String(month).padStart(2, '0')
    return `2024-${m}-${d}T12:00:00.000Z`
  })
)

interface TxInput {
  transactionType: 'inbound' | 'outbound'
  amount: number
  transactionDate: string
}

const transactionInputArb: fc.Arbitrary<TxInput> = fc.record({
  transactionType: transactionTypeArb,
  amount: amountArb,
  transactionDate: transactionDateArb
})

// ---------------------------------------------------------------------------
// Property 7: Transaction type classification
// ---------------------------------------------------------------------------

describe('Property 7: Transaction type classification', () => {
  it('stored transaction preserves the exact transactionType provided', async () => {
    await fc.assert(
      fc.asyncProperty(transactionTypeArb, amountArb, async (txType, amount) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanyAndUser(sqlite)
        seedAccount(sqlite, 1000)

        try {
          const result = await create(db, 1, {
            accountId: 1,
            transactionType: txType,
            referenceType: 'test',
            referenceId: '1',
            amount,
            transactionDate: '2024-06-15T12:00:00.000Z'
          })

          // The returned transaction preserves the classification exactly
          expect(result.transactionType).toBe(txType)

          // Verify at the database level too
          const row = sqlite
            .prepare('SELECT transaction_type FROM financial_transactions WHERE id = ?')
            .get(result.id) as { transaction_type: string }

          expect(row.transaction_type).toBe(txType)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 8: Running balance computation
// ---------------------------------------------------------------------------

describe('Property 8: Running balance computation', () => {
  it('running balance of the last transaction equals initialBalance + sum of signed amounts', async () => {
    await fc.assert(
      fc.asyncProperty(
        initialBalanceArb,
        fc.array(transactionInputArb, { minLength: 1, maxLength: 15 }),
        async (initialBalance, transactions) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompanyAndUser(sqlite)
          seedAccount(sqlite, initialBalance)

          try {
            // Insert all transactions with incrementing dates to ensure consistent ordering
            for (let i = 0; i < transactions.length; i++) {
              const tx = transactions[i]
              const day = String(i + 1).padStart(2, '0')
              await create(db, 1, {
                accountId: 1,
                transactionType: tx.transactionType,
                referenceType: 'test',
                referenceId: String(i + 1),
                amount: tx.amount,
                transactionDate: `2024-06-${day}T12:00:00.000Z`
              })
            }

            // Fetch all transactions (limit large enough to get all)
            const result = await listForAccount(1, 1, { limit: 100, offset: 0 })

            expect(result.total).toBe(transactions.length)

            // The first item in the result is the most recent (DESC order)
            // Its running balance should be initialBalance + sum of ALL signed amounts
            const expectedSum = transactions.reduce((acc, tx) => {
              const signed = tx.transactionType === 'inbound' ? tx.amount : -tx.amount
              return acc + signed
            }, 0)

            const expectedRunningBalance = initialBalance + expectedSum
            const actualRunningBalance = result.transactions[0].runningBalance

            // Compare with a tolerance for floating point
            expect(Math.abs(actualRunningBalance - expectedRunningBalance)).toBeLessThan(0.01)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 30 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 6: Financial overview aggregation
// ---------------------------------------------------------------------------

describe('Property 6: Financial overview aggregation', () => {
  it('overview correctly aggregates installments by type, status, and overdue', async () => {
    // Use a fixed "today" for deterministic overdue classification
    const today = new Date().toISOString().slice(0, 10)

    const orderTypeArb = fc.constantFrom('sales_order' as const, 'purchase_order' as const)
    const statusArb = fc.constantFrom('pending' as const, 'paid' as const)

    // Generate dates that are either in the past (overdue) or future (not overdue)
    const dueDateArb = fc.boolean().map((isPast) => {
      if (isPast) {
        // Past date (overdue)
        return '2020-01-15'
      }
      // Future date (not overdue)
      return '2099-12-31'
    })

    interface InstallmentGen {
      orderType: 'sales_order' | 'purchase_order'
      status: 'pending' | 'paid'
      amount: number
      dueDate: string
    }

    const installmentArb: fc.Arbitrary<InstallmentGen> = fc.record({
      orderType: orderTypeArb,
      status: statusArb,
      amount: amountArb,
      dueDate: dueDateArb
    })

    await fc.assert(
      fc.asyncProperty(fc.array(installmentArb, { minLength: 1, maxLength: 20 }), async (installments) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanyAndUser(sqlite)
        seedAccount(sqlite, 0)

        try {
          // Insert installments
          const now = '2024-01-01T00:00:00.000Z'
          for (let i = 0; i < installments.length; i++) {
            const inst = installments[i]
            sqlite
              .prepare(
                `INSERT INTO installments (company_id, order_id, order_type, installment_number, amount, due_date, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .run(1, i + 1, inst.orderType, 1, inst.amount, inst.dueDate, inst.status, now, now)
          }

          const result = await overview(1)

          // Compute expected values
          const expectedReceivable = installments
            .filter((i) => i.orderType === 'sales_order' && i.status === 'pending')
            .reduce((sum, i) => sum + i.amount, 0)

          const expectedPayable = installments
            .filter((i) => i.orderType === 'purchase_order' && i.status === 'pending')
            .reduce((sum, i) => sum + i.amount, 0)

          const expectedOverdueReceivables = installments
            .filter((i) => i.orderType === 'sales_order' && i.status === 'pending' && i.dueDate < today)
            .reduce((sum, i) => sum + i.amount, 0)

          const expectedOverduePayables = installments
            .filter((i) => i.orderType === 'purchase_order' && i.status === 'pending' && i.dueDate < today)
            .reduce((sum, i) => sum + i.amount, 0)

          // Compare with tolerance for floating point
          expect(Math.abs(result.totalReceivable - expectedReceivable)).toBeLessThan(0.01)
          expect(Math.abs(result.totalPayable - expectedPayable)).toBeLessThan(0.01)
          expect(Math.abs(result.totalOverdueReceivables - expectedOverdueReceivables)).toBeLessThan(0.01)
          expect(Math.abs(result.totalOverduePayables - expectedOverduePayables)).toBeLessThan(0.01)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })
})
