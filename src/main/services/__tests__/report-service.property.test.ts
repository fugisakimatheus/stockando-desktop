/**
 * Property tests for report generation.
 *
 * **Validates: Requirements 3.2, 3.3, 3.4**
 *
 * Property 4: Report date range filter correctness
 * "When a date range filter is applied, all returned rows have dates within that range."
 *
 * Property 5: Report grouping subtotals consistency
 * "When results are grouped, the sum of group subtotals equals the overall total
 * in the summary."
 *
 * Property 19: Report summary totals consistency
 * "The summary totalCount matches the total number of data rows, and
 * averageAmount = totalAmount / totalCount."
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'

vi.mock('../../server', () => ({
  getDb: vi.fn()
}))

vi.mock('../audit-service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/stockando-test')
  }
}))

import { getDb } from '../../server'
import { generate } from '../report-service'

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

    CREATE TABLE stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      movement_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_cost REAL,
      reference_type TEXT,
      reference_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX stock_movements_company_idx ON stock_movements(company_id);
    CREATE INDEX stock_movements_product_idx ON stock_movements(product_id);
    CREATE INDEX stock_movements_warehouse_idx ON stock_movements(warehouse_id);

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

    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX order_items_order_idx ON order_items(order_id);
    CREATE INDEX order_items_product_idx ON order_items(product_id);

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
      account_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX installments_company_order_idx ON installments(company_id, order_id, order_type);
    CREATE INDEX installments_company_status_idx ON installments(company_id, status);
    CREATE INDEX installments_company_type_status_idx ON installments(company_id, order_type, status);
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

function seedCustomer(sqlite: Database.Database, id: number): void {
  sqlite.exec(`
    INSERT OR IGNORE INTO customers (id, company_id, name, document_number, customer_type, status, created_at, updated_at)
    VALUES (${id}, ${COMPANY_ID}, 'Customer ${id}', '00000000000${id}', 'individual', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

// ---------------------------------------------------------------------------
// Property 4: Report date range filter correctness
// ---------------------------------------------------------------------------

describe('Report date range filter correctness (Property 4)', () => {
  it('all returned rows have dates within the specified range', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a start date in 2024 and an end date after it
        fc.date({ min: new Date('2024-01-01'), max: new Date('2024-11-01') }),
        fc.integer({ min: 1, max: 60 }),
        fc.array(
          fc.record({
            totalAmount: fc.double({ min: 0.01, max: 9999, noNaN: true, noDefaultInfinity: true }),
            dayOffset: fc.integer({ min: 0, max: 364 })
          }),
          { minLength: 1, maxLength: 15 }
        ),
        async (startDate, rangeDays, ordersData) => {
          // Reject invalid dates generated by fast-check
          fc.pre(!Number.isNaN(startDate.getTime()))

          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)
          seedCustomer(sqlite, 1)

          const endDate = new Date(startDate.getTime() + rangeDays * 24 * 60 * 60 * 1000)

          // Insert orders with various dates across 2024
          for (let i = 0; i < ordersData.length; i++) {
            const o = ordersData[i]
            const orderDate = new Date('2024-01-01')
            orderDate.setDate(orderDate.getDate() + o.dayOffset)
            const dateStr = orderDate.toISOString()

            sqlite.exec(`
              INSERT INTO orders (company_id, customer_id, order_number, order_type, status, total_amount, created_at, updated_at)
              VALUES (${COMPANY_ID}, 1, 'ORD-${i}', 'sale', 'confirmed', ${o.totalAmount}, '${dateStr}', '${dateStr}');
            `)
          }

          const startStr = startDate.toISOString().slice(0, 10)
          const endStr = endDate.toISOString().slice(0, 10)

          try {
            const result = await generate(COMPANY_ID, {
              templateId: 'sales_by_period',
              filters: { startDate: startStr, endDate: endStr },
              pagination: { limit: 1000, offset: 0 }
            })

            // All returned rows must have a date within the filter range
            for (const row of result.data) {
              const rowDate = row.date as string | null
              if (rowDate !== null) {
                expect(rowDate >= startStr).toBe(true)
                expect(rowDate <= endStr).toBe(true)
              }
            }
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 5: Report grouping subtotals consistency
// ---------------------------------------------------------------------------

describe('Report grouping subtotals consistency (Property 5)', () => {
  it('sum of group subtotals equals the overall summary totalAmount', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            customerName: fc.constantFrom('Alice', 'Bob', 'Carlos', 'Diana'),
            totalAmount: fc.double({ min: 0.01, max: 9999, noNaN: true, noDefaultInfinity: true })
          }),
          { minLength: 1, maxLength: 20 }
        ),
        async (ordersData) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)

          // Create customers
          const customerNames = ['Alice', 'Bob', 'Carlos', 'Diana']
          for (let i = 0; i < customerNames.length; i++) {
            sqlite.exec(`
              INSERT INTO customers (id, company_id, name, document_number, customer_type, status, created_at, updated_at)
              VALUES (${i + 1}, ${COMPANY_ID}, '${customerNames[i]}', '0000000000${i + 1}', 'individual', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
            `)
          }

          // Insert orders for various customers
          for (let i = 0; i < ordersData.length; i++) {
            const o = ordersData[i]
            const customerId = customerNames.indexOf(o.customerName) + 1

            sqlite.exec(`
              INSERT INTO orders (company_id, customer_id, order_number, order_type, status, total_amount, created_at, updated_at)
              VALUES (${COMPANY_ID}, ${customerId}, 'ORD-${i}', 'sale', 'confirmed', ${o.totalAmount}, '2024-06-15T00:00:00.000Z', '2024-06-15T00:00:00.000Z');
            `)
          }

          try {
            const result = await generate(COMPANY_ID, {
              templateId: 'sales_by_customer',
              filters: {},
              groupBy: 'customerName',
              pagination: { limit: 1000, offset: 0 }
            })

            // Groups must be present when groupBy is specified
            expect(result.groups).toBeDefined()
            if (result.groups && result.groups.length > 0) {
              const groupSubtotalSum = result.groups.reduce((sum, group) => sum + group.subtotal, 0)

              // Sum of group subtotals must equal summary totalAmount
              expect(groupSubtotalSum).toBeCloseTo(result.summary.totalAmount, 2)
            }
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 19: Report summary totals consistency
// ---------------------------------------------------------------------------

describe('Report summary totals consistency (Property 19)', () => {
  it('summary totalCount matches total rows and averageAmount = totalAmount / totalCount', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            totalAmount: fc.double({ min: 0.01, max: 9999, noNaN: true, noDefaultInfinity: true })
          }),
          { minLength: 0, maxLength: 20 }
        ),
        async (ordersData) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)
          seedCustomer(sqlite, 1)

          // Insert confirmed sale orders
          for (let i = 0; i < ordersData.length; i++) {
            const o = ordersData[i]
            sqlite.exec(`
              INSERT INTO orders (company_id, customer_id, order_number, order_type, status, total_amount, created_at, updated_at)
              VALUES (${COMPANY_ID}, 1, 'ORD-${i}', 'sale', 'confirmed', ${o.totalAmount}, '2024-06-15T00:00:00.000Z', '2024-06-15T00:00:00.000Z');
            `)
          }

          try {
            const result = await generate(COMPANY_ID, {
              templateId: 'sales_by_period',
              filters: {},
              pagination: { limit: 1000, offset: 0 }
            })

            // totalCount in summary matches the total number of rows (full dataset)
            expect(result.summary.totalCount).toBe(result.total)

            // averageAmount = totalAmount / totalCount (when totalCount > 0)
            if (result.summary.totalCount > 0) {
              const expectedAverage = result.summary.totalAmount / result.summary.totalCount
              expect(result.summary.averageAmount).toBeCloseTo(expectedAverage, 10)
            } else {
              expect(result.summary.averageAmount).toBe(0)
            }

            // data.length <= limit
            expect(result.data.length).toBeLessThanOrEqual(result.limit)

            // total reflects the full dataset count
            expect(result.total).toBe(ordersData.length)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('pagination offset does not affect summary totals (computed from full dataset)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            totalAmount: fc.double({ min: 0.01, max: 9999, noNaN: true, noDefaultInfinity: true })
          }),
          { minLength: 3, maxLength: 20 }
        ),
        fc.integer({ min: 1, max: 5 }),
        async (ordersData, offset) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)
          seedCustomer(sqlite, 1)

          for (let i = 0; i < ordersData.length; i++) {
            const o = ordersData[i]
            sqlite.exec(`
              INSERT INTO orders (company_id, customer_id, order_number, order_type, status, total_amount, created_at, updated_at)
              VALUES (${COMPANY_ID}, 1, 'ORD-${i}', 'sale', 'confirmed', ${o.totalAmount}, '2024-06-15T00:00:00.000Z', '2024-06-15T00:00:00.000Z');
            `)
          }

          try {
            // Generate with offset 0
            const fullResult = await generate(COMPANY_ID, {
              templateId: 'sales_by_period',
              filters: {},
              pagination: { limit: 1000, offset: 0 }
            })

            // Generate with a non-zero offset
            const paginatedResult = await generate(COMPANY_ID, {
              templateId: 'sales_by_period',
              filters: {},
              pagination: { limit: 5, offset }
            })

            // Summary should be computed from the full dataset regardless of pagination
            expect(paginatedResult.summary.totalCount).toBe(fullResult.summary.totalCount)
            expect(paginatedResult.summary.totalAmount).toBeCloseTo(fullResult.summary.totalAmount, 10)
            expect(paginatedResult.summary.averageAmount).toBeCloseTo(fullResult.summary.averageAmount, 10)
            expect(paginatedResult.total).toBe(fullResult.total)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 50 }
    )
  })
})
