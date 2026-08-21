/**
 * Property-based tests for PurchaseOrderService and PaymentService.
 *
 * Tests cover:
 * - Property 5: Purchase order status transition validity
 * - Property 8: Receipt does not exceed ordered quantity
 * - Property 9: Receipt generates matching stock movements
 * - Property 10: Receipt status auto-transition
 * - Property 11: Payment cannot exceed document total
 * - Property 12: Payment status derivation
 *
 * **Validates: Requirements 8.6, 8.7, 9.1, 9.2, 9.3, 9.4, 9.5, 10.4, 10.6**
 */
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import { BusinessRuleError, ValidationError } from '../../api/errors'
import * as schema from '../../db/schema'
import { PURCHASE_ORDER_STATUSES, VALID_PURCHASE_ORDER_TRANSITIONS, validateTransition } from '../status-transitions'
import type { PurchaseOrderStatus } from '../status-transitions'

// Mock getDb to return our in-memory database
const mockGetDb = vi.fn()
vi.mock('../../server', () => ({
  getDb: (): unknown => mockGetDb()
}))

vi.mock('../audit-service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
}))

// Mock stock-service to avoid nested transactions and track calls
const mockRecordInbound = vi.fn().mockResolvedValue(undefined)
vi.mock('../stock-service', () => ({
  recordInbound: (...args: unknown[]): unknown => mockRecordInbound(...args)
}))

import * as paymentService from '../payment-service'
// Import services AFTER mock setup
import * as purchaseOrderService from '../purchase-order-service'

// ---------------------------------------------------------------------------
// Test DB setup
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
    CREATE UNIQUE INDEX suppliers_company_document_unique
      ON suppliers(company_id, document_number);
    CREATE INDEX suppliers_company_idx ON suppliers(company_id);

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

    CREATE TABLE payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX payment_methods_company_code_unique ON payment_methods(company_id, code);

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
    CREATE INDEX purchase_orders_company_idx ON purchase_orders(company_id);
    CREATE INDEX purchase_orders_supplier_idx ON purchase_orders(supplier_id);
    CREATE INDEX purchase_orders_status_idx ON purchase_orders(status);

    CREATE TABLE purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity REAL NOT NULL,
      received_quantity REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX purchase_order_items_purchase_order_idx ON purchase_order_items(purchase_order_id);
    CREATE INDEX purchase_order_items_product_idx ON purchase_order_items(product_id);

    CREATE TABLE purchase_order_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      transaction_reference TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX purchase_order_payments_purchase_order_idx ON purchase_order_payments(purchase_order_id);
    CREATE INDEX purchase_order_payments_payment_method_idx ON purchase_order_payments(payment_method_id);

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
      user_id INTEGER,
      details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX audit_logs_company_idx ON audit_logs(company_id);
    CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
  `)

  return sqlite
}

function seedTestData(sqlite: Database.Database): void {
  const now = '2024-01-01T00:00:00.000Z'
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (1, 'Company A', '11111111000100', 'active', '${now}', '${now}');

    INSERT INTO suppliers (id, company_id, name, document_number, status, created_at, updated_at)
    VALUES (1, 1, 'Supplier One', '99999999000199', 'active', '${now}', '${now}');

    INSERT INTO products (id, company_id, sku, name, track_inventory, status, created_at, updated_at)
    VALUES
      (1, 1, 'PROD-001', 'Product A', 1, 'active', '${now}', '${now}'),
      (2, 1, 'PROD-002', 'Product B', 1, 'active', '${now}', '${now}'),
      (3, 1, 'PROD-003', 'Product C', 1, 'active', '${now}', '${now}');

    INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
    VALUES (1, 1, 'Main Warehouse', 'WH-01', 'active', '${now}', '${now}');

    INSERT INTO payment_methods (id, company_id, name, code, status, created_at, updated_at)
    VALUES (1, 1, 'Bank Transfer', 'bank_transfer', 'active', '${now}', '${now}');

    INSERT INTO numbering_sequences (company_id, sequence_type, current_value, created_at, updated_at)
    VALUES (1, 'purchase_order', 0, '${now}', '${now}');
  `)
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

