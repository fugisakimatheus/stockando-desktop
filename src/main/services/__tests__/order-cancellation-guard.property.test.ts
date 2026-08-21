/**
 * Property-based tests for Order Cancellation Guard.
 *
 * **Validates: Requirements 11.3**
 *
 * Property 16: Order cancellation blocked by authorized fiscal document
 * "For any Sales_Order that has an associated fiscal document in 'authorized' status,
 * attempting to cancel the order SHALL be rejected with OrderHasActiveFiscalDocError."
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OrderHasActiveFiscalDocError } from '../../api/errors'
import * as schema from '../../db/schema'
import { transitionStatus } from '../sales-order-service'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../server', () => ({
  getDb: vi.fn()
}))

vi.mock('../audit-service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
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

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      price REAL NOT NULL DEFAULT 0,
      cost_price REAL NOT NULL DEFAULT 0,
      track_inventory INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id INTEGER REFERENCES customers(id),
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

    CREATE TABLE invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      digital_certificate_id INTEGER,
      tax_rule_id INTEGER,
      document_type TEXT NOT NULL,
      document_number TEXT NOT NULL,
      series TEXT,
      access_key TEXT,
      protocol_number TEXT,
      issue_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      authorized_at TEXT,
      cancelled_at TEXT,
      cancellation_justification TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX invoices_company_document_unique ON invoices(company_id, document_type, document_number);

    CREATE TABLE payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE order_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      transaction_reference TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE numbering_sequences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      sequence_type TEXT NOT NULL,
      current_value INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX numbering_sequences_company_type_unique ON numbering_sequences(company_id, sequence_type);

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
  `)

  return sqlite
}

function seedCompany(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (1, 'Test Company', '12345678000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

    INSERT INTO users (id, company_id, name, email, role, status, created_at, updated_at)
    VALUES (1, 1, 'Admin User', 'admin@test.com', 'admin', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

    INSERT INTO customers (id, company_id, name, document_number, status, created_at, updated_at)
    VALUES (1, 1, 'Test Customer', '11122233344', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

    INSERT INTO products (id, company_id, name, sku, price, created_at, updated_at)
    VALUES (1, 1, 'Test Product', 'SKU-001', 100.00, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

function seedConfirmedOrder(sqlite: Database.Database, totalAmount: number): number {
  const stmt = sqlite.prepare(`
    INSERT INTO orders (company_id, customer_id, order_number, order_type, status, total_amount, confirmed_at, created_at, updated_at)
    VALUES (1, 1, ?, 'sale', 'confirmed', ?, '2024-01-15T00:00:00.000Z', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z')
  `)
  const result = stmt.run(`ORD-${Date.now()}-${Math.random()}`, totalAmount)
  return Number(result.lastInsertRowid)
}

function seedInvoice(
  sqlite: Database.Database,
  orderId: number,
  status: 'draft' | 'authorized' | 'cancelled' | 'denied'
): number {
  const stmt = sqlite.prepare(`
    INSERT INTO invoices (company_id, order_id, customer_id, document_type, document_number, issue_date, status, total_amount, created_at, updated_at)
    VALUES (1, ?, 1, 'NF-e', ?, '2024-01-15', ?, 1000.00, '2024-01-15T00:00:00.000Z', '2024-01-15T00:00:00.000Z')
  `)
  const docNum = `DOC-${Date.now()}-${Math.random()}`
  const result = stmt.run(orderId, docNum, status)
  return Number(result.lastInsertRowid)
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const totalAmountArb = fc
  .double({ min: 1, max: 99999.99, noNaN: true, noDefaultInfinity: true })
  .map((v) => Math.round(v * 100) / 100)

const nonAuthorizedStatusArb = fc.constantFrom('draft' as const, 'cancelled' as const, 'denied' as const)

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 16: Order cancellation blocked by authorized fiscal document', () => {
  let sqlite: Database.Database

  afterEach(() => {
    if (sqlite) {
      sqlite.close()
    }
    vi.clearAllMocks()
  })

  it('cancellation SHALL be rejected when an authorized fiscal document exists', async () => {
    await fc.assert(
      fc.asyncProperty(totalAmountArb, async (totalAmount) => {
        sqlite = createTestDb()
        seedCompany(sqlite)

        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db as ReturnType<typeof getDb>)

        const orderId = seedConfirmedOrder(sqlite, totalAmount)
        seedInvoice(sqlite, orderId, 'authorized')

        await expect(transitionStatus(1, orderId, 'cancelled')).rejects.toThrow(OrderHasActiveFiscalDocError)

        // Verify the order status remains unchanged
        const row = sqlite.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: string }
        expect(row.status).toBe('confirmed')

        sqlite.close()
      }),
      { numRuns: 20 }
    )
  })

  it('cancellation SHALL succeed when no authorized fiscal document exists (non-authorized statuses)', async () => {
    await fc.assert(
      fc.asyncProperty(totalAmountArb, nonAuthorizedStatusArb, async (totalAmount, invoiceStatus) => {
        sqlite = createTestDb()
        seedCompany(sqlite)

        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db as ReturnType<typeof getDb>)

        const orderId = seedConfirmedOrder(sqlite, totalAmount)
        seedInvoice(sqlite, orderId, invoiceStatus)

        // Should NOT throw — cancellation allowed when invoice is not authorized
        const result = await transitionStatus(1, orderId, 'cancelled')
        expect(result).toBeDefined()

        // Verify the order status is now cancelled
        const row = sqlite.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: string }
        expect(row.status).toBe('cancelled')

        sqlite.close()
      }),
      { numRuns: 20 }
    )
  })

  it('cancellation SHALL succeed when no fiscal document exists at all', async () => {
    await fc.assert(
      fc.asyncProperty(totalAmountArb, async (totalAmount) => {
        sqlite = createTestDb()
        seedCompany(sqlite)

        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db as ReturnType<typeof getDb>)

        const orderId = seedConfirmedOrder(sqlite, totalAmount)
        // No invoice seeded

        const result = await transitionStatus(1, orderId, 'cancelled')
        expect(result).toBeDefined()

        // Verify the order status is now cancelled
        const row = sqlite.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: string }
        expect(row.status).toBe('cancelled')

        sqlite.close()
      }),
      { numRuns: 20 }
    )
  })
})
