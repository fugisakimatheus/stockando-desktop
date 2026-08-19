/**
 * Property test for stock balance equals net movement sum.
 *
 * **Validates: Requirements 5.5**
 *
 * Property 1: Stock balance equals net movement sum
 * "For any product and warehouse combination, the materialized Stock_Record
 * quantity SHALL equal the algebraic sum of all stock movements for that
 * product-warehouse pair (inbound and transfer_in add, outbound and transfer_out
 * subtract, adjustment adds or subtracts based on type)."
 */
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'
import { recordInbound, recordOutbound } from '../stock-service'

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
 * Generates a non-empty array of inbound quantities (1 to 20 operations).
 */
const inboundSequenceArb = fc.array(quantityArb, { minLength: 1, maxLength: 20 })

describe('Stock balance equals net movement sum (Property 1)', () => {
  it('materialized stock balance equals sum of inbound movement quantities', async () => {
    await fc.assert(
      fc.asyncProperty(inboundSequenceArb, async (quantities) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        patchDbTransaction(db, sqlite)
        mockedGetDb.mockReturnValue(db)
        seedTestData(sqlite)

        try {
          // Execute a sequence of inbound movements with random quantities
          for (const qty of quantities) {
            await recordInbound(COMPANY_ID, {
              productId: PRODUCT_ID,
              warehouseId: WAREHOUSE_ID,
              quantity: qty
            })
          }

          // Compute expected balance from the sum of all quantities
          const expectedBalance = quantities.reduce((sum, qty) => sum + qty, 0)

          // Read the materialized stock record
          const stockRow = sqlite
            .prepare('SELECT quantity FROM stock WHERE company_id = ? AND product_id = ? AND warehouse_id = ?')
            .get(COMPANY_ID, PRODUCT_ID, WAREHOUSE_ID) as { quantity: number } | undefined

          expect(stockRow).toBeDefined()
          const stockQuantity = stockRow?.quantity ?? 0
          expect(stockQuantity).toBe(expectedBalance)

          // Verify the sum of all movement quantities matches the stock balance
          const movementSum = sqlite
            .prepare(
              `SELECT COALESCE(SUM(quantity), 0) as total
               FROM stock_movements
               WHERE company_id = ? AND product_id = ? AND warehouse_id = ? AND movement_type = 'inbound'`
            )
            .get(COMPANY_ID, PRODUCT_ID, WAREHOUSE_ID) as { total: number }

          expect(movementSum.total).toBe(expectedBalance)
          expect(stockQuantity).toBe(movementSum.total)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 100 }
    )
  })

  it('stock balance equals net sum after mixed inbound and outbound operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate an initial large inbound to ensure we can always perform outbounds
        fc.integer({ min: 500, max: 5000 }),
        // Generate a sequence of smaller outbound quantities (guaranteed to not exceed initial)
        fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 10 }),
        // Generate additional inbounds to interleave
        fc.array(fc.integer({ min: 1, max: 200 }), { minLength: 0, maxLength: 5 }),
        async (initialInbound, outbounds, additionalInbounds) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          patchDbTransaction(db, sqlite)
          mockedGetDb.mockReturnValue(db)
          seedTestData(sqlite)

          try {
            // Start with a large inbound to ensure stock is available
            await recordInbound(COMPANY_ID, {
              productId: PRODUCT_ID,
              warehouseId: WAREHOUSE_ID,
              quantity: initialInbound
            })

            let netSum = initialInbound

            // Execute additional inbounds
            for (const qty of additionalInbounds) {
              await recordInbound(COMPANY_ID, {
                productId: PRODUCT_ID,
                warehouseId: WAREHOUSE_ID,
                quantity: qty
              })
              netSum += qty
            }

            // Execute outbounds (each is small relative to initial inbound)
            for (const qty of outbounds) {
              if (qty <= netSum) {
                await recordOutbound(COMPANY_ID, {
                  productId: PRODUCT_ID,
                  warehouseId: WAREHOUSE_ID,
                  quantity: qty
                })
                netSum -= qty
              }
            }

            // Read the materialized stock record
            const stockRow = sqlite
              .prepare('SELECT quantity FROM stock WHERE company_id = ? AND product_id = ? AND warehouse_id = ?')
              .get(COMPANY_ID, PRODUCT_ID, WAREHOUSE_ID) as { quantity: number } | undefined

            expect(stockRow).toBeDefined()

            // Compute the algebraic sum from all movements
            const movements = sqlite
              .prepare(
                `SELECT movement_type, quantity FROM stock_movements
                 WHERE company_id = ? AND product_id = ? AND warehouse_id = ?`
              )
              .all(COMPANY_ID, PRODUCT_ID, WAREHOUSE_ID) as {
              movement_type: string
              quantity: number
            }[]

            const computedNetSum = movements.reduce((sum, m) => {
              if (m.movement_type === 'inbound' || m.movement_type === 'transfer_in') {
                return sum + m.quantity
              }
              if (m.movement_type === 'outbound' || m.movement_type === 'transfer_out') {
                return sum - m.quantity
              }
              // adjustment type: quantity is always positive in the movement record
              return sum + m.quantity
            }, 0)

            // The materialized balance must equal the computed net sum
            const materializedQty = stockRow?.quantity ?? 0
            expect(materializedQty).toBe(computedNetSum)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 50 }
    )
  })
})
