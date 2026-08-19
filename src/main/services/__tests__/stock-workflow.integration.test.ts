/**
 * Integration tests for the stock workflow.
 *
 * Tests the complete lifecycle of stock operations:
 * - Inbound → check balance → outbound → verify balance → transfer → verify both warehouses
 * - Adjustment → verify movement + balance → verify audit log
 * - Reconciliation after a sequence of movements
 *
 * Requirements: 5.5, 6.1, 6.2, 6.3, 7.1, 7.2, 7.6, 11.1, 11.2, 11.3
 */
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import { describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'
import {
  createAdjustment,
  getProductBalances,
  reconcile,
  recordInbound,
  recordOutbound,
  recordTransfer
} from '../stock-service'
import { ADJUSTMENT_TYPES, MOVEMENT_TYPES } from '../types'

vi.mock('../../server', () => ({
  getDb: vi.fn()
}))

vi.mock('../audit-service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
}))

import { getDb } from '../../server'
import { logAudit } from '../audit-service'

const mockedGetDb = vi.mocked(getDb)
const mockedLogAudit = vi.mocked(logAudit)

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
const WAREHOUSE_1_ID = 1
const WAREHOUSE_2_ID = 2

function seedTestData(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (1, 'Test Company', '11111111000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

    INSERT INTO products (id, company_id, sku, name, track_inventory, status, created_at, updated_at)
    VALUES (1, 1, 'SKU-001', 'Test Product', 1, 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

    INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
    VALUES (1, 1, 'Warehouse A', 'WH-A', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

    INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
    VALUES (2, 1, 'Warehouse B', 'WH-B', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

function getStockQuantity(sqlite: Database.Database, warehouseId: number): number {
  const row = sqlite
    .prepare('SELECT quantity FROM stock WHERE company_id = ? AND product_id = ? AND warehouse_id = ?')
    .get(COMPANY_ID, PRODUCT_ID, warehouseId) as { quantity: number } | undefined
  return row?.quantity ?? 0
}

function getMovements(sqlite: Database.Database, warehouseId?: number) {
  if (warehouseId !== undefined) {
    return sqlite
      .prepare('SELECT * FROM stock_movements WHERE company_id = ? AND product_id = ? AND warehouse_id = ? ORDER BY id')
      .all(COMPANY_ID, PRODUCT_ID, warehouseId) as {
      id: number
      movement_type: string
      quantity: number
      reference_type: string | null
      reference_id: string | null
    }[]
  }
  return sqlite
    .prepare('SELECT * FROM stock_movements WHERE company_id = ? AND product_id = ? ORDER BY id')
    .all(COMPANY_ID, PRODUCT_ID) as {
    id: number
    movement_type: string
    quantity: number
    warehouse_id: number
    reference_type: string | null
    reference_id: string | null
  }[]
}

describe('Stock workflow integration tests', () => {
  describe('Scenario 1: Inbound → Outbound → Transfer lifecycle', () => {
    it('inbound 100 → verify balance 100 → outbound 30 → verify balance 70 → transfer 20 to second warehouse → verify source=50, dest=20', async () => {
      const sqlite = createTestDb()
      const db = drizzle(sqlite, { schema })
      patchDbTransaction(db, sqlite)
      mockedGetDb.mockReturnValue(db)
      seedTestData(sqlite)

      try {
        // Step 1: Record inbound of 100 units at warehouse 1
        const inboundMovement = await recordInbound(COMPANY_ID, {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_1_ID,
          quantity: 100,
          unitCost: 10.5,
          notes: 'Initial stock'
        })

        expect(inboundMovement.movementType).toBe(MOVEMENT_TYPES.inbound)
        expect(inboundMovement.quantity).toBe(100)
        expect(inboundMovement.warehouseId).toBe(WAREHOUSE_1_ID)

        // Verify balance is 100
        const balanceAfterInbound = getStockQuantity(sqlite, WAREHOUSE_1_ID)
        expect(balanceAfterInbound).toBe(100)

        // Step 2: Record outbound of 30 units from warehouse 1
        const outboundMovement = await recordOutbound(COMPANY_ID, {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_1_ID,
          quantity: 30,
          notes: 'Order fulfillment'
        })

        expect(outboundMovement.movementType).toBe(MOVEMENT_TYPES.outbound)
        expect(outboundMovement.quantity).toBe(30)

        // Verify balance is 70
        const balanceAfterOutbound = getStockQuantity(sqlite, WAREHOUSE_1_ID)
        expect(balanceAfterOutbound).toBe(70)

        // Step 3: Transfer 20 units from warehouse 1 to warehouse 2
        const transfer = await recordTransfer(COMPANY_ID, {
          productId: PRODUCT_ID,
          sourceWarehouseId: WAREHOUSE_1_ID,
          destinationWarehouseId: WAREHOUSE_2_ID,
          quantity: 20,
          notes: 'Redistribution'
        })

        expect(transfer.source.movementType).toBe(MOVEMENT_TYPES.transfer_out)
        expect(transfer.source.quantity).toBe(20)
        expect(transfer.source.warehouseId).toBe(WAREHOUSE_1_ID)
        expect(transfer.destination.movementType).toBe(MOVEMENT_TYPES.transfer_in)
        expect(transfer.destination.quantity).toBe(20)
        expect(transfer.destination.warehouseId).toBe(WAREHOUSE_2_ID)

        // Verify source warehouse balance = 50
        const sourceBalance = getStockQuantity(sqlite, WAREHOUSE_1_ID)
        expect(sourceBalance).toBe(50)

        // Verify destination warehouse balance = 20
        const destBalance = getStockQuantity(sqlite, WAREHOUSE_2_ID)
        expect(destBalance).toBe(20)

        // Verify total movements created at warehouse 1
        const wh1Movements = getMovements(sqlite, WAREHOUSE_1_ID)
        expect(wh1Movements).toHaveLength(3) // inbound + outbound + transfer_out

        // Verify movements at warehouse 2
        const wh2Movements = getMovements(sqlite, WAREHOUSE_2_ID)
        expect(wh2Movements).toHaveLength(1) // transfer_in
      } finally {
        sqlite.close()
      }
    })

    it('getProductBalances returns correct balances for both warehouses after transfer', async () => {
      const sqlite = createTestDb()
      const db = drizzle(sqlite, { schema })
      patchDbTransaction(db, sqlite)
      mockedGetDb.mockReturnValue(db)
      seedTestData(sqlite)

      try {
        // Setup: inbound 100, transfer 40 to warehouse 2
        await recordInbound(COMPANY_ID, {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_1_ID,
          quantity: 100
        })

        await recordTransfer(COMPANY_ID, {
          productId: PRODUCT_ID,
          sourceWarehouseId: WAREHOUSE_1_ID,
          destinationWarehouseId: WAREHOUSE_2_ID,
          quantity: 40
        })

        // Query balances via service function
        const balances = await getProductBalances(COMPANY_ID, PRODUCT_ID)

        expect(balances).toHaveLength(2)

        const wh1Balance = balances.find((b) => b.warehouseId === WAREHOUSE_1_ID)
        const wh2Balance = balances.find((b) => b.warehouseId === WAREHOUSE_2_ID)

        expect(wh1Balance).toBeDefined()
        expect(wh1Balance?.quantity).toBe(60)
        expect(wh1Balance?.warehouseName).toBe('Warehouse A')
        expect(wh1Balance?.warehouseCode).toBe('WH-A')

        expect(wh2Balance).toBeDefined()
        expect(wh2Balance?.quantity).toBe(40)
        expect(wh2Balance?.warehouseName).toBe('Warehouse B')
        expect(wh2Balance?.warehouseCode).toBe('WH-B')
      } finally {
        sqlite.close()
      }
    })
  })

  describe('Scenario 2: Adjustment → verify movement + balance → verify audit log', () => {
    it('increase adjustment of 10 creates movement, updates balance, and logs audit', async () => {
      const sqlite = createTestDb()
      const db = drizzle(sqlite, { schema })
      patchDbTransaction(db, sqlite)
      mockedGetDb.mockReturnValue(db)
      mockedLogAudit.mockClear()
      seedTestData(sqlite)

      try {
        // First create an initial stock via inbound
        await recordInbound(COMPANY_ID, {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_1_ID,
          quantity: 50
        })

        // Record an increase adjustment of 10
        const adjustment = await createAdjustment(COMPANY_ID, {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_1_ID,
          adjustmentType: ADJUSTMENT_TYPES.increase,
          quantity: 10,
          reason: 'Found extra units during count',
          notes: 'Physical count correction',
          createdByUserId: 42
        })

        // Verify the adjustment record was created correctly
        expect(adjustment.adjustmentType).toBe(ADJUSTMENT_TYPES.increase)
        expect(adjustment.quantity).toBe(10)
        expect(adjustment.reason).toBe('Found extra units during count')
        expect(adjustment.createdByUserId).toBe(42)

        // Verify balance increased from 50 to 60
        const balance = getStockQuantity(sqlite, WAREHOUSE_1_ID)
        expect(balance).toBe(60)

        // Verify a corresponding movement with type "adjustment" was created
        const movements = getMovements(sqlite, WAREHOUSE_1_ID)
        const adjustmentMovement = movements.find((m) => m.movement_type === MOVEMENT_TYPES.adjustment)
        expect(adjustmentMovement).toBeDefined()
        expect(adjustmentMovement?.quantity).toBe(10)
        expect(adjustmentMovement?.reference_type).toBe('stock_adjustment')
        expect(adjustmentMovement?.reference_id).toBe(String(adjustment.id))

        // Verify audit log was called with correct parameters
        expect(mockedLogAudit).toHaveBeenCalledWith({
          companyId: COMPANY_ID,
          entityType: 'stock_adjustment',
          entityId: String(adjustment.id),
          action: 'create',
          userId: 42
        })
      } finally {
        sqlite.close()
      }
    })

    it('decrease adjustment subtracts from balance and creates movement', async () => {
      const sqlite = createTestDb()
      const db = drizzle(sqlite, { schema })
      patchDbTransaction(db, sqlite)
      mockedGetDb.mockReturnValue(db)
      mockedLogAudit.mockClear()
      seedTestData(sqlite)

      try {
        // Inbound 80 units
        await recordInbound(COMPANY_ID, {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_1_ID,
          quantity: 80
        })

        // Decrease adjustment of 15
        const adjustment = await createAdjustment(COMPANY_ID, {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_1_ID,
          adjustmentType: ADJUSTMENT_TYPES.decrease,
          quantity: 15,
          reason: 'Damaged goods',
          createdByUserId: 7
        })

        expect(adjustment.adjustmentType).toBe(ADJUSTMENT_TYPES.decrease)
        expect(adjustment.quantity).toBe(15)

        // Balance should be 80 - 15 = 65
        const balance = getStockQuantity(sqlite, WAREHOUSE_1_ID)
        expect(balance).toBe(65)

        // Verify audit log was called
        expect(mockedLogAudit).toHaveBeenCalledWith({
          companyId: COMPANY_ID,
          entityType: 'stock_adjustment',
          entityId: String(adjustment.id),
          action: 'create',
          userId: 7
        })
      } finally {
        sqlite.close()
      }
    })
  })

  describe('Scenario 3: Reconciliation after a sequence of movements', () => {
    it('reconcile returns isConsistent=true after inbound, outbound, and adjustment', async () => {
      const sqlite = createTestDb()
      const db = drizzle(sqlite, { schema })
      patchDbTransaction(db, sqlite)
      mockedGetDb.mockReturnValue(db)
      mockedLogAudit.mockClear()
      seedTestData(sqlite)

      try {
        // Execute a series of movements:
        // Inbound 200
        await recordInbound(COMPANY_ID, {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_1_ID,
          quantity: 200
        })

        // Outbound 50
        await recordOutbound(COMPANY_ID, {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_1_ID,
          quantity: 50
        })

        // Inbound 30 more
        await recordInbound(COMPANY_ID, {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_1_ID,
          quantity: 30
        })

        // Outbound 20
        await recordOutbound(COMPANY_ID, {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_1_ID,
          quantity: 20
        })

        // Increase adjustment 10
        await createAdjustment(COMPANY_ID, {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_1_ID,
          adjustmentType: ADJUSTMENT_TYPES.increase,
          quantity: 10,
          reason: 'Count correction',
          createdByUserId: 1
        })

        // Expected balance: 200 - 50 + 30 - 20 + 10 = 170
        const balance = getStockQuantity(sqlite, WAREHOUSE_1_ID)
        expect(balance).toBe(170)

        // Run reconciliation
        const result = await reconcile(COMPANY_ID, PRODUCT_ID, WAREHOUSE_1_ID)

        expect(result.isConsistent).toBe(true)
        expect(result.computedBalance).toBe(170)
        expect(result.materializedBalance).toBe(170)
        expect(result.discrepancy).toBe(0)
        expect(result.productId).toBe(PRODUCT_ID)
        expect(result.warehouseId).toBe(WAREHOUSE_1_ID)
      } finally {
        sqlite.close()
      }
    })

    it('reconcile after transfer shows consistency at both warehouses', async () => {
      const sqlite = createTestDb()
      const db = drizzle(sqlite, { schema })
      patchDbTransaction(db, sqlite)
      mockedGetDb.mockReturnValue(db)
      mockedLogAudit.mockClear()
      seedTestData(sqlite)

      try {
        // Inbound 300 at warehouse 1
        await recordInbound(COMPANY_ID, {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_1_ID,
          quantity: 300
        })

        // Transfer 120 to warehouse 2
        await recordTransfer(COMPANY_ID, {
          productId: PRODUCT_ID,
          sourceWarehouseId: WAREHOUSE_1_ID,
          destinationWarehouseId: WAREHOUSE_2_ID,
          quantity: 120
        })

        // Outbound 30 from warehouse 2
        await recordOutbound(COMPANY_ID, {
          productId: PRODUCT_ID,
          warehouseId: WAREHOUSE_2_ID,
          quantity: 30
        })

        // Reconcile warehouse 1: 300 - 120 = 180
        const result1 = await reconcile(COMPANY_ID, PRODUCT_ID, WAREHOUSE_1_ID)
        expect(result1.isConsistent).toBe(true)
        expect(result1.computedBalance).toBe(180)
        expect(result1.materializedBalance).toBe(180)

        // Reconcile warehouse 2: 120 - 30 = 90
        const result2 = await reconcile(COMPANY_ID, PRODUCT_ID, WAREHOUSE_2_ID)
        expect(result2.isConsistent).toBe(true)
        expect(result2.computedBalance).toBe(90)
        expect(result2.materializedBalance).toBe(90)
      } finally {
        sqlite.close()
      }
    })

    it('reconcile with no movements returns zero balances and isConsistent=true', async () => {
      const sqlite = createTestDb()
      const db = drizzle(sqlite, { schema })
      patchDbTransaction(db, sqlite)
      mockedGetDb.mockReturnValue(db)
      seedTestData(sqlite)

      try {
        const result = await reconcile(COMPANY_ID, PRODUCT_ID, WAREHOUSE_1_ID)

        expect(result.isConsistent).toBe(true)
        expect(result.computedBalance).toBe(0)
        expect(result.materializedBalance).toBe(0)
        expect(result.discrepancy).toBe(0)
      } finally {
        sqlite.close()
      }
    })
  })
})
