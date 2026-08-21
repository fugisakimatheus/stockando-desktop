/**
 * Property test for company data isolation.
 *
 * **Validates: Requirements 8.1, 8.4, 12.1, 12.2, 12.3, 12.4**
 *
 * Property 5: Company data isolation
 * "For any two distinct companies A and B, and for any catalog or inventory
 * query executed in the context of company A, the results SHALL NOT include
 * records belonging to company B."
 *
 * Property 25: Company data isolation (Phase 3)
 * "For any two distinct companies A and B, and for any Phase 3 service function
 * that queries data (financial accounts, installments), calling with Company A's
 * ID returns only Company A's data, and NOT Company B's data."
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'
import { list as listCategories } from '../category-service'
import { list as listFinancialAccounts, overview as financialOverview } from '../financial-account-service'
import { listForOrder as listInstallments } from '../installment-service'
import { list as listProducts } from '../product-service'

vi.mock('../../server', () => ({
  getDb: vi.fn()
}))

import { getDb } from '../../server'

const mockedGetDb = vi.mocked(getDb)

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

    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      parent_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX categories_company_name_unique ON categories(company_id, name);
    CREATE INDEX categories_parent_category_idx ON categories(parent_category_id);

    CREATE TABLE units_of_measure (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      unit_id INTEGER REFERENCES units_of_measure(id) ON DELETE SET NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      barcode TEXT,
      cost_price REAL,
      sale_price REAL,
      track_inventory INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX products_company_sku_unique ON products(company_id, sku);
    CREATE INDEX products_category_idx ON products(category_id);

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
    CREATE INDEX financial_accounts_company_idx ON financial_accounts(company_id);
    CREATE INDEX financial_accounts_status_idx ON financial_accounts(status);

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
    CREATE UNIQUE INDEX orders_company_order_number_unique ON orders(company_id, order_number);

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
  `)

  return sqlite
}

function seedCompanies(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES
      (1, 'Company A', '11111111000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
      (2, 'Company B', '22222222000200', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

const COMPANY_A = 1
const COMPANY_B = 2

/**
 * Generates a valid category name: non-empty after trimming, printable characters.
 */
const categoryNameArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .map((s) => s.replace(/[\x00-\x1f\x7f]/g, 'a'))
  .filter((s) => s.trim().length > 0)

/**
 * Generates a valid product SKU: alphanumeric with dashes, non-empty.
 */
const skuArb = fc.stringMatching(/^[A-Z0-9\-]{3,20}$/)

/**
 * Generates a valid product name.
 */
const productNameArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .map((s) => s.replace(/[\x00-\x1f\x7f]/g, 'a'))
  .filter((s) => s.trim().length > 0)

/**
 * Generates a valid financial account name.
 */
const accountNameArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .map((s) => s.replace(/[\x00-\x1f\x7f]/g, 'a'))
  .filter((s) => s.trim().length > 0)

/**
 * Generates a positive amount for installments.
 */
const amountArb = fc
  .double({ min: 10, max: 9999.99, noNaN: true, noDefaultInfinity: true })
  .map((v) => Math.round(v * 100) / 100)

