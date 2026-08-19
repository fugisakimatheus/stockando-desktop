/**
 * Property test for stock movement immutability.
 *
 * **Validates: Requirements 6.6**
 *
 * Property 4: Movement immutability
 * "For any stock movement record that has been created, no update or delete
 * operation SHALL modify or remove that record."
 *
 * This test records N inbound movements, captures their data, then performs
 * additional operations (more inbounds, outbounds) and verifies the original
 * movement records remain unchanged in the database.
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

interface MovementSnapshot {
  id: number
  company_id: number
  product_id: number
  warehouse_id: number
  movement_type: string
  quantity: number
  unit_cost: number | null
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  created_at: string
}

/**
 * Generates a random quantity between 1 and 1000.
 */
const quantityArb = fc.integer({ min: 1, max: 1000 })

/**
 * Generates a non-empty array of initial inbound quantities (1 to 10 operations).
 */
const initialInboundsArb = fc.array(quantityArb, { minLength: 1, maxLength: 10 })

/**
 * Generates a sequence of subsequent inbound quantities (0 to 5 operations).
 */
const subsequentInboundsArb = fc.array(quantityArb, { minLength: 0, maxLength: 5 })

/**
 * Generates a sequence of small outbound quantities (0 to 5 operations).
 */
const outboundsArb = fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 0, maxLength: 5 })

describe('Stock movement immutability (Property 4)', () => {
  it('original movement records remain unchanged after subsequent operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        initialInboundsArb,
        subsequentInboundsArb,
        outboundsArb,
        async (initialInbounds, subsequentInbounds, outbounds) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          patchDbTransaction(db, sqlite)
          mockedGetDb.mockReturnValue(db)
          seedTestData(sqlite)

          try {
            // Phase 1: Record initial inbound movements
            for (const qty of initialInbounds) {
              await recordInbound(COMPANY_ID, {
                productId: PRODUCT_ID,
                warehouseId: WAREHOUSE_ID,
                quantity: qty
              })
            }

            // Capture a snapshot of all movement records after initial phase
            const originalMovements = sqlite
              .prepare('SELECT * FROM stock_movements ORDER BY id')
              .all() as MovementSnapshot[]

            expect(originalMovements.length).toBe(initialInbounds.length)

            // Phase 2: Perform additional operations (more inbounds + outbounds)
            for (const qty of subsequentInbounds) {
              await recordInbound(COMPANY_ID, {
                productId: PRODUCT_ID,
                warehouseId: WAREHOUSE_ID,
                quantity: qty
              })
            }

            // Get current balance to determine safe outbounds
            const stockRow = sqlite
              .prepare('SELECT quantity FROM stock WHERE company_id = ? AND product_id = ? AND warehouse_id = ?')
              .get(COMPANY_ID, PRODUCT_ID, WAREHOUSE_ID) as { quantity: number } | undefined

            let availableBalance = stockRow?.quantity ?? 0

            for (const qty of outbounds) {
              if (qty <= availableBalance) {
                await recordOutbound(COMPANY_ID, {
                  productId: PRODUCT_ID,
                  warehouseId: WAREHOUSE_ID,
                  quantity: qty
                })
                availableBalance -= qty
              }
            }

            // Phase 3: Verify original movements are unchanged
            const currentMovements = sqlite
              .prepare('SELECT * FROM stock_movements WHERE id <= ? ORDER BY id')
              .all(originalMovements.length) as MovementSnapshot[]

            // Same number of original records still exist (no deletions)
            expect(currentMovements.length).toBe(originalMovements.length)

            // Each original record is byte-for-byte identical
            for (let i = 0; i < originalMovements.length; i++) {
              const original = originalMovements[i]
              const current = currentMovements[i]

              expect(current.id).toBe(original.id)
              expect(current.company_id).toBe(original.company_id)
              expect(current.product_id).toBe(original.product_id)
              expect(current.warehouse_id).toBe(original.warehouse_id)
              expect(current.movement_type).toBe(original.movement_type)
              expect(current.quantity).toBe(original.quantity)
              expect(current.unit_cost).toBe(original.unit_cost)
              expect(current.reference_type).toBe(original.reference_type)
              expect(current.reference_id).toBe(original.reference_id)
              expect(current.notes).toBe(original.notes)
              expect(current.created_at).toBe(original.created_at)
            }
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 50 }
    )
  })
})
