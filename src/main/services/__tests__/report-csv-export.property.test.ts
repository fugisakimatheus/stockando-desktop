/**
 * Property test for CSV export encoding.
 *
 * **Validates: Requirements 4.7**
 *
 * Property 18: Export file UTF-8 BOM encoding
 * "For any CSV export file, the first 3 bytes SHALL be the UTF-8 BOM sequence
 * (EF BB BF), and the file content SHALL be valid UTF-8. This ensures
 * compatibility with spreadsheet applications that require BOM for proper
 * encoding detection."
 *
 * Verifies:
 * 1. File starts with \uFEFF (UTF-8 BOM)
 * 2. First data line after BOM is the header with column labels separated by `;`
 * 3. Each subsequent line has the same number of fields as columns
 */
import { readFileSync, rmSync } from 'node:fs'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../server', () => ({
  getDb: vi.fn()
}))

vi.mock('../audit-service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-exports')
  }
}))

import { getDb } from '../../server'
import { exportCsv } from '../report-service'
import { getReportTemplate } from '../report-templates'

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
      reference_id INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL
    );

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
  `)

  return sqlite
}

const COMPANY_ID = 1
const NOW = '2024-06-15T12:00:00.000Z'

function seedCompany(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (${COMPANY_ID}, 'Test Company', '11111111000100', 'active', '${NOW}', '${NOW}');
  `)
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  try {
    rmSync('/tmp/test-exports', { recursive: true, force: true })
  } catch {
    // ignore cleanup errors
  }
})

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Arbitrary for a sales order suitable for "sales_by_period" export.
 */
const salesOrderArb = fc.record({
  totalAmount: fc.double({ min: 0.01, max: 99999.99, noNaN: true }),
  day: fc.integer({ min: 1, max: 28 })
})

// ---------------------------------------------------------------------------
// Property 18: Export file UTF-8 BOM encoding
// ---------------------------------------------------------------------------

describe('Export file UTF-8 BOM encoding (Property 18)', () => {
  it('every CSV export starts with UTF-8 BOM, uses semicolon delimiter, and header matches template column labels', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(salesOrderArb, { minLength: 0, maxLength: 15 }), async (orders) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompany(sqlite)

        // Insert confirmed sale orders for the "sales_by_period" template
        for (let i = 0; i < orders.length; i++) {
          const o = orders[i]
          const createdAt = `2024-06-${String(o.day).padStart(2, '0')}T10:00:00.000Z`
          sqlite.exec(`
              INSERT INTO orders (company_id, order_number, order_type, status, total_amount, confirmed_at, created_at, updated_at)
              VALUES (${COMPANY_ID}, 'ORD-${i}', 'sale', 'confirmed', ${o.totalAmount}, '${createdAt}', '${createdAt}', '${createdAt}');
            `)
        }

        try {
          const result = await exportCsv(COMPANY_ID, {
            templateId: 'sales_by_period',
            filters: {
              startDate: '2024-06-01T00:00:00.000Z',
              endDate: '2024-06-30T23:59:59.999Z'
            },
            format: 'csv'
          })

          // Read the generated file
          const fileContent = readFileSync(result.filePath, 'utf-8')
          const template = getReportTemplate('sales_by_period')
          if (!template) throw new Error('Template not found')

          // 1. File starts with UTF-8 BOM (\uFEFF)
          expect(fileContent.charAt(0)).toBe('\uFEFF')

          // Also verify raw bytes: BOM is EF BB BF in UTF-8
          const rawBytes = readFileSync(result.filePath)
          expect(rawBytes[0]).toBe(0xef)
          expect(rawBytes[1]).toBe(0xbb)
          expect(rawBytes[2]).toBe(0xbf)

          // 2. First line after BOM is the header with column labels separated by `;`
          const contentWithoutBom = fileContent.slice(1)
          const lines = contentWithoutBom.split('\n')
          const headerLine = lines[0]
          const expectedHeader = template.columns.map((col) => col.label).join(';')
          expect(headerLine).toBe(expectedHeader)

          // 3. Each subsequent line has the same number of fields as columns
          const expectedFieldCount = template.columns.length
          const dataLines = lines.slice(1).filter((line) => line.length > 0)
          for (const dataLine of dataLines) {
            const fieldCount = dataLine.split(';').length
            expect(fieldCount).toBe(expectedFieldCount)
          }

          // Verify record count matches
          expect(dataLines.length).toBe(orders.length)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })
})
