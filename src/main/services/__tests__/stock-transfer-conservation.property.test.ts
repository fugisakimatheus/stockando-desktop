/**
 * Property test for transfer conservation.
 *
 * **Validates: Requirements 6.3**
 *
 * Property 3: Transfer conservation
 * "For any transfer operation between two warehouses, the sum of quantities
 * across both warehouses for the transferred product SHALL remain unchanged
 * after the transfer completes."
 */
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'
import { recordInbound, recordTransfer } from '../stock-service'

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
    CREATE UNIQUE INDEX companies_document_number_unique ON companies(document_number);

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
    CREATE INDEX products_company_idx ON products(company_id);
    CREATE INDEX products_category_idx ON products(category_id);
    CREATE INDEX products_status_idx ON products(status);

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
    CREATE INDEX warehouses_company_idx ON warehouses(company_id);

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
    CREATE INDEX stock_product_idx ON stock(product_id);
    CREATE INDEX stock_warehouse_idx ON stock(warehouse_id);

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
    CREATE INDEX stock_movements_company_product_idx ON stock_movements(company_id, product_id);
    CREATE INDEX stock_movements_company_warehouse_idx ON stock_movements(company_id, warehouse_id);
  `)

  return sqlite
}

const COMPANY_ID = 1
const PRODUCT_ID = 1
const SOURCE_WAREHOUSE_ID = 1
const DEST_WAREHOUSE_ID = 2

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

function seedTestData(sqlite: Database.Database): void {
  const now = '2024-01-01T00:00:00.000Z'

  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (${COMPANY_ID}, 'Test Company', '11111111000100', 'active', '${now}', '${now}');

    INSERT INTO products (id, company_id, sku, name, track_inventory, status, created_at, updated_at)
    VALUES (${PRODUCT_ID}, ${COMPANY_ID}, 'SKU-001', 'Test Product', 1, 'active', '${now}', '${now}');

    INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
    VALUES (${SOURCE_WAREHOUSE_ID}, ${COMPANY_ID}, 'Source Warehouse', 'WH-SRC', 'active', '${now}', '${now}');

    INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
    VALUES (${DEST_WAREHOUSE_ID}, ${COMPANY_ID}, 'Destination Warehouse', 'WH-DST', 'active', '${now}', '${now}');
  `)
}

function getTotalStock(sqlite: Database.Database): number {
  const row = sqlite
    .prepare('SELECT COALESCE(SUM(quantity), 0) as total FROM stock WHERE company_id = ? AND product_id = ?')
    .get(COMPANY_ID, PRODUCT_ID) as { total: number }
  return row.total
}

describe('Transfer conservation (Property 3)', () => {
  it('total stock across both warehouses remains unchanged after a transfer', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        async (initialStock, transferAmount) => {
          // Ensure transfer amount does not exceed initial stock
          const actualTransfer = Math.min(transferAmount, initialStock)

          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          patchDbTransaction(db, sqlite)
          mockedGetDb.mockReturnValue(db)
          seedTestData(sqlite)

          try {
            // Record initial inbound stock at source warehouse
            await recordInbound(COMPANY_ID, {
              productId: PRODUCT_ID,
              warehouseId: SOURCE_WAREHOUSE_ID,
              quantity: initialStock
            })

            // Capture total stock before transfer
            const totalBefore = getTotalStock(sqlite)
            expect(totalBefore).toBe(initialStock)

            // Execute transfer from source to destination
            await recordTransfer(COMPANY_ID, {
              productId: PRODUCT_ID,
              sourceWarehouseId: SOURCE_WAREHOUSE_ID,
              destinationWarehouseId: DEST_WAREHOUSE_ID,
              quantity: actualTransfer
            })

            // Verify total stock across both warehouses is conserved
            const totalAfter = getTotalStock(sqlite)
            expect(totalAfter).toBe(totalBefore)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