// ---------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------

/** All purchase order status values. */
const allStatuses = Object.values(PURCHASE_ORDER_STATUSES) as PurchaseOrderStatus[]

/** Arbitrary purchase order status. */
const statusArb = fc.constantFrom(...allStatuses)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PurchaseOrderService & PaymentService — Property Tests', () => {
  // -------------------------------------------------------------------------
  // Property 5: Purchase order status transition validity
  // -------------------------------------------------------------------------

  describe('Property 5: Purchase order status transition validity', () => {
    it('validateTransition returns valid:true IFF targetStatus is in VALID_PURCHASE_ORDER_TRANSITIONS[currentStatus]', () => {
      fc.assert(
        fc.property(statusArb, statusArb, (currentStatus, targetStatus) => {
          const result = validateTransition(currentStatus, targetStatus, VALID_PURCHASE_ORDER_TRANSITIONS)

          const allowedTargets = VALID_PURCHASE_ORDER_TRANSITIONS[currentStatus]
          const shouldBeValid = allowedTargets.includes(targetStatus)

          if (shouldBeValid) {
            expect(result).toEqual({ valid: true })
          } else {
            expect(result).toEqual({
              valid: false,
              currentStatus,
              allowed: allowedTargets
            })
          }
        }),
        { numRuns: 100 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 8: Receipt does not exceed ordered quantity
  // -------------------------------------------------------------------------

  describe('Property 8: Receipt does not exceed ordered quantity', () => {
    it('recording a receipt that would exceed ordered quantity is rejected', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 100 }),
          async (orderedQuantity, excessAmount) => {
            const sqlite = createTestDb()
            const db = drizzle(sqlite, { schema })
            patchDbTransaction(db, sqlite)
            mockGetDb.mockReturnValue(db)
            seedTestData(sqlite)

            const now = new Date().toISOString()

            // Insert PO in "sent" status
            const poResult = sqlite
              .prepare(
                `INSERT INTO purchase_orders (company_id, supplier_id, order_number, status, subtotal, discount_amount, tax_amount, total_amount, payment_status, created_at, updated_at)
                 VALUES (1, 1, 'PO-EXCESS', 'sent', 100, 0, 0, 100, 'pending', ?, ?)`
              )
              .run(now, now)
            const poId = Number(poResult.lastInsertRowid)

            // Insert a PO item
            const itemResult = sqlite
              .prepare(
                `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, received_quantity, unit_cost, discount_amount, tax_amount, total_amount, created_at)
                 VALUES (?, 1, ?, 0, 10, 0, 0, ?, ?)`
              )
              .run(poId, orderedQuantity, orderedQuantity * 10, now)
            const itemId = Number(itemResult.lastInsertRowid)

            // Attempt to receive more than ordered
            const overReceiveQty = orderedQuantity + excessAmount
            await expect(
              purchaseOrderService.recordReceipt(1, poId, {
                items: [
                  {
                    purchaseOrderItemId: itemId,
                    receivedQuantity: overReceiveQty,
                    warehouseId: 1
                  }
                ]
              })
            ).rejects.toThrow(ValidationError)

            sqlite.close()
          }
        ),
        { numRuns: 30 }
      )
    })

    it('recording a receipt up to ordered quantity succeeds', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 2, max: 100 }), async (orderedQuantity) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          patchDbTransaction(db, sqlite)
          mockGetDb.mockReturnValue(db)
          seedTestData(sqlite)

          const now = new Date().toISOString()

          // Insert PO in "sent" status
          const poResult = sqlite
            .prepare(
              `INSERT INTO purchase_orders (company_id, supplier_id, order_number, status, subtotal, discount_amount, tax_amount, total_amount, payment_status, created_at, updated_at)
                 VALUES (1, 1, 'PO-VALID', 'sent', 100, 0, 0, 100, 'pending', ?, ?)`
            )
            .run(now, now)
          const poId = Number(poResult.lastInsertRowid)

          // Insert a PO item
          const itemResult = sqlite
            .prepare(
              `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, received_quantity, unit_cost, discount_amount, tax_amount, total_amount, created_at)
                 VALUES (?, 1, ?, 0, 10, 0, 0, ?, ?)`
            )
            .run(poId, orderedQuantity, orderedQuantity * 10, now)
          const itemId = Number(itemResult.lastInsertRowid)

          // Receive a valid partial amount
          const receiveQty = Math.max(1, Math.floor(orderedQuantity / 2))
          mockRecordInbound.mockClear()

          const result = await purchaseOrderService.recordReceipt(1, poId, {
            items: [
              {
                purchaseOrderItemId: itemId,
                receivedQuantity: receiveQty,
                warehouseId: 1
              }
            ]
          })

          // Verify receipt recorded correctly
          const item = result.items.find((i) => i.id === itemId)
          expect(item?.receivedQuantity).toBe(receiveQty)
          expect(item?.receivedQuantity).toBeLessThanOrEqual(orderedQuantity)

          sqlite.close()
        }),
        { numRuns: 30 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 9: Receipt generates matching stock movements
  // -------------------------------------------------------------------------

  describe('Property 9: Receipt generates matching stock movements', () => {
    it('for each receipt with K items, exactly K inbound stock movements are generated', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 3 }), async (itemCount) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          patchDbTransaction(db, sqlite)
          mockGetDb.mockReturnValue(db)
          seedTestData(sqlite)
          mockRecordInbound.mockClear()

          const now = new Date().toISOString()
          const orderedQty = 50

          // Create PO in "sent" status
          const poResult = sqlite
            .prepare(
              `INSERT INTO purchase_orders (company_id, supplier_id, order_number, status, subtotal, discount_amount, tax_amount, total_amount, payment_status, created_at, updated_at)
                 VALUES (1, 1, 'PO-MOVEMENTS', 'sent', 500, 0, 0, 500, 'pending', ?, ?)`
            )
            .run(now, now)
          const poId = Number(poResult.lastInsertRowid)

          // Create K items on this PO (using distinct products)
          const productIds = [1, 2, 3]
          const itemIds: number[] = []
          for (let i = 0; i < itemCount; i++) {
            const itemResult = sqlite
              .prepare(
                `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, received_quantity, unit_cost, discount_amount, tax_amount, total_amount, created_at)
                   VALUES (?, ?, ?, 0, 10, 0, 0, ?, ?)`
              )
              .run(poId, productIds[i], orderedQty, orderedQty * 10, now)
            itemIds.push(Number(itemResult.lastInsertRowid))
          }

          // Record receipt for all items
          const receiptItems = itemIds.map((id) => ({
            purchaseOrderItemId: id,
            receivedQuantity: 5,
            warehouseId: 1
          }))

          await purchaseOrderService.recordReceipt(1, poId, { items: receiptItems })

          // recordInbound should have been called exactly K times (once per item)
          expect(mockRecordInbound).toHaveBeenCalledTimes(itemCount)

          // Verify each call references the correct PO
          for (let i = 0; i < itemCount; i++) {
            expect(mockRecordInbound.mock.calls[i][1]).toMatchObject({
              referenceType: 'purchase_order',
              referenceId: String(poId)
            })
          }

          sqlite.close()
        }),
        { numRuns: 20 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 10: Receipt status auto-transition
  // -------------------------------------------------------------------------

  describe('Property 10: Receipt status auto-transition', () => {
    it('if all items fully received → status is "received"; partial → "partially_received"', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 3 }), fc.boolean(), async (itemCount, receiveAll) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          patchDbTransaction(db, sqlite)
          mockGetDb.mockReturnValue(db)
          seedTestData(sqlite)
          mockRecordInbound.mockClear()

          const now = new Date().toISOString()
          const orderedQty = 10

          // Create PO in "sent" status
          const poResult = sqlite
            .prepare(
              `INSERT INTO purchase_orders (company_id, supplier_id, order_number, status, subtotal, discount_amount, tax_amount, total_amount, payment_status, created_at, updated_at)
                 VALUES (1, 1, 'PO-STATUS', 'sent', 100, 0, 0, 100, 'pending', ?, ?)`
            )
            .run(now, now)
          const poId = Number(poResult.lastInsertRowid)

          // Create items
          const productIds = [1, 2, 3]
          const itemIds: number[] = []
          for (let i = 0; i < itemCount; i++) {
            const itemResult = sqlite
              .prepare(
                `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, received_quantity, unit_cost, discount_amount, tax_amount, total_amount, created_at)
                   VALUES (?, ?, ?, 0, 10, 0, 0, ?, ?)`
              )
              .run(poId, productIds[i], orderedQty, orderedQty * 10, now)
            itemIds.push(Number(itemResult.lastInsertRowid))
          }

          // Build receipt: if receiveAll → fully received; else → only first item partially
          const receiptItems = receiveAll
            ? itemIds.map((id) => ({
                purchaseOrderItemId: id,
                receivedQuantity: orderedQty,
                warehouseId: 1
              }))
            : [
                {
                  purchaseOrderItemId: itemIds[0],
                  receivedQuantity: Math.max(1, Math.floor(orderedQty / 2)),
                  warehouseId: 1
                }
              ]

          const result = await purchaseOrderService.recordReceipt(1, poId, {
            items: receiptItems
          })

          if (receiveAll) {
            expect(result.status).toBe('received')
          } else {
            expect(result.status).toBe('partially_received')
          }

          sqlite.close()
        }),
        { numRuns: 30 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 11: Payment cannot exceed document total
  // -------------------------------------------------------------------------

  describe('Property 11: Payment cannot exceed document total', () => {
    it('a payment that would cause total paid to exceed document total throws BusinessRuleError', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 10, max: 1000, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.01, max: 1, noNaN: true, noDefaultInfinity: true }),
          async (documentTotal, excessFraction) => {
            const roundedTotal = Math.round(documentTotal * 100) / 100
            if (roundedTotal < 1) return // skip degenerate cases

            const sqlite = createTestDb()
            const db = drizzle(sqlite, { schema })
            patchDbTransaction(db, sqlite)
            mockGetDb.mockReturnValue(db)
            seedTestData(sqlite)

            const now = new Date().toISOString()

            // Create a PO in "sent" status with the given total
            sqlite
              .prepare(
                `INSERT INTO purchase_orders (company_id, supplier_id, order_number, status, subtotal, discount_amount, tax_amount, total_amount, payment_status, created_at, updated_at)
                 VALUES (1, 1, 'PO-PAY', 'sent', ?, 0, 0, ?, 'pending', ?, ?)`
              )
              .run(roundedTotal, roundedTotal, now, now)

            // Get the ID
            const po = sqlite.prepare(`SELECT id FROM purchase_orders WHERE order_number = 'PO-PAY'`).get() as {
              id: number
            }

            // Attempt a payment that exceeds the document total
            const excessAmount = Math.round((roundedTotal + roundedTotal * excessFraction) * 100) / 100

            await expect(
              paymentService.registerForPurchaseOrder(1, po.id, {
                paymentMethodId: 1,
                amount: excessAmount,
                paidAt: now
              })
            ).rejects.toThrow(BusinessRuleError)

            sqlite.close()
          }
        ),
        { numRuns: 30 }
      )
    })

    it('a payment within remaining balance succeeds', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 10, max: 1000, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true }),
          async (documentTotal, fraction) => {
            const roundedTotal = Math.round(documentTotal * 100) / 100
            if (roundedTotal < 1) return // skip degenerate cases

            const sqlite = createTestDb()
            const db = drizzle(sqlite, { schema })
            patchDbTransaction(db, sqlite)
            mockGetDb.mockReturnValue(db)
            seedTestData(sqlite)

            const now = new Date().toISOString()

            // Create a PO in "sent" status
            sqlite
              .prepare(
                `INSERT INTO purchase_orders (company_id, supplier_id, order_number, status, subtotal, discount_amount, tax_amount, total_amount, payment_status, created_at, updated_at)
                 VALUES (1, 1, 'PO-PAY-OK', 'sent', ?, 0, 0, ?, 'pending', ?, ?)`
              )
              .run(roundedTotal, roundedTotal, now, now)

            const po = sqlite.prepare(`SELECT id FROM purchase_orders WHERE order_number = 'PO-PAY-OK'`).get() as {
              id: number
            }

            // Pay a fraction of the total
            const paymentAmount = Math.round(roundedTotal * fraction * 100) / 100
            if (paymentAmount <= 0) {
              sqlite.close()
              return
            }

            const result = await paymentService.registerForPurchaseOrder(1, po.id, {
              paymentMethodId: 1,
              amount: paymentAmount,
              paidAt: now
            })

            expect(result.amount).toBe(paymentAmount)

            sqlite.close()
          }
        ),
        { numRuns: 30 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 12: Payment status derivation
  // -------------------------------------------------------------------------

  describe('Property 12: Payment status derivation', () => {
    it('totalPaid === 0 → unpaid; 0 < totalPaid < total → partially_paid; totalPaid >= total → paid', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 100, max: 10000, noNaN: true, noDefaultInfinity: true }),
          fc.constantFrom('none', 'partial', 'full'),
          async (documentTotal, paymentScenario) => {
            const roundedTotal = Math.round(documentTotal * 100) / 100
            if (roundedTotal < 2) return // need enough room to divide

            const sqlite = createTestDb()
            const db = drizzle(sqlite, { schema })
            patchDbTransaction(db, sqlite)
            mockGetDb.mockReturnValue(db)
            seedTestData(sqlite)

            const now = new Date().toISOString()

            sqlite
              .prepare(
                `INSERT INTO purchase_orders (company_id, supplier_id, order_number, status, subtotal, discount_amount, tax_amount, total_amount, payment_status, created_at, updated_at)
                 VALUES (1, 1, 'PO-STATUS-PAY', 'sent', ?, 0, 0, ?, 'pending', ?, ?)`
              )
              .run(roundedTotal, roundedTotal, now, now)

            const po = sqlite.prepare(`SELECT id FROM purchase_orders WHERE order_number = 'PO-STATUS-PAY'`).get() as {
              id: number
            }

            if (paymentScenario === 'none') {
              // No payment — query status should be unpaid
              const summary = await paymentService.listForPurchaseOrder(1, po.id)
              expect(summary.paymentStatus).toBe('unpaid')
            } else if (paymentScenario === 'partial') {
              // Partial payment — half the total
              const partialAmount = Math.round((roundedTotal / 2) * 100) / 100
              await paymentService.registerForPurchaseOrder(1, po.id, {
                paymentMethodId: 1,
                amount: partialAmount,
                paidAt: now
              })
              const summary = await paymentService.listForPurchaseOrder(1, po.id)
              expect(summary.paymentStatus).toBe('partially_paid')
            } else {
              // Full payment — exact total
              await paymentService.registerForPurchaseOrder(1, po.id, {
                paymentMethodId: 1,
                amount: roundedTotal,
                paidAt: now
              })
              const summary = await paymentService.listForPurchaseOrder(1, po.id)
              expect(summary.paymentStatus).toBe('paid')
            }

            sqlite.close()
          }
        ),
        { numRuns: 30 }
      )
    })
  })
})
