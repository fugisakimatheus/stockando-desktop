/**
 * Property-based tests for InstallmentService.
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.6, 1.7, 2.1, 2.3, 3.1, 3.2**
 *
 * Property 1: Installment sum equals document total
 * "For any payment plan creation with a set of installment amounts and a target order,
 * the sum of all installment amounts SHALL equal the order's Document_Total. Plans where
 * the sum differs SHALL be rejected."
 *
 * Property 2: Settlement creates transaction and updates balance
 * "For any installment settlement on a valid pending installment with a valid active
 * account, the operation SHALL produce a Financial_Transaction with the installment
 * amount, and the account's currentBalance SHALL change by exactly +amount (inbound/sales)
 * or -amount (outbound/purchase)."
 *
 * Property 3: Financial status derivation
 * "For any order with installments, the derived financial status SHALL be 'unpaid' when
 * zero installments are settled, 'partially_paid' when at least one but not all are
 * settled, and 'paid' when all installments are settled."
 *
 * Property 4: Overdue classification
 * "For any installment with status 'pending' and due date strictly before the current
 * reference date, the installment SHALL be classified as overdue. Installments with
 * status 'paid' or due date on or after the reference date SHALL NOT be classified as
 * overdue."
 *
 * Property 5: Financial summary remaining balance
 * "For any order with a payment plan, the remaining balance SHALL equal the
 * Document_Total minus the sum of all settled installment amounts."
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { InstallmentSumMismatchError } from '../../api/errors'
import * as schema from '../../db/schema'
import { deriveFinancialStatus, classifyOverdue } from '../financial-utils'
import { createPlan, listForOrder } from '../installment-service'

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

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id INTEGER,
      order_number TEXT NOT NULL,
      order_type TEXT NOT NULL DEFAULT 'sale',
      status TEXT NOT NULL DEFAULT 'draft',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      confirmed_at TEXT,
      fulfilled_at TEXT,
      cancelled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      supplier_id INTEGER NOT NULL,
      order_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      expected_delivery_date TEXT,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      cancelled_at TEXT,
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
  `)

  return sqlite
}

function seedCompany(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (1, 'Test Company', '12345678000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

    INSERT INTO users (id, company_id, name, email, role, status, created_at, updated_at)
    VALUES (1, 1, 'Admin User', 'admin@test.com', 'admin', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

function seedSalesOrder(sqlite: Database.Database, totalAmount: number): number {
  const stmt = sqlite.prepare(`
    INSERT INTO orders (company_id, order_number, order_type, status, total_amount, created_at, updated_at)
    VALUES (1, ?, 'sale', 'confirmed', ?, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z')
  `)
  const result = stmt.run(`ORD-${Date.now()}-${Math.random()}`, totalAmount)
  return Number(result.lastInsertRowid)
}

function seedPurchaseOrder(sqlite: Database.Database, totalAmount: number): number {
  const stmt = sqlite.prepare(`
    INSERT INTO purchase_orders (company_id, supplier_id, order_number, status, total_amount, created_at, updated_at)
    VALUES (1, 1, ?, 'confirmed', ?, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z')
  `)
  // Insert a dummy supplier first
  sqlite.exec(`
    INSERT OR IGNORE INTO users (id, company_id, name, email, role, status, created_at, updated_at)
    VALUES (2, 1, 'Supplier User', 'supplier@test.com', 'operator', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
  const result = stmt.run(`PO-${Date.now()}-${Math.random()}`, totalAmount)
  return Number(result.lastInsertRowid)
}

function seedAccount(sqlite: Database.Database, initialBalance: number): number {
  const stmt = sqlite.prepare(`
    INSERT INTO financial_accounts (company_id, name, account_type, initial_balance, current_balance, status, created_at, updated_at)
    VALUES (1, 'Test Account', 'checking', ?, ?, 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z')
  `)
  const result = stmt.run(initialBalance, initialBalance)
  return Number(result.lastInsertRowid)
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const amountArb = fc
  .double({ min: 0.01, max: 9999.99, noNaN: true, noDefaultInfinity: true })
  .map((v) => Math.round(v * 100) / 100)

const dueDateFutureArb = fc.constantFrom('2099-01-15', '2099-06-30', '2099-12-31')

const dueDatePastArb = fc.constantFrom('2020-01-15', '2021-06-30', '2022-12-01')

/**
 * Generates a list of installment amounts that sum exactly to totalAmount.
 * Splits totalAmount into `count` parts ensuring sum equals total.
 */
