/**
 * Property test for transactional atomicity of stock operations.
 *
 * **Validates: Requirements 11.1, 11.2, 11.3, 11.4**
 *
 * Property 7: Transactional atomicity for stock operations
 * "For any stock movement, adjustment, or transfer that fails at any step
 * during execution, the database state SHALL be identical to its pre-operation
 * state — no partial movements, balance updates, or adjustment records persist."
 */
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import { InsufficientStockError } from '../../api/errors'
import * as schema from '../../db/schema'
import { createAdjustment, recordInbound, recordOutbound, recordTransfer } from '../stock-service'
import { ADJUSTMENT_TYPES } from '../types'

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

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'admin',
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
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
 * Wraps a Drizzle DB instance with a transaction method that works around
 * better-sqlite3 v13's rejection of async callbacks.
 *
 * Since all Drizzle operations on better-sqlite3 resolve synchronously,
 * we manually manage BEGIN/COMMIT/ROLLBACK and call the async callback
 * awaiting the result, which resolves in the same tick.
 */
function patchTransactionForTests(
  db: BetterSQLite3Database<typeof schema>,
  sqlite: Database.Database
): BetterSQLite3Database<typeof schema> {
  const originalTransaction = db.transaction.bind(db)

  const patchedDb = Object.create(db)
  patchedDb.transaction = async <T>(
    fn: (tx: Parameters<Parameters<typeof originalTransaction>[0]>[0]) => Promise<T>
  ): Promise<T> => {
    sqlite.exec('BEGIN')
    try {
      const result = await fn(db as unknown as Parameters<Parameters<typeof originalTransaction>[0]>[0])
      sqlite.exec('COMMIT')
      return result
    } catch (error) {
      sqlite.exec('ROLLBACK')
      throw error
    }
  }

  return patchedDb as BetterSQLite3Database<typeof schema>
}

const COMPANY_ID = 1
const PRODUCT_ID = 1
const WAREHOUSE_ID = 1
const SOURCE_WAREHOUSE_ID = 1
const DEST_WAREHOUSE_ID = 2
const USER_ID = 1

