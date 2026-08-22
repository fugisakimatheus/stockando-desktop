/**
 * Property tests for company data isolation in reporting.
 *
 * **Validates: Requirements 16.1, 16.2, 16.3, 16.4**
 *
 * Property 17: Company data isolation for reporting
 * "Dashboard aggregates, report generation, and entity export for company A
 * never include data belonging to company B, even when both companies have
 * data in the same tables."
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

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-isolation-exports')
  }
}))

import { getDb } from '../../server'
import { clearCache, getAggregates } from '../dashboard-service'
import { exportEntities } from '../export-service'
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPANY_A_ID = 1
const COMPANY_B_ID = 2

function seedCompanies(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES
      (${COMPANY_A_ID}, 'Company A', '11111111000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
      (${COMPANY_B_ID}, 'Company B', '22222222000200', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Arbitrary for sale orders that will be distributed between two companies.
 */
const orderAmountArb = fc.double({ min: 10, max: 50000, noNaN: true })

const orderSetArb = fc.record({
  companyAOrders: fc.array(orderAmountArb, { minLength: 1, maxLength: 10 }),
  companyBOrders: fc.array(orderAmountArb, { minLength: 1, maxLength: 10 })
})

/**
 * Arbitrary for installments distributed between two companies.
 */
const installmentSetArb = fc.record({
  companyAInstallments: fc.array(fc.double({ min: 1, max: 20000, noNaN: true }), { minLength: 1, maxLength: 10 }),
  companyBInstallments: fc.array(fc.double({ min: 1, max: 20000, noNaN: true }), { minLength: 1, maxLength: 10 })
})

/**
 * Arbitrary for products distributed between two companies.
 */
const productSetArb = fc.record({
  companyAProducts: fc.array(
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 20 }).map((s) => s.replace(/'/g, '')),
      costPrice: fc.double({ min: 1, max: 999, noNaN: true }),
      salePrice: fc.double({ min: 1, max: 999, noNaN: true })
    }),
    { minLength: 1, maxLength: 5 }
  ),
  companyBProducts: fc.array(
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 20 }).map((s) => s.replace(/'/g, '')),
      costPrice: fc.double({ min: 1, max: 999, noNaN: true }),
      salePrice: fc.double({ min: 1, max: 999, noNaN: true })
    }),
    { minLength: 1, maxLength: 5 }
  )
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertOrdersForCompany(sqlite: Database.Database, companyId: number, amounts: number[], prefix: string): void {
  for (let i = 0; i < amounts.length; i++) {
    sqlite.exec(`
      INSERT INTO orders (company_id, order_number, order_type, status, total_amount, confirmed_at, created_at, updated_at)
      VALUES (${companyId}, '${prefix}-ORD-${i}', 'sale', 'confirmed', ${amounts[i]}, '2024-06-10T10:00:00.000Z', '2024-06-01T00:00:00.000Z', '2024-06-01T00:00:00.000Z');
    `)
  }
}

function insertInstallmentsForCompany(
  sqlite: Database.Database,
  companyId: number,
  amounts: number[],
  orderType = 'sale'
): void {
  for (let i = 0; i < amounts.length; i++) {
    sqlite.exec(`
      INSERT INTO installments (company_id, order_id, order_type, installment_number, amount, due_date, status, created_at, updated_at)
      VALUES (${companyId}, ${i + 1}, '${orderType}', 1, ${amounts[i]}, '2024-06-20T00:00:00.000Z', 'pending', '2024-06-01T00:00:00.000Z', '2024-06-01T00:00:00.000Z');
    `)
  }
}

function insertProductsForCompany(
  sqlite: Database.Database,
  companyId: number,
  products: { name: string; costPrice: number; salePrice: number }[],
  prefix: string
): void {
  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    sqlite.exec(`
      INSERT INTO products (company_id, sku, name, cost_price, sale_price, status, created_at, updated_at)
      VALUES (${companyId}, '${prefix}-SKU-${i}', '${p.name || `Product${i}`}', ${p.costPrice}, ${p.salePrice}, 'active', '2024-06-01T00:00:00.000Z', '2024-06-01T00:00:00.000Z');
    `)
  }
}

// ---------------------------------------------------------------------------
// Property 17a: Dashboard aggregates isolation
// ---------------------------------------------------------------------------