describe('Company data isolation (Property 5)', () => {
  it('listing categories for company A returns no records from company B', async () => {
    await fc.assert(
      fc.asyncProperty(categoryNameArb, categoryNameArb, async (nameA, nameB) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanies(sqlite)

        try {
          const now = new Date().toISOString()

          // Insert category for Company A
          sqlite
            .prepare('INSERT INTO categories (company_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
            .run(COMPANY_A, nameA.trim(), 'active', now, now)

          // Insert category for Company B (use nameB, but ensure it doesn't conflict within same company)
          sqlite
            .prepare('INSERT INTO categories (company_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
            .run(COMPANY_B, nameB.trim(), 'active', now, now)

          // List categories for Company A
          const categoriesA = await listCategories(COMPANY_A)

          // Verify no record belongs to Company B
          for (const cat of categoriesA) {
            expect(cat.companyId).toBe(COMPANY_A)
          }

          // Additionally verify the Company B category is NOT present
          const companyBIds = categoriesA.filter((cat) => cat.companyId === COMPANY_B)
          expect(companyBIds).toHaveLength(0)

          // Verify Company A's list only contains records from Company A
          expect(categoriesA.length).toBeGreaterThanOrEqual(1)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })

  it('listing products for company A returns no records from company B', async () => {
    await fc.assert(
      fc.asyncProperty(skuArb, productNameArb, skuArb, productNameArb, async (skuA, nameA, skuB, nameB) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanies(sqlite)

        try {
          const now = new Date().toISOString()

          // Insert product for Company A
          sqlite
            .prepare(
              `INSERT INTO products (company_id, sku, name, track_inventory, status, created_at, updated_at)
                 VALUES (?, ?, ?, 0, 'active', ?, ?)`
            )
            .run(COMPANY_A, skuA, nameA.trim(), now, now)

          // Insert product for Company B
          sqlite
            .prepare(
              `INSERT INTO products (company_id, sku, name, track_inventory, status, created_at, updated_at)
                 VALUES (?, ?, ?, 0, 'active', ?, ?)`
            )
            .run(COMPANY_B, skuB, nameB.trim(), now, now)

          // List products for Company A
          const result = await listProducts(COMPANY_A, { limit: 100, offset: 0 })

          // Verify no record belongs to Company B
          // The list response contains productListItems, verify via the DB that all ids returned belong to A
          for (const item of result.data) {
            // Verify the product belongs to Company A by checking the database
            const row = sqlite.prepare('SELECT company_id FROM products WHERE id = ?').get(item.id) as
              | { company_id: number }
              | undefined

            expect(row).toBeDefined()
            expect(row?.company_id).toBe(COMPANY_A)
          }

          // Verify we got at least the product we inserted for Company A
          expect(result.data.length).toBeGreaterThanOrEqual(1)

          // Verify that no product from Company B leaked into Company A's list
          const allCompanyBProducts = sqlite.prepare('SELECT id FROM products WHERE company_id = ?').all(COMPANY_B) as {
            id: number
          }[]

          const companyBProductIds = new Set(allCompanyBProducts.map((p) => p.id))
          const leakedProducts = result.data.filter((item) => companyBProductIds.has(item.id))
          expect(leakedProducts).toHaveLength(0)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 25: Company data isolation (Phase 3 entities)
// ---------------------------------------------------------------------------

describe('Company data isolation — Phase 3 (Property 25)', () => {
  it('listing financial accounts for company A returns no records from company B', async () => {
    await fc.assert(
      fc.asyncProperty(accountNameArb, accountNameArb, async (nameA, nameB) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanies(sqlite)

        try {
          const now = new Date().toISOString()

          // Insert financial account for Company A
          sqlite
            .prepare(
              `INSERT INTO financial_accounts (company_id, name, account_type, initial_balance, current_balance, status, created_at, updated_at)
               VALUES (?, ?, 'checking', 1000, 1000, 'active', ?, ?)`
            )
            .run(COMPANY_A, nameA.trim(), now, now)

          // Insert financial account for Company B
          sqlite
            .prepare(
              `INSERT INTO financial_accounts (company_id, name, account_type, initial_balance, current_balance, status, created_at, updated_at)
               VALUES (?, ?, 'checking', 2000, 2000, 'active', ?, ?)`
            )
            .run(COMPANY_B, nameB.trim(), now, now)

          // List financial accounts for Company A
          const accountsA = await listFinancialAccounts(COMPANY_A)

          // Verify all accounts belong to Company A
          for (const acct of accountsA) {
            const row = sqlite.prepare('SELECT company_id FROM financial_accounts WHERE id = ?').get(acct.id) as
              | { company_id: number }
              | undefined
            expect(row).toBeDefined()
            expect(row?.company_id).toBe(COMPANY_A)
          }

          // Verify at least one account returned
          expect(accountsA.length).toBeGreaterThanOrEqual(1)

          // Verify Company B accounts are not in the result
          const allCompanyBAccounts = sqlite
            .prepare('SELECT id FROM financial_accounts WHERE company_id = ?')
            .all(COMPANY_B) as { id: number }[]
          const companyBIds = new Set(allCompanyBAccounts.map((a) => a.id))
          const leaked = accountsA.filter((acct) => companyBIds.has(acct.id))
          expect(leaked).toHaveLength(0)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })

  it('financial overview for company A does not include company B installments', async () => {
    await fc.assert(
      fc.asyncProperty(amountArb, amountArb, async (amountA, amountB) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanies(sqlite)

        try {
          const now = new Date().toISOString()
          const pastDue = '2023-01-01'

          // Create orders for both companies (needed for installment references)
          sqlite
            .prepare(
              `INSERT INTO orders (id, company_id, order_number, order_type, status, total_amount, created_at, updated_at)
               VALUES (1, ?, 'ORD-A-001', 'sale', 'confirmed', ?, ?, ?)`
            )
            .run(COMPANY_A, amountA, now, now)

          sqlite
            .prepare(
              `INSERT INTO orders (id, company_id, order_number, order_type, status, total_amount, created_at, updated_at)
               VALUES (2, ?, 'ORD-B-001', 'sale', 'confirmed', ?, ?, ?)`
            )
            .run(COMPANY_B, amountB, now, now)

          // Insert pending installment for Company A (sales_order, overdue)
          sqlite
            .prepare(
              `INSERT INTO installments (company_id, order_id, order_type, installment_number, amount, due_date, status, created_at, updated_at)
               VALUES (?, 1, 'sales_order', 1, ?, ?, 'pending', ?, ?)`
            )
            .run(COMPANY_A, amountA, pastDue, now, now)

          // Insert pending installment for Company B (sales_order, overdue)
          sqlite
            .prepare(
              `INSERT INTO installments (company_id, order_id, order_type, installment_number, amount, due_date, status, created_at, updated_at)
               VALUES (?, 2, 'sales_order', 1, ?, ?, 'pending', ?, ?)`
            )
            .run(COMPANY_B, amountB, pastDue, now, now)

          // Get financial overview for Company A
          const overviewA = await financialOverview(COMPANY_A)

          // The totalReceivable for Company A should match only Company A's installment
          expect(overviewA.totalReceivable).toBeCloseTo(amountA, 2)

          // Verify Company B's amount is NOT included
          // If isolation fails, totalReceivable would be amountA + amountB
          expect(overviewA.totalReceivable).not.toBeCloseTo(amountA + amountB, 2)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })

  it('listForOrder returns only installments for the queried company', async () => {
    await fc.assert(
      fc.asyncProperty(amountArb, amountArb, async (amountA, amountB) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanies(sqlite)

        try {
          const now = new Date().toISOString()
          const dueDate = '2025-06-15'

          // Create an order for Company A
          sqlite
            .prepare(
              `INSERT INTO orders (id, company_id, order_number, order_type, status, total_amount, created_at, updated_at)
               VALUES (1, ?, 'ORD-A-001', 'sale', 'confirmed', ?, ?, ?)`
            )
            .run(COMPANY_A, amountA, now, now)

          // Create an order for Company B with same orderId concept but different company
          sqlite
            .prepare(
              `INSERT INTO orders (id, company_id, order_number, order_type, status, total_amount, created_at, updated_at)
               VALUES (2, ?, 'ORD-B-001', 'sale', 'confirmed', ?, ?, ?)`
            )
            .run(COMPANY_B, amountB, now, now)

          // Insert installment for Company A, order 1
          sqlite
            .prepare(
              `INSERT INTO installments (company_id, order_id, order_type, installment_number, amount, due_date, status, created_at, updated_at)
               VALUES (?, 1, 'sales_order', 1, ?, ?, 'pending', ?, ?)`
            )
            .run(COMPANY_A, amountA, dueDate, now, now)

          // Insert installment for Company B, order 2
          sqlite
            .prepare(
              `INSERT INTO installments (company_id, order_id, order_type, installment_number, amount, due_date, status, created_at, updated_at)
               VALUES (?, 2, 'sales_order', 1, ?, ?, 'pending', ?, ?)`
            )
            .run(COMPANY_B, amountB, dueDate, now, now)

          // List installments for Company A's order
          const summary = await listInstallments(COMPANY_A, 'sales_order', 1)

          // Verify all returned installments belong to Company A
          for (const inst of summary.installments) {
            const row = sqlite.prepare('SELECT company_id FROM installments WHERE id = ?').get(inst.id) as
              | { company_id: number }
              | undefined
            expect(row).toBeDefined()
            expect(row?.company_id).toBe(COMPANY_A)
          }

          // Verify the amounts match only Company A's data
          expect(summary.totalExpected).toBeCloseTo(amountA, 2)

          // Verify Company B's installments are NOT included
          const allCompanyBInstallments = sqlite
            .prepare('SELECT id FROM installments WHERE company_id = ?')
            .all(COMPANY_B) as { id: number }[]
          const companyBIds = new Set(allCompanyBInstallments.map((i) => i.id))
          const leaked = summary.installments.filter((inst) => companyBIds.has(inst.id))
          expect(leaked).toHaveLength(0)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })

  it('listForOrder with wrong companyId throws NotFoundError (no cross-company reveal)', async () => {
    await fc.assert(
      fc.asyncProperty(amountArb, async (amount) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanies(sqlite)

        try {
          const now = new Date().toISOString()

          // Create an order belonging to Company A
          sqlite
            .prepare(
              `INSERT INTO orders (id, company_id, order_number, order_type, status, total_amount, created_at, updated_at)
               VALUES (1, ?, 'ORD-A-001', 'sale', 'confirmed', ?, ?, ?)`
            )
            .run(COMPANY_A, amount, now, now)

          // Insert installment for Company A
          sqlite
            .prepare(
              `INSERT INTO installments (company_id, order_id, order_type, installment_number, amount, due_date, status, created_at, updated_at)
               VALUES (?, 1, 'sales_order', 1, ?, '2025-06-15', 'pending', ?, ?)`
            )
            .run(COMPANY_A, amount, now, now)

          // Try to access Company A's order from Company B — should throw NotFoundError
          await expect(listInstallments(COMPANY_B, 'sales_order', 1)).rejects.toThrow('not found')
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 30 }
    )
  })
})