function seedTestData(sqlite: Database.Database): void {
  const now = '2024-01-01T00:00:00.000Z'

  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (${COMPANY_ID}, 'Test Company', '11111111000100', 'active', '${now}', '${now}');

    INSERT INTO products (id, company_id, sku, name, track_inventory, status, created_at, updated_at)
    VALUES (${PRODUCT_ID}, ${COMPANY_ID}, 'SKU-001', 'Test Product', 1, 'active', '${now}', '${now}');

    INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
    VALUES (${WAREHOUSE_ID}, ${COMPANY_ID}, 'Warehouse A', 'WH-A', 'active', '${now}', '${now}');

    INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
    VALUES (${DEST_WAREHOUSE_ID}, ${COMPANY_ID}, 'Warehouse B', 'WH-B', 'active', '${now}', '${now}');

    INSERT INTO users (id, company_id, name, email, role, status, created_at, updated_at)
    VALUES (${USER_ID}, ${COMPANY_ID}, 'Test User', 'user@test.com', 'admin', 'active', '${now}', '${now}');
  `)
}

/**
 * Captures a full database snapshot of all mutable tables for comparison.
 */
function captureDbSnapshot(sqlite: Database.Database): {
  stock: unknown[]
  movements: unknown[]
  adjustments: unknown[]
} {
  const stockRows = sqlite.prepare('SELECT * FROM stock WHERE company_id = ?').all(COMPANY_ID)
  const movementRows = sqlite.prepare('SELECT * FROM stock_movements WHERE company_id = ?').all(COMPANY_ID)
  const adjustmentRows = sqlite.prepare('SELECT * FROM stock_adjustments WHERE company_id = ?').all(COMPANY_ID)

  return {
    stock: stockRows,
    movements: movementRows,
    adjustments: adjustmentRows
  }
}

/**
 * Generates a positive integer quantity for stock operations.
 * Uses integers 1..1000 to keep operations deterministic and avoid floating-point edge cases.
 */
const positiveQuantityArb = fc.integer({ min: 1, max: 1000 })

describe('Transactional atomicity for stock operations (Property 7)', () => {
  it('failed outbound leaves no partial records — transaction rolls back completely', async () => {
    await fc.assert(
      fc.asyncProperty(positiveQuantityArb, positiveQuantityArb, async (initialQty, extra) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        const patchedDb = patchTransactionForTests(db, sqlite)
        mockedGetDb.mockReturnValue(patchedDb)
        seedTestData(sqlite)

        try {
          // Seed initial stock via inbound
          await recordInbound(COMPANY_ID, {
            productId: PRODUCT_ID,
            warehouseId: WAREHOUSE_ID,
            quantity: initialQty
          })

          // Capture database state after successful inbound
          const snapshotBefore = captureDbSnapshot(sqlite)

          // Attempt outbound exceeding available stock (initialQty + extra > initialQty)
          const outboundQty = initialQty + extra

          await expect(
            recordOutbound(COMPANY_ID, {
              productId: PRODUCT_ID,
              warehouseId: WAREHOUSE_ID,
              quantity: outboundQty
            })
          ).rejects.toThrow(InsufficientStockError)

          // Verify database state is identical to pre-operation snapshot
          const snapshotAfter = captureDbSnapshot(sqlite)
          expect(snapshotAfter).toEqual(snapshotBefore)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })

  it('failed transfer leaves no partial records — no movements, no destination stock, source unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(positiveQuantityArb, positiveQuantityArb, async (initialQty, extra) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        const patchedDb = patchTransactionForTests(db, sqlite)
        mockedGetDb.mockReturnValue(patchedDb)
        seedTestData(sqlite)

        try {
          // Seed initial stock at source warehouse
          await recordInbound(COMPANY_ID, {
            productId: PRODUCT_ID,
            warehouseId: SOURCE_WAREHOUSE_ID,
            quantity: initialQty
          })

          // Capture database state after successful inbound
          const snapshotBefore = captureDbSnapshot(sqlite)

          // Attempt transfer exceeding source stock
          const transferQty = initialQty + extra

          await expect(
            recordTransfer(COMPANY_ID, {
              productId: PRODUCT_ID,
              sourceWarehouseId: SOURCE_WAREHOUSE_ID,
              destinationWarehouseId: DEST_WAREHOUSE_ID,
              quantity: transferQty
            })
          ).rejects.toThrow(InsufficientStockError)

          // Verify database state is identical to pre-operation snapshot
          const snapshotAfter = captureDbSnapshot(sqlite)
          expect(snapshotAfter).toEqual(snapshotBefore)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })

  it('failed decrease adjustment leaves no partial records — no adjustments, no movements, stock unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(positiveQuantityArb, positiveQuantityArb, async (initialQty, extra) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        const patchedDb = patchTransactionForTests(db, sqlite)
        mockedGetDb.mockReturnValue(patchedDb)
        seedTestData(sqlite)

        try {
          // Seed initial stock via inbound
          await recordInbound(COMPANY_ID, {
            productId: PRODUCT_ID,
            warehouseId: WAREHOUSE_ID,
            quantity: initialQty
          })

          // Capture database state after successful inbound
          const snapshotBefore = captureDbSnapshot(sqlite)

          // Attempt decrease adjustment exceeding available stock
          const decreaseQty = initialQty + extra

          await expect(
            createAdjustment(COMPANY_ID, {
              productId: PRODUCT_ID,
              warehouseId: WAREHOUSE_ID,
              adjustmentType: ADJUSTMENT_TYPES.decrease,
              quantity: decreaseQty,
              reason: 'Test decrease',
              createdByUserId: USER_ID
            })
          ).rejects.toThrow(InsufficientStockError)

          // Verify database state is identical to pre-operation snapshot
          const snapshotAfter = captureDbSnapshot(sqlite)
          expect(snapshotAfter).toEqual(snapshotBefore)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })
})
