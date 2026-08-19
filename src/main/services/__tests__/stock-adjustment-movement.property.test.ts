/**
 * Property test for adjustment creates corresponding movement.
 *
 * **Validates: Requirements 7.2**
 *
 * Property 9: Adjustment creates corresponding movement
 * "For any stock adjustment that is successfully recorded, exactly one
 * corresponding stock movement with movement_type 'adjustment' SHALL exist
 * with the same product, warehouse, and quantity."
 */
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'
import { createAdjustment, recordInbound } from '../stock-service'
import type { AdjustmentType } from '../types'

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
 *
 * better-sqlite3 is synchronous and its native .transaction() throws if the callback
 * returns a Promise. However, Drizzle operations on better-sqlite3 execute synchronously
 * (they return QueryPromise objects that resolve immediately). This patch uses manual
 * BEGIN/COMMIT/ROLLBACK and passes the db itself as the transaction context, which is
 * safe because better-sqlite3 is single-connection and all operations are synchronous.
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
const USER_ID = 1

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
 * Generates a random adjustment type: increase, decrease, or correction.
 */
const adjustmentTypeArb: fc.Arbitrary<AdjustmentType> = fc.constantFrom('increase', 'decrease', 'correction')

/**
 * Generates a random quantity between 1 and 500.
 */
const quantityArb = fc.integer({ min: 1, max: 500 })

describe('Adjustment creates corresponding movement (Property 9)', () => {
  it('for any successful adjustment, exactly one movement with type "adjustment" exists with the same product, warehouse, and quantity', async () => {
    await fc.assert(
      fc.asyncProperty(adjustmentTypeArb, quantityArb, async (adjustmentType, quantity) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        patchDbTransaction(db, sqlite)
        mockedGetDb.mockReturnValue(db)
        seedTestData(sqlite)

        try {
          // Seed initial stock for decrease adjustments (large enough to cover any decrease)
          await recordInbound(COMPANY_ID, {
            productId: PRODUCT_ID,
            warehouseId: WAREHOUSE_ID,
            quantity: 10000
          })

          // Create the adjustment
          const adjustment = await createAdjustment(COMPANY_ID, {
            productId: PRODUCT_ID,
            warehouseId: WAREHOUSE_ID,
            adjustmentType,
            quantity,
            reason: 'Property test adjustment',
            createdByUserId: USER_ID
          })

          // Query stock_movements where movement_type='adjustment' for this product+warehouse
          const adjustmentMovements = sqlite
            .prepare(
              `SELECT * FROM stock_movements
               WHERE company_id = ? AND product_id = ? AND warehouse_id = ? AND movement_type = 'adjustment'`
            )
            .all(COMPANY_ID, PRODUCT_ID, WAREHOUSE_ID) as {
            id: number
            quantity: number
            reference_type: string | null
            reference_id: string | null
          }[]

          // Verify exactly one adjustment movement exists
          expect(adjustmentMovements).toHaveLength(1)

          const movement = adjustmentMovements[0]

          // Verify the movement has the same quantity as the adjustment
          expect(movement.quantity).toBe(quantity)

          // Verify it has referenceType='stock_adjustment' and referenceId=String(adjustment.id)
          expect(movement.reference_type).toBe('stock_adjustment')
          expect(movement.reference_id).toBe(String(adjustment.id))
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })
})