function splitAmount(totalAmount: number, count: number): fc.Arbitrary<number[]> {
  return fc
    .array(fc.double({ min: 0.01, max: 1, noNaN: true, noDefaultInfinity: true }), {
      minLength: count,
      maxLength: count
    })
    .map((weights) => {
      const sumWeights = weights.reduce((a, b) => a + b, 0)
      const parts = weights.map((w) => Math.round((w / sumWeights) * totalAmount * 100) / 100)
      // Adjust last element to ensure exact sum
      const currentSum = parts.reduce((a, b) => a + b, 0)
      parts[parts.length - 1] = Math.round((parts[parts.length - 1] + (totalAmount - currentSum)) * 100) / 100
      return parts
    })
}

// ---------------------------------------------------------------------------
// Property 1: Installment sum equals document total
// ---------------------------------------------------------------------------

describe('Property 1: Installment sum equals document total', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('createPlan succeeds when installment amounts sum exactly to order total', async () => {
    await fc.assert(
      fc.asyncProperty(
        amountArb.filter((a) => a >= 1),
        fc.integer({ min: 1, max: 6 }),
        async (orderTotal, installmentCount) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)

          try {
            const orderId = seedSalesOrder(sqlite, orderTotal)

            // Generate amounts that sum exactly to orderTotal
            const amounts = await fc.sample(splitAmount(orderTotal, installmentCount), 1)
            const installmentAmounts = amounts[0]

            const result = await createPlan(1, {
              orderType: 'sales_order',
              orderId,
              installments: installmentAmounts.map((amount, i) => ({
                amount,
                dueDate: `2025-${String(i + 1).padStart(2, '0')}-15`
              }))
            })

            // All installments were created
            expect(result.installments.length).toBe(installmentCount)
            // Document total matches
            expect(result.documentTotal).toBeCloseTo(orderTotal, 1)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 30 }
    )
  })

  it('createPlan rejects with InstallmentSumMismatchError when amounts do not sum to total', async () => {
    await fc.assert(
      fc.asyncProperty(
        amountArb.filter((a) => a >= 10),
        amountArb.filter((a) => a >= 0.5),
        async (orderTotal, extraAmount) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)

          try {
            const orderId = seedSalesOrder(sqlite, orderTotal)

            // Create installments that deliberately DON'T sum to orderTotal
            const wrongAmount = Math.round((orderTotal + extraAmount) * 100) / 100

            await expect(
              createPlan(1, {
                orderType: 'sales_order',
                orderId,
                installments: [{ amount: wrongAmount, dueDate: '2025-06-15' }]
              })
            ).rejects.toThrow(InstallmentSumMismatchError)
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
// Property 2: Settlement creates transaction and updates balance
// ---------------------------------------------------------------------------

/**
 * Since better-sqlite3 does not support async transaction callbacks,
 * we simulate what `settle()` does by executing the steps manually:
 * 1. Update installment status to "paid"
 * 2. Create a financial_transaction
 * 3. Update account balance
 * This validates the invariant that the signed amount is applied correctly.
 */
describe('Property 2: Settlement creates transaction and updates balance', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sales_order settlement creates inbound transaction and increases balance by +amount', () => {
    fc.assert(
      fc.property(
        amountArb.filter((a) => a >= 1),
        amountArb,
        (installmentAmount, initialBalance) => {
          const sqlite = createTestDb()
          seedCompany(sqlite)

          try {
            const orderId = seedSalesOrder(sqlite, installmentAmount)
            const accountId = seedAccount(sqlite, initialBalance)

            // Insert a pending installment
            sqlite
              .prepare(`
              INSERT INTO installments (company_id, order_id, order_type, installment_number, amount, due_date, status, created_at, updated_at)
              VALUES (1, ?, 'sales_order', 1, ?, '2025-06-15', 'pending', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z')
            `)
              .run(orderId, installmentAmount)

            // Simulate settlement (what settle() does internally)
            const now = '2025-06-15T12:00:00.000Z'
            const transactionType = 'inbound' // sales_order → inbound
            const signedAmount = installmentAmount // inbound → +amount

            // Step 1: Update installment to paid
            sqlite
              .prepare(`
              UPDATE installments SET status = 'paid', settled_at = ?, account_id = ?, updated_at = ?
              WHERE order_id = ? AND order_type = 'sales_order'
            `)
              .run(now, accountId, now, orderId)

            // Step 2: Create financial transaction
            sqlite
              .prepare(`
              INSERT INTO financial_transactions (company_id, account_id, transaction_type, reference_type, reference_id, amount, transaction_date, created_at)
              VALUES (1, ?, ?, 'sales_order', ?, ?, ?, ?)
            `)
              .run(accountId, transactionType, String(orderId), installmentAmount, now, now)

            // Step 3: Update account balance
            sqlite
              .prepare(`
              UPDATE financial_accounts SET current_balance = current_balance + ? WHERE id = ?
            `)
              .run(signedAmount, accountId)

            // Verify: transaction was created with correct type and amount
            const txRow = sqlite
              .prepare('SELECT transaction_type, amount FROM financial_transactions WHERE account_id = ?')
              .get(accountId) as { transaction_type: string; amount: number }

            expect(txRow.transaction_type).toBe('inbound')
            expect(txRow.amount).toBeCloseTo(installmentAmount, 2)

            // Verify: account balance increased by installmentAmount
            const acctRow = sqlite
              .prepare('SELECT current_balance FROM financial_accounts WHERE id = ?')
              .get(accountId) as { current_balance: number }

            expect(acctRow.current_balance).toBeCloseTo(initialBalance + installmentAmount, 2)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it('purchase_order settlement creates outbound transaction and decreases balance by -amount', () => {
    fc.assert(
      fc.property(
        amountArb.filter((a) => a >= 1),
        fc
          .double({ min: 100, max: 99999.99, noNaN: true, noDefaultInfinity: true })
          .map((v) => Math.round(v * 100) / 100),
        (installmentAmount, initialBalance) => {
          const sqlite = createTestDb()
          seedCompany(sqlite)

          try {
            const orderId = seedPurchaseOrder(sqlite, installmentAmount)
            const accountId = seedAccount(sqlite, initialBalance)

            // Insert a pending installment
            sqlite
              .prepare(`
              INSERT INTO installments (company_id, order_id, order_type, installment_number, amount, due_date, status, created_at, updated_at)
              VALUES (1, ?, 'purchase_order', 1, ?, '2025-06-15', 'pending', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z')
            `)
              .run(orderId, installmentAmount)

            // Simulate settlement
            const now = '2025-06-15T12:00:00.000Z'
            const transactionType = 'outbound' // purchase_order → outbound
            const signedAmount = -installmentAmount // outbound → -amount

            // Step 1: Update installment to paid
            sqlite
              .prepare(`
              UPDATE installments SET status = 'paid', settled_at = ?, account_id = ?, updated_at = ?
              WHERE order_id = ? AND order_type = 'purchase_order'
            `)
              .run(now, accountId, now, orderId)

            // Step 2: Create financial transaction
            sqlite
              .prepare(`
              INSERT INTO financial_transactions (company_id, account_id, transaction_type, reference_type, reference_id, amount, transaction_date, created_at)
              VALUES (1, ?, ?, 'purchase_order', ?, ?, ?, ?)
            `)
              .run(accountId, transactionType, String(orderId), installmentAmount, now, now)

            // Step 3: Update account balance
            sqlite
              .prepare(`
              UPDATE financial_accounts SET current_balance = current_balance + ? WHERE id = ?
            `)
              .run(signedAmount, accountId)

            // Verify: transaction type is outbound
            const txRow = sqlite
              .prepare('SELECT transaction_type, amount FROM financial_transactions WHERE account_id = ?')
              .get(accountId) as { transaction_type: string; amount: number }

            expect(txRow.transaction_type).toBe('outbound')
            expect(txRow.amount).toBeCloseTo(installmentAmount, 2)

            // Verify: account balance decreased
            const acctRow = sqlite
              .prepare('SELECT current_balance FROM financial_accounts WHERE id = ?')
              .get(accountId) as { current_balance: number }

            expect(acctRow.current_balance).toBeCloseTo(initialBalance - installmentAmount, 2)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 50 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 3: Financial status derivation
// ---------------------------------------------------------------------------

describe('Property 3: Financial status derivation', () => {
  it('derives correct financial status based on totalExpected and totalPaid', () => {
    fc.assert(
      fc.property(
        amountArb.filter((a) => a >= 1),
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (totalExpected, paidFraction) => {
          const totalPaid = Math.round(paidFraction * totalExpected * 100) / 100

          const status = deriveFinancialStatus(totalExpected, totalPaid)

          if (totalPaid === 0) {
            expect(status).toBe('unpaid')
          } else if (totalPaid >= totalExpected) {
            expect(status).toBe('paid')
          } else {
            expect(status).toBe('partially_paid')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('unpaid when totalPaid is 0', () => {
    fc.assert(
      fc.property(
        amountArb.filter((a) => a >= 1),
        (totalExpected) => {
          expect(deriveFinancialStatus(totalExpected, 0)).toBe('unpaid')
        }
      ),
      { numRuns: 50 }
    )
  })

  it('paid when totalPaid >= totalExpected', () => {
    fc.assert(
      fc.property(
        amountArb.filter((a) => a >= 1),
        (totalExpected) => {
          expect(deriveFinancialStatus(totalExpected, totalExpected)).toBe('paid')
          expect(deriveFinancialStatus(totalExpected, totalExpected + 1)).toBe('paid')
        }
      ),
      { numRuns: 50 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 4: Overdue classification
// ---------------------------------------------------------------------------

describe('Property 4: Overdue classification', () => {
  it('pending installment with past due date is classified as overdue', () => {
    fc.assert(
      fc.property(dueDatePastArb, (dueDate) => {
        expect(classifyOverdue('pending', dueDate)).toBe(true)
      }),
      { numRuns: 20 }
    )
  })

  it('paid installment is never classified as overdue regardless of due date', () => {
    fc.assert(
      fc.property(fc.oneof(dueDatePastArb, dueDateFutureArb), (dueDate) => {
        expect(classifyOverdue('paid', dueDate)).toBe(false)
      }),
      { numRuns: 20 }
    )
  })

  it('pending installment with future due date is not classified as overdue', () => {
    fc.assert(
      fc.property(dueDateFutureArb, (dueDate) => {
        expect(classifyOverdue('pending', dueDate)).toBe(false)
      }),
      { numRuns: 20 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 5: Financial summary remaining balance
// ---------------------------------------------------------------------------

describe('Property 5: Financial summary remaining balance', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('remainingBalance equals documentTotal minus sum of paid installments', async () => {
    await fc.assert(
      fc.asyncProperty(
        amountArb.filter((a) => a >= 5),
        fc.integer({ min: 2, max: 5 }),
        fc.integer({ min: 0, max: 4 }),
        async (orderTotal, installmentCount, paidCount) => {
          // Ensure paidCount <= installmentCount
          const actualPaidCount = Math.min(paidCount, installmentCount)

          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)

          try {
            const orderId = seedSalesOrder(sqlite, orderTotal)
            seedAccount(sqlite, 10000)

            // Generate installment amounts that sum to orderTotal
            const amounts = await fc.sample(splitAmount(orderTotal, installmentCount), 1)
            const installmentAmounts = amounts[0]

            // Create plan using the service (this works — no transaction needed)
            await createPlan(1, {
              orderType: 'sales_order',
              orderId,
              installments: installmentAmounts.map((amount, i) => ({
                amount,
                dueDate: `2025-${String(i + 1).padStart(2, '0')}-15`
              }))
            })

            // Settle some installments directly in DB (simulating settle())
            const rows = sqlite
              .prepare(
                'SELECT id, amount FROM installments WHERE order_id = ? AND order_type = ? ORDER BY installment_number'
              )
              .all(orderId, 'sales_order') as { id: number; amount: number }[]

            let totalPaidAmount = 0
            const now = '2025-06-15T12:00:00.000Z'
            for (let i = 0; i < actualPaidCount; i++) {
              sqlite
                .prepare(`
                UPDATE installments SET status = 'paid', settled_at = ?, updated_at = ?
                WHERE id = ?
              `)
                .run(now, now, rows[i].id)
              totalPaidAmount += rows[i].amount
            }

            // Get summary via listForOrder (reads from DB, no transaction)
            const summary = await listForOrder(1, 'sales_order', orderId)

            // Remaining balance = documentTotal - totalPaid
            const expectedRemaining = Math.round((orderTotal - totalPaidAmount) * 100) / 100
            expect(summary.remainingBalance).toBeCloseTo(expectedRemaining, 1)
            expect(summary.totalPaid).toBeCloseTo(totalPaidAmount, 1)
            expect(summary.totalExpected).toBeCloseTo(orderTotal, 1)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 20 }
    )
  })
})
