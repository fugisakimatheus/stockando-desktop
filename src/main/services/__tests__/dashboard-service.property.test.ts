/**
 * Property tests for dashboard aggregate computation.
 *
 * **Validates: Requirements 1.1, 1.2, 1.5**
 *
 * Property 1: Dashboard aggregate cache freshness
 * "When aggregates are cached and fresh, getAggregates returns the same result
 * without re-querying the database."
 *
 * Property 2: Dashboard aggregate correctness — sales total
 * "The sales total metric equals the sum of confirmed/fulfilled sales orders'
 * totalAmount within the period."
 *
 * Property 3: Dashboard aggregate correctness — receivables
 * "The receivables metric equals the sum of pending sale installments' amount."
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'

vi.mock('../../server', () => ({
  getDb: vi.fn()
}))

vi.mock('../audit-service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
}))

import { getDb } from '../../server'
import { clearCache, getAggregates } from '../dashboard-service'

const mockedGetDb = vi.mocked(getDb)

// ---------------------------------------------------------------------------
// Test DB Setup
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
    CREATE UNIQUE INDEX companies_document_number_unique ON companies(document_number);

    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      document_number TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      customer_type TEXT NOT NULL DEFAULT 'individual',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      document_number TEXT NOT NULL,
      trade_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
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

    CREATE TABLE warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      address TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      quantity REAL NOT NULL DEFAULT 0,
      reserved_quantity REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX stock_company_product_warehouse_unique ON stock(company_id, product_id, warehouse_id);

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
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

    CREATE TABLE purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
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
    CREATE UNIQUE INDEX purchase_orders_company_order_unique ON purchase_orders(company_id, order_number);

    CREATE TABLE financial_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

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
    CREATE INDEX installments_company_type_status_idx ON installments(company_id, order_type, status);

    CREATE TABLE dashboard_aggregates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      period_key TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      value REAL NOT NULL,
      computed_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX dashboard_aggregates_company_period_metric_unique
      ON dashboard_aggregates(company_id, period_key, metric_name);
  `)

  return sqlite
}

const COMPANY_ID = 1

function seedCompany(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (${COMPANY_ID}, 'Test Company', '11111111000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

// ---------------------------------------------------------------------------
// Property 1: Dashboard aggregate cache freshness
// ---------------------------------------------------------------------------

describe('Dashboard aggregate cache freshness (Property 1)', () => {
  beforeEach(() => {
    clearCache()
  })

  it('returns identical cached result on second call when cache is fresh', async () => {
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 5 }), async (orderCount) => {
        clearCache()
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompany(sqlite)

        // Insert some orders so the computation returns non-trivial data
        for (let i = 0; i < orderCount; i++) {
          sqlite.exec(`
              INSERT INTO orders (company_id, order_number, order_type, status, total_amount, confirmed_at, created_at, updated_at)
              VALUES (${COMPANY_ID}, 'ORD-${i}', 'sale', 'confirmed', ${(i + 1) * 100}, '2024-06-10T00:00:00.000Z', '2024-06-01T00:00:00.000Z', '2024-06-01T00:00:00.000Z');
            `)
        }

        const period = { type: 'current_month' as const }

        try {
          // First call: computes from DB
          const first = await getAggregates(COMPANY_ID, period)
          // Second call: should return cached result (identical reference)
          const second = await getAggregates(COMPANY_ID, period)

          // Results should be deeply equal
          expect(second).toEqual(first)
          expect(second.metrics.totalSales).toBe(first.metrics.totalSales)
          expect(second.lastUpdatedAt).toBe(first.lastUpdatedAt)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 2: Dashboard aggregate correctness — sales total
// ---------------------------------------------------------------------------

/**
 * Arbitrary for order status (mix of statuses that count and don't count).
 */
const orderStatusArb = fc.constantFrom('draft', 'confirmed', 'fulfilled', 'cancelled')

/**
 * Arbitrary for a single order entry.
 */
const orderArb = fc.record({
  status: orderStatusArb,
  totalAmount: fc.double({ min: 0.01, max: 99999, noNaN: true }),
  /** Day of month (1-28) for confirmedAt within June 2024 */
  confirmedDay: fc.integer({ min: 1, max: 28 })
})

