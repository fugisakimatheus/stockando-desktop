/**
 * Property test for reconciliation correctness.
 *
 * **Validates: Requirements 7.6, 7.7**
 *
 * Property 10: Reconciliation correctness
 * "For any reconciliation check on a product-warehouse pair, the reported
 * computed balance SHALL equal the actual sum of all movements for that pair,
 * and the discrepancy SHALL equal the difference between computed and
 * materialized balances."
 */
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'
import { reconcile, recordInbound, recordOutbound } from '../stock-service'

vi.mock('../../server', () => ({
  getDb: vi.fn()
}))

vi.mock('../audit-service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
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
    CREATE UNIQUE INDEX warehouses_company_code_unique ON warehouses(company_id, code);

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

    CREATE TABLE stock_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      adjustment_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_cost REAL,
      reason TEXT,
      notes TEXT,
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      user_id INTEGER,
      details TEXT,
      created_at TEXT NOT NULL
    );
  `)

  return sqlite
}

/**
 * Patches Drizzle's db.transaction() to support async callbacks with better-sqlite3.
 */
function patchDbTransaction(db: BetterSQLite3Database<typeof schema>, sqlite: Database.Database): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(db as any).transaction = async function <T>(
    fn: (tx: BetterSQLite3Database<typeof schema>) => Promise<T>
  ): Promise<T> {
    sqlite.exec('BEGIN')
    try {
      const result = await fn(db)
      sqlite.exec('COMMIT')
      return result
    } catch (e) {
      sqlite.exec('ROLLBACK')
      throw e
    }
  }
}

const COMPANY_ID = 1
const PRODUCT_ID = 1
const WAREHOUSE_ID = 1

function seedTestData(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (1, 'Test Company', '11111111000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

    INSERT INTO products (id, company_id, sku, name, track_inventory, status, created_at, updated_at)
    VALUES (1, 1, 'SKU-001', 'Test Product', 1, 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

    INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
    VALUES (1, 1, 'Main Warehouse', 'WH-01', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

/**
 * Generates a random quantity between 1 and 1000.
 */
const quantityArb = fc.integer({ min: 1, max: 1000 })

/**
 * Represents a stock operation: either inbound (+) or outbound (-).
 */
type Operation = { type: 'inbound'; quantity: number } | { type: 'outbound'; quantity: number }

/**
 * Generates a valid sequence of inbound/outbound operations that never causes
 * the running balance to go negative.
 */
const operationSequenceArb = fc
  .array(
    fc.record({
      type: fc.constantFrom('inbound' as const, 'outbound' as const),
      quantity: quantityArb
    }),
    { minLength: 1, maxLength: 20 }
  )
  .map((ops) => {
    // Filter operations to ensure balance never goes negative
    const validOps: Operation[] = []
    let balance = 0

    for (const op of ops) {
      if (op.type === 'inbound') {
        validOps.push(op)
        balance += op.quantity
      } else if (balance >= op.quantity) {
        validOps.push(op)
        balance -= op.quantity
      }
    }

    // Ensure at least one inbound operation exists
    if (validOps.length === 0) {
      const qty = ops[0].quantity
      validOps.push({ type: 'inbound', quantity: qty })
    }

    return validOps
  })

describe('Reconciliation correctness (Property 10)', () => {
  it('reconciliation reports correct computed balance, materialized balance, discrepancy, and consistency', async () => {
    await fc.assert(
      fc.asyncProperty(operationSequenceArb, async (operations) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        patchDbTransaction(db, sqlite)
        mockedGetDb.mockReturnValue(db)
        seedTestData(sqlite)

        try {
          // Execute the generated sequence of operations
          for (const op of operations) {
            if (op.type === 'inbound') {
              await recordInbound(COMPANY_ID, {
                productId: PRODUCT_ID,
                warehouseId: WAREHOUSE_ID,
                quantity: op.quantity
              })
            } else {
              await recordOutbound(COMPANY_ID, {
                productId: PRODUCT_ID,
                warehouseId: WAREHOUSE_ID,
                quantity: op.quantity
              })
            }
          }

          // Compute the expected net sum independently from movements
          const expectedNetSum = operations.reduce((sum, op) => {
            return op.type === 'inbound' ? sum + op.quantity : sum - op.quantity
          }, 0)

          // Call reconcile and verify the result
          const result = await reconcile(COMPANY_ID, PRODUCT_ID, WAREHOUSE_ID)

          // 1. computedBalance equals expected sum of movements (calculated independently)
          expect(result.computedBalance).toBe(expectedNetSum)

          // 2. materializedBalance equals the stock record quantity
          const stockRow = sqlite
            .prepare('SELECT quantity FROM stock WHERE company_id = ? AND product_id = ? AND warehouse_id = ?')
            .get(COMPANY_ID, PRODUCT_ID, WAREHOUSE_ID) as { quantity: number } | undefined

          const materializedQty = stockRow?.quantity ?? 0
          expect(result.materializedBalance).toBe(materializedQty)

          // 3. discrepancy equals computedBalance - materializedBalance
          expect(result.discrepancy).toBe(result.computedBalance - result.materializedBalance)

          // 4. isConsistent is true (atomic operations should never produce discrepancy)
          expect(result.isConsistent).toBe(true)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })
})