describe('Company data isolation — Dashboard aggregates (Property 17a)', () => {
  beforeEach(() => {
    clearCache()
  })

  it('dashboard aggregates for company A exclude company B sales and receivables', async () => {
    await fc.assert(
      fc.asyncProperty(orderSetArb, installmentSetArb, async (orderSet, installmentSet) => {
        clearCache()
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanies(sqlite)

        // Insert orders for both companies
        insertOrdersForCompany(sqlite, COMPANY_A_ID, orderSet.companyAOrders, 'A')
        insertOrdersForCompany(sqlite, COMPANY_B_ID, orderSet.companyBOrders, 'B')

        // Insert installments for both companies
        insertInstallmentsForCompany(sqlite, COMPANY_A_ID, installmentSet.companyAInstallments)
        insertInstallmentsForCompany(sqlite, COMPANY_B_ID, installmentSet.companyBInstallments)

        const period = {
          type: 'custom' as const,
          startDate: '2024-06-01T00:00:00.000Z',
          endDate: '2024-06-30T23:59:59.999Z'
        }

        try {
          const resultA = await getAggregates(COMPANY_A_ID, period)

          // Sales total should match only company A orders
          const expectedSalesA = orderSet.companyAOrders.reduce((sum, a) => sum + a, 0)
          expect(resultA.metrics.totalSales).toBeCloseTo(expectedSalesA, 2)

          // Receivables should match only company A pending installments
          const expectedReceivablesA = installmentSet.companyAInstallments.reduce((sum, a) => sum + a, 0)
          expect(resultA.metrics.totalReceivables).toBeCloseTo(expectedReceivablesA, 2)

          // Clear cache and verify company B also isolated
          clearCache()
          const resultB = await getAggregates(COMPANY_B_ID, period)

          const expectedSalesB = orderSet.companyBOrders.reduce((sum, a) => sum + a, 0)
          expect(resultB.metrics.totalSales).toBeCloseTo(expectedSalesB, 2)

          const expectedReceivablesB = installmentSet.companyBInstallments.reduce((sum, a) => sum + a, 0)
          expect(resultB.metrics.totalReceivables).toBeCloseTo(expectedReceivablesB, 2)

          // Cross-check: company A totals must NOT include company B data
          expect(resultA.metrics.totalSales).not.toBeCloseTo(expectedSalesA + expectedSalesB, 2)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 17b: Report generation isolation
// ---------------------------------------------------------------------------

describe('Company data isolation — Report generation (Property 17b)', () => {
  beforeEach(() => {
    clearCache()
  })

  it('sales_by_period report for company A excludes company B orders', async () => {
    await fc.assert(
      fc.asyncProperty(orderSetArb, async (orderSet) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanies(sqlite)

        // Insert orders for both companies
        insertOrdersForCompany(sqlite, COMPANY_A_ID, orderSet.companyAOrders, 'A')
        insertOrdersForCompany(sqlite, COMPANY_B_ID, orderSet.companyBOrders, 'B')

        try {
          const reportA = await generate(COMPANY_A_ID, {
            templateId: 'sales_by_period',
            filters: {
              startDate: '2024-06-01T00:00:00.000Z',
              endDate: '2024-06-30T23:59:59.999Z'
            },
            pagination: { limit: 100, offset: 0 }
          })

          // Report for company A should only contain company A orders
          expect(reportA.data.length).toBe(orderSet.companyAOrders.length)

          // Summary totalAmount should match sum of company A order amounts
          const expectedTotalA = orderSet.companyAOrders.reduce((sum, a) => sum + a, 0)
          expect(reportA.summary.totalAmount).toBeCloseTo(expectedTotalA, 2)

          // Verify company B report is isolated too
          const reportB = await generate(COMPANY_B_ID, {
            templateId: 'sales_by_period',
            filters: {
              startDate: '2024-06-01T00:00:00.000Z',
              endDate: '2024-06-30T23:59:59.999Z'
            },
            pagination: { limit: 100, offset: 0 }
          })

          expect(reportB.data.length).toBe(orderSet.companyBOrders.length)

          const expectedTotalB = orderSet.companyBOrders.reduce((sum, a) => sum + a, 0)
          expect(reportB.summary.totalAmount).toBeCloseTo(expectedTotalB, 2)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 17c: Entity export isolation
// ---------------------------------------------------------------------------

describe('Company data isolation — Entity export (Property 17c)', () => {
  it('product export for company A returns only company A products', async () => {
    await fc.assert(
      fc.asyncProperty(productSetArb, async (productSet) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanies(sqlite)

        // Insert products for both companies
        insertProductsForCompany(sqlite, COMPANY_A_ID, productSet.companyAProducts, 'A')
        insertProductsForCompany(sqlite, COMPANY_B_ID, productSet.companyBProducts, 'B')

        try {
          const resultA = await exportEntities(COMPANY_A_ID, {
            entityType: 'products'
          })

          // Record count should match only company A's products
          expect(resultA.recordCount).toBe(productSet.companyAProducts.length)

          const resultB = await exportEntities(COMPANY_B_ID, {
            entityType: 'products'
          })

          // Record count should match only company B's products
          expect(resultB.recordCount).toBe(productSet.companyBProducts.length)

          // Neither export should include the other company's data
          expect(resultA.recordCount + resultB.recordCount).toBe(
            productSet.companyAProducts.length + productSet.companyBProducts.length
          )
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })
})