describe('Dashboard aggregate correctness — sales total (Property 2)', () => {
  beforeEach(() => {
    clearCache()
  })

  it('totalSales equals sum of confirmed/fulfilled orders within the period', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(orderArb, { minLength: 1, maxLength: 20 }), async (orders) => {
        clearCache()
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompany(sqlite)

        // Insert orders with varying statuses and amounts
        for (let i = 0; i < orders.length; i++) {
          const o = orders[i]
          const confirmedAt =
            o.status === 'confirmed' || o.status === 'fulfilled'
              ? `2024-06-${String(o.confirmedDay).padStart(2, '0')}T10:00:00.000Z`
              : null
          const confirmedAtVal = confirmedAt ? `'${confirmedAt}'` : 'NULL'

          sqlite.exec(`
              INSERT INTO orders (company_id, order_number, order_type, status, total_amount, confirmed_at, created_at, updated_at)
              VALUES (${COMPANY_ID}, 'ORD-${i}', 'sale', '${o.status}', ${o.totalAmount}, ${confirmedAtVal}, '2024-06-01T00:00:00.000Z', '2024-06-01T00:00:00.000Z');
            `)
        }

        // Compute expected: sum of totalAmount where status is 'confirmed' or 'fulfilled'
        // and confirmedAt is within current_month (June 2024)
        const expectedSales = orders
          .filter((o) => o.status === 'confirmed' || o.status === 'fulfilled')
          .reduce((sum, o) => sum + o.totalAmount, 0)

        // Use a custom period matching June 2024 to make the test deterministic
        const period = {
          type: 'custom' as const,
          startDate: '2024-06-01T00:00:00.000Z',
          endDate: '2024-06-30T23:59:59.999Z'
        }

        try {
          const result = await getAggregates(COMPANY_ID, period)

          // Compare with tolerance for floating point
          expect(result.metrics.totalSales).toBeCloseTo(expectedSales, 2)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 3: Dashboard aggregate correctness — receivables
// ---------------------------------------------------------------------------

/**
 * Arbitrary for installment status.
 */
const installmentStatusArb = fc.constantFrom('pending', 'settled', 'cancelled')

/**
 * Arbitrary for installment order type.
 */
const installmentOrderTypeArb = fc.constantFrom('sale', 'purchase')

/**
 * Arbitrary for a single installment entry.
 */
const installmentArb = fc.record({
  orderType: installmentOrderTypeArb,
  status: installmentStatusArb,
  amount: fc.double({ min: 0.01, max: 99999, noNaN: true }),
  dueDayOffset: fc.integer({ min: -30, max: 30 })
})

describe('Dashboard aggregate correctness — receivables (Property 3)', () => {
  beforeEach(() => {
    clearCache()
  })

  it('totalReceivables equals sum of pending sale installments', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(installmentArb, { minLength: 1, maxLength: 20 }), async (installments) => {
        clearCache()
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompany(sqlite)

        // Insert installments with varying statuses and types
        for (let i = 0; i < installments.length; i++) {
          const inst = installments[i]
          const dueDate = new Date(2024, 5, 15 + inst.dueDayOffset).toISOString()

          sqlite.exec(`
              INSERT INTO installments (company_id, order_id, order_type, installment_number, amount, due_date, status, created_at, updated_at)
              VALUES (${COMPANY_ID}, ${i + 1}, '${inst.orderType}', 1, ${inst.amount}, '${dueDate}', '${inst.status}', '2024-06-01T00:00:00.000Z', '2024-06-01T00:00:00.000Z');
            `)
        }

        // Compute expected: sum of amount where orderType='sale' AND status='pending'
        const expectedReceivables = installments
          .filter((inst) => inst.orderType === 'sale' && inst.status === 'pending')
          .reduce((sum, inst) => sum + inst.amount, 0)

        // Use a custom period (receivables are not period-filtered in the service)
        const period = {
          type: 'custom' as const,
          startDate: '2024-06-01T00:00:00.000Z',
          endDate: '2024-06-30T23:59:59.999Z'
        }

        try {
          const result = await getAggregates(COMPANY_ID, period)

          // Compare with tolerance for floating point
          expect(result.metrics.totalReceivables).toBeCloseTo(expectedReceivables, 2)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 100 }
    )
  })
})
