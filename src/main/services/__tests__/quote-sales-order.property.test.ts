/**
 * Property-based tests for Quote and Sales Order logic.
 *
 * Tests cover:
 * - Property 1: Line total determinism — computeSalesLineTotal matches formula for all valid inputs
 * - Property 2: Document total equals sum of line totals — computeDocumentTotals identity
 * - Property 3: Quote status transition validity — validateTransition + VALID_QUOTE_TRANSITIONS
 * - Property 4: Sales order status transition validity — validateTransition + VALID_SALES_ORDER_TRANSITIONS
 * - Property 6: Quote-to-order conversion preserves items — fields copied faithfully
 * - Property 7: Quote-to-order conversion atomicity — rollback on failure leaves state unchanged
 * - Property 16: Editable only in draft/allowed status — update guards on quotes and sales orders
 *
 * **Validates: Requirements 3.3, 3.4, 3.6, 4.1, 4.2, 5.1, 5.3, 5.5, 5.6, 6.3, 6.4, 6.6, 7.1, 7.2, 11.1, 11.3**
 */
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BusinessRuleError } from '../../api/errors'
import * as schema from '../../db/schema'
import { computeDocumentTotals, computeSalesLineTotal, roundHalfUp } from '../commercial-utils'
import {
  validateTransition,
  VALID_QUOTE_TRANSITIONS,
  VALID_SALES_ORDER_TRANSITIONS,
  QUOTE_STATUSES,
  SALES_ORDER_STATUSES
} from '../status-transitions'
import type { QuoteStatus, SalesOrderStatus } from '../status-transitions'

// Mock getDb to return our in-memory database
const mockGetDb = vi.fn()
vi.mock('../../server', () => ({
  getDb: (): unknown => mockGetDb()
}))

// Mock audit service to avoid side-effects
vi.mock('../audit-service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
}))

// Import services AFTER mock setup
import * as quoteService from '../quote-service'
import * as salesOrderService from '../sales-order-service'

// ---------------------------------------------------------------------------
// Transaction patch for tests
// ---------------------------------------------------------------------------

/**
 * Patches db.transaction to support async callbacks with better-sqlite3.
 *
 * better-sqlite3's native transaction() rejects async functions, but Drizzle
 * services use `db.transaction(async (tx) => {...})`. This patch manually
 * manages BEGIN/COMMIT/ROLLBACK and awaits the async callback.
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

// ---------------------------------------------------------------------------
// Test DB setup (for properties 6, 7, 16 that need full DB)
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
    CREATE UNIQUE INDEX customers_company_document_unique
      ON customers(company_id, document_number);
    CREATE INDEX customers_company_idx ON customers(company_id);

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      category_id INTEGER,
      unit_id INTEGER,
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

    CREATE TABLE quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      quote_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      valid_until TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      notes TEXT,
      cancelled_at TEXT,
      converted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX quotes_company_quote_number_unique
      ON quotes(company_id, quote_number);
    CREATE INDEX quotes_company_idx ON quotes(company_id);
    CREATE INDEX quotes_customer_idx ON quotes(customer_id);
    CREATE INDEX quotes_status_idx ON quotes(status);

    CREATE TABLE quote_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX quote_items_quote_idx ON quote_items(quote_id);
    CREATE INDEX quote_items_product_idx ON quote_items(product_id);

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
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      confirmed_at TEXT,
      fulfilled_at TEXT,
      cancelled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX orders_company_order_number_unique
      ON orders(company_id, order_number);
    CREATE INDEX orders_company_idx ON orders(company_id);
    CREATE INDEX orders_status_idx ON orders(status);

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
    CREATE INDEX order_items_order_idx ON order_items(order_id);
    CREATE INDEX order_items_product_idx ON order_items(product_id);

    CREATE TABLE order_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      payment_method_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      transaction_reference TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX order_payments_order_idx ON order_payments(order_id);

    CREATE TABLE quote_order_conversions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      converted_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX quote_order_conversions_quote_unique ON quote_order_conversions(quote_id);
    CREATE UNIQUE INDEX quote_order_conversions_order_unique ON quote_order_conversions(order_id);

    CREATE TABLE numbering_sequences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      sequence_type TEXT NOT NULL,
      current_value INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX numbering_sequences_company_type_unique
      ON numbering_sequences(company_id, sequence_type);

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

  // Seed company, customer, and products
  const now = '2024-01-01T00:00:00.000Z'
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (1, 'Company A', '11111111000100', 'active', '${now}', '${now}');

    INSERT INTO customers (id, company_id, name, document_number, customer_type, status, created_at, updated_at)
    VALUES (1, 1, 'Test Customer', '12345678901', 'business', 'active', '${now}', '${now}');

    INSERT INTO products (id, company_id, sku, name, sale_price, status, created_at, updated_at)
    VALUES (1, 1, 'PROD-001', 'Product A', 100.00, 'active', '${now}', '${now}');

    INSERT INTO products (id, company_id, sku, name, sale_price, status, created_at, updated_at)
    VALUES (2, 1, 'PROD-002', 'Product B', 50.00, 'active', '${now}', '${now}');

    INSERT INTO products (id, company_id, sku, name, sale_price, status, created_at, updated_at)
    VALUES (3, 1, 'PROD-003', 'Product C', 25.50, 'active', '${now}', '${now}');

    INSERT INTO numbering_sequences (company_id, sequence_type, current_value, created_at, updated_at)
    VALUES (1, 'quote', 0, '${now}', '${now}');

    INSERT INTO numbering_sequences (company_id, sequence_type, current_value, created_at, updated_at)
    VALUES (1, 'sales_order', 0, '${now}', '${now}');
  `)

  return sqlite
}

// ---------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------

/** Positive quantity between 0.01 and 9999 (2 decimals). */
const quantityArb = fc
  .double({ min: 0.01, max: 9999, noNaN: true })
  .map((v) => Math.round(v * 100) / 100)
  .filter((v) => v > 0)

/** Positive unit price between 0.01 and 99999 (2 decimals). */
const unitPriceArb = fc
  .double({ min: 0.01, max: 99999, noNaN: true })
  .map((v) => Math.round(v * 100) / 100)
  .filter((v) => v > 0)

/** Non-negative discount amount between 0 and 9999 (2 decimals). */
const discountAmountArb = fc.double({ min: 0, max: 9999, noNaN: true }).map((v) => Math.round(v * 100) / 100)

/** Non-negative tax amount between 0 and 9999 (2 decimals). */
const taxAmountArb = fc.double({ min: 0, max: 9999, noNaN: true }).map((v) => Math.round(v * 100) / 100)

/** Generates a single document item record. */
const documentItemArb = fc.record({
  quantity: quantityArb,
  unitPrice: unitPriceArb,
  discountAmount: discountAmountArb,
  taxAmount: taxAmountArb
})

/** Array of 1-10 document items. */
const documentItemsArb = fc.array(documentItemArb, { minLength: 1, maxLength: 10 })

/** Quote status arbitrary. */
const quoteStatusArb = fc.constantFrom(...Object.values(QUOTE_STATUSES)) as fc.Arbitrary<QuoteStatus>

/** Sales order status arbitrary. */
const salesOrderStatusArb = fc.constantFrom(...Object.values(SALES_ORDER_STATUSES)) as fc.Arbitrary<SalesOrderStatus>

// ---------------------------------------------------------------------------
// Property Tests — Pure utility functions (no DB needed)
// ---------------------------------------------------------------------------

describe('Quote & Sales Order — Property Tests', () => {
  // -------------------------------------------------------------------------
  // Property 1: Line total determinism
  // -------------------------------------------------------------------------

  describe('Property 1: Line total determinism', () => {
    /**
     * **Validates: Requirements 3.3, 6.3, 11.1**
     *
     * For any item with quantity > 0, unitPrice > 0, discountAmount >= 0,
     * computeSalesLineTotal SHALL equal roundHalfUp(qty * unitPrice - discountAmount, 2).
     */
    it('computeSalesLineTotal equals roundHalfUp(qty * unitPrice - discountAmount, 2) for all valid inputs', () => {
      fc.assert(
        fc.property(quantityArb, unitPriceArb, discountAmountArb, (qty, price, discount) => {
          const result = computeSalesLineTotal(qty, price, discount)
          const expected = roundHalfUp(qty * price - discount, 2)

          expect(result).toBe(expected)
        }),
        { numRuns: 200 }
      )
    })

    it('line total is deterministic — same inputs always produce same output', () => {
      fc.assert(
        fc.property(quantityArb, unitPriceArb, discountAmountArb, (qty, price, discount) => {
          const result1 = computeSalesLineTotal(qty, price, discount)
          const result2 = computeSalesLineTotal(qty, price, discount)

          expect(result1).toBe(result2)
        }),
        { numRuns: 100 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 2: Document total equals sum of line totals
  // -------------------------------------------------------------------------

  describe('Property 2: Document total equals sum of line totals', () => {
    /**
     * **Validates: Requirements 3.4, 6.4, 11.3**
     *
     * For any document with items, totalAmount SHALL equal
     * subtotal - discountAmount + taxAmount (all rounded to 2dp).
     */
    it('totalAmount = subtotal - discountAmount + taxAmount (all rounded half-up)', () => {
      fc.assert(
        fc.property(documentItemsArb, (items) => {
          const result = computeDocumentTotals(items)

          // Verify the identity
          const expectedTotal = roundHalfUp(result.subtotal - result.discountAmount + result.taxAmount, 2)
          expect(result.totalAmount).toBe(expectedTotal)
        }),
        { numRuns: 200 }
      )
    })

    it('subtotal equals sum of (qty * unitPrice) rounded to 2dp', () => {
      fc.assert(
        fc.property(documentItemsArb, (items) => {
          const result = computeDocumentTotals(items)

          const expectedSubtotal = roundHalfUp(
            items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
            2
          )
          expect(result.subtotal).toBe(expectedSubtotal)
        }),
        { numRuns: 200 }
      )
    })

    it('discountAmount equals sum of item discounts rounded to 2dp', () => {
      fc.assert(
        fc.property(documentItemsArb, (items) => {
          const result = computeDocumentTotals(items)

          const expectedDiscount = roundHalfUp(
            items.reduce((sum, item) => sum + item.discountAmount, 0),
            2
          )
          expect(result.discountAmount).toBe(expectedDiscount)
        }),
        { numRuns: 200 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 3: Quote status transition validity
  // -------------------------------------------------------------------------

  describe('Property 3: Quote status transition validity', () => {
    /**
     * **Validates: Requirements 4.1, 4.2**
     *
     * For every pair (currentStatus, targetStatus), validateTransition returns
     * valid:true IFF targetStatus is in VALID_QUOTE_TRANSITIONS[currentStatus].
     */
    it('valid transitions match the transition map', () => {
      fc.assert(
        fc.property(quoteStatusArb, quoteStatusArb, (current, target) => {
          const result = validateTransition(current, target, VALID_QUOTE_TRANSITIONS)
          const allowed = VALID_QUOTE_TRANSITIONS[current]
          const shouldBeValid = allowed.includes(target)

          if (shouldBeValid) {
            expect(result.valid).toBe(true)
          } else {
            expect(result.valid).toBe(false)
            if (!result.valid) {
              expect(result.allowed).toEqual(allowed)
            }
          }
        }),
        { numRuns: 100 }
      )
    })

    it('terminal statuses have no valid transitions', () => {
      const terminalStatuses: QuoteStatus[] = ['rejected', 'converted', 'cancelled']

      fc.assert(
        fc.property(
          fc.constantFrom(...terminalStatuses) as fc.Arbitrary<QuoteStatus>,
          quoteStatusArb,
          (current, target) => {
            const result = validateTransition(current, target, VALID_QUOTE_TRANSITIONS)
            expect(result.valid).toBe(false)
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 4: Sales order status transition validity
  // -------------------------------------------------------------------------

  describe('Property 4: Sales order status transition validity', () => {
    /**
     * **Validates: Requirements 7.1, 7.2**
     *
     * For every pair (currentStatus, targetStatus), validateTransition returns
     * valid:true IFF targetStatus is in VALID_SALES_ORDER_TRANSITIONS[currentStatus].
     */
    it('valid transitions match the transition map', () => {
      fc.assert(
        fc.property(salesOrderStatusArb, salesOrderStatusArb, (current, target) => {
          const result = validateTransition(current, target, VALID_SALES_ORDER_TRANSITIONS)
          const allowed = VALID_SALES_ORDER_TRANSITIONS[current]
          const shouldBeValid = allowed.includes(target)

          if (shouldBeValid) {
            expect(result.valid).toBe(true)
          } else {
            expect(result.valid).toBe(false)
            if (!result.valid) {
              expect(result.allowed).toEqual(allowed)
            }
          }
        }),
        { numRuns: 100 }
      )
    })

    it('terminal statuses have no valid transitions', () => {
      const terminalStatuses: SalesOrderStatus[] = ['fulfilled', 'cancelled']

      fc.assert(
        fc.property(
          fc.constantFrom(...terminalStatuses) as fc.Arbitrary<SalesOrderStatus>,
          salesOrderStatusArb,
          (current, target) => {
            const result = validateTransition(current, target, VALID_SALES_ORDER_TRANSITIONS)
            expect(result.valid).toBe(false)
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Properties 6, 7, 16: DB-dependent tests
  // -------------------------------------------------------------------------

  describe('DB-dependent properties', () => {
    let sqlite: Database.Database
    let db: BetterSQLite3Database<typeof schema>

    beforeEach(() => {
      sqlite = createTestDb()
      const rawDb = drizzle(sqlite, { schema })
      db = patchTransactionForTests(rawDb, sqlite)
      mockGetDb.mockReturnValue(db)
    })

    afterEach(() => {
      sqlite.close()
      vi.clearAllMocks()
    })

    // -----------------------------------------------------------------------
    // Property 6: Quote-to-order conversion preserves items
    // -----------------------------------------------------------------------

    describe('Property 6: Quote-to-order conversion preserves items', () => {
      /**
       * **Validates: Requirements 5.1, 5.3**
       *
       * After conversion, the sales order items should have the same productId,
       * quantity, unitPrice, discountAmount, totalAmount as the original quote items.
       */
      it('converted sales order preserves all item fields from the quote', async () => {
        // Generate item sets with varying quantities/prices, 1-3 items using product IDs 1-3
        const itemSetArb = fc
          .array(
            fc.record({
              productId: fc.constantFrom(1, 2, 3),
              quantity: quantityArb,
              unitPrice: unitPriceArb,
              discountAmount: discountAmountArb
            }),
            { minLength: 1, maxLength: 3 }
          )
          .map((items) => {
            // Ensure unique product IDs (service validates products exist)
            const seen = new Set<number>()
            return items.filter((item) => {
              if (seen.has(item.productId)) return false
              seen.add(item.productId)
              return true
            })
          })
          .filter((items) => items.length > 0)

        await fc.assert(
          fc.asyncProperty(itemSetArb, async (items) => {
            // Create a quote with the generated items
            const quote = await quoteService.create(1, {
              customerId: 1,
              items
            })

            // Transition to "sent" then "accepted"
            await quoteService.transitionStatus(1, quote.id, 'sent')
            await quoteService.transitionStatus(1, quote.id, 'accepted')

            // Convert to order
            const { salesOrder } = await quoteService.convertToOrder(1, quote.id)

            // Verify item count matches
            expect(salesOrder.items).toHaveLength(quote.items.length)

            // Verify each item's fields are preserved
            for (const quoteItem of quote.items) {
              const orderItem = salesOrder.items.find((oi) => oi.productId === quoteItem.productId)
              if (!orderItem) throw new Error(`Expected order item for productId ${quoteItem.productId}`)
              expect(orderItem.quantity).toBe(quoteItem.quantity)
              expect(orderItem.unitPrice).toBe(quoteItem.unitPrice)
              expect(orderItem.discountAmount).toBe(quoteItem.discountAmount)
              expect(orderItem.totalAmount).toBe(quoteItem.totalAmount)
            }

            // Verify totals match
            expect(salesOrder.totalAmount).toBe(quote.totalAmount)
            expect(salesOrder.subtotal).toBe(quote.subtotal)
            expect(salesOrder.discountAmount).toBe(quote.discountAmount)

            // Clean up for next iteration
            sqlite.exec('DELETE FROM quote_order_conversions')
            sqlite.exec('DELETE FROM order_items')
            sqlite.exec('DELETE FROM orders')
            sqlite.exec('DELETE FROM quote_items')
            sqlite.exec('DELETE FROM quotes')
            // Reset numbering sequences
            sqlite.exec('UPDATE numbering_sequences SET current_value = 0')
          }),
          { numRuns: 30 }
        )
      })
    })

    // -----------------------------------------------------------------------
    // Property 7: Quote-to-order conversion atomicity
    // -----------------------------------------------------------------------

    describe('Property 7: Quote-to-order conversion atomicity', () => {
      /**
       * **Validates: Requirements 5.5, 5.6**
       *
       * If conversion is attempted on a non-accepted quote, the quote status
       * remains unchanged and no sales order is created.
       */
      it('conversion fails for non-accepted quote and leaves state unchanged', async () => {
        const nonAcceptedStatuses: QuoteStatus[] = ['draft', 'sent', 'rejected', 'converted', 'cancelled']

        await fc.assert(
          fc.asyncProperty(fc.constantFrom(...nonAcceptedStatuses) as fc.Arbitrary<QuoteStatus>, async (status) => {
            const now = '2024-06-01T00:00:00.000Z'

            // Insert a quote directly in the target status
            sqlite.exec(`
                INSERT INTO quotes (company_id, customer_id, quote_number, status, subtotal, discount_amount, tax_amount, total_amount, created_at, updated_at)
                VALUES (1, 1, 'Q-TEST-${Date.now()}-${Math.random()}', '${status}', 100, 0, 0, 100, '${now}', '${now}')
              `)
            const quoteRow = sqlite.prepare('SELECT id, status FROM quotes ORDER BY id DESC LIMIT 1').get() as {
              id: number
              status: string
            }

            // Insert a quote item so the quote is "valid"
            sqlite.exec(`
                INSERT INTO quote_items (quote_id, product_id, quantity, unit_price, discount_amount, tax_amount, total_amount, created_at)
                VALUES (${quoteRow.id}, 1, 2, 50, 0, 0, 100, '${now}')
              `)

            // Count orders before
            const ordersBefore = (sqlite.prepare('SELECT COUNT(*) as cnt FROM orders').get() as { cnt: number }).cnt

            // Attempt conversion — should throw
            await expect(quoteService.convertToOrder(1, quoteRow.id)).rejects.toThrow(BusinessRuleError)

            // Quote status should remain unchanged
            const quoteAfter = sqlite.prepare('SELECT status FROM quotes WHERE id = ?').get(quoteRow.id) as {
              status: string
            }
            expect(quoteAfter.status).toBe(status)

            // No new orders should exist
            const ordersAfter = (sqlite.prepare('SELECT COUNT(*) as cnt FROM orders').get() as { cnt: number }).cnt
            expect(ordersAfter).toBe(ordersBefore)

            // No conversion records should exist for this quote
            const conversions = (
              sqlite
                .prepare('SELECT COUNT(*) as cnt FROM quote_order_conversions WHERE quote_id = ?')
                .get(quoteRow.id) as { cnt: number }
            ).cnt
            expect(conversions).toBe(0)

            // Clean up
            sqlite.exec('DELETE FROM quote_items')
            sqlite.exec('DELETE FROM quotes')
          }),
          { numRuns: 20 }
        )
      })
    })

    // -----------------------------------------------------------------------
    // Property 16: Editable only in draft/allowed status
    // -----------------------------------------------------------------------

    describe('Property 16: Editable only in draft/allowed status', () => {
      /**
       * **Validates: Requirements 3.6**
       *
       * Attempting to update a quote NOT in draft/sent status should throw
       * BusinessRuleError.
       */
      it('quote update rejects when status is not draft or sent', async () => {
        const nonEditableStatuses: QuoteStatus[] = ['accepted', 'rejected', 'converted', 'cancelled']

        await fc.assert(
          fc.asyncProperty(fc.constantFrom(...nonEditableStatuses) as fc.Arbitrary<QuoteStatus>, async (status) => {
            const now = '2024-06-01T00:00:00.000Z'

            sqlite.exec(`
                INSERT INTO quotes (company_id, customer_id, quote_number, status, subtotal, discount_amount, tax_amount, total_amount, created_at, updated_at)
                VALUES (1, 1, 'Q-EDIT-${Date.now()}-${Math.random()}', '${status}', 100, 0, 0, 100, '${now}', '${now}')
              `)
            const quoteRow = sqlite.prepare('SELECT id FROM quotes ORDER BY id DESC LIMIT 1').get() as { id: number }

            // Attempt to update — should throw BusinessRuleError
            await expect(quoteService.update(1, quoteRow.id, { notes: 'attempt edit' })).rejects.toThrow(
              BusinessRuleError
            )

            // Verify notes remain unchanged
            const quoteAfter = sqlite.prepare('SELECT notes FROM quotes WHERE id = ?').get(quoteRow.id) as {
              notes: string | null
            }
            expect(quoteAfter.notes).toBeNull()

            // Clean up
            sqlite.exec('DELETE FROM quotes')
          }),
          { numRuns: 20 }
        )
      })

      /**
       * **Validates: Requirements 3.6**
       *
       * Updating a quote in draft or sent status should succeed.
       */
      it('quote update succeeds when status is draft or sent', async () => {
        const editableStatuses: QuoteStatus[] = ['draft', 'sent']

        await fc.assert(
          fc.asyncProperty(fc.constantFrom(...editableStatuses) as fc.Arbitrary<QuoteStatus>, async (status) => {
            const now = '2024-06-01T00:00:00.000Z'

            sqlite.exec(`
                INSERT INTO quotes (company_id, customer_id, quote_number, status, subtotal, discount_amount, tax_amount, total_amount, created_at, updated_at)
                VALUES (1, 1, 'Q-OK-${Date.now()}-${Math.random()}', '${status}', 100, 0, 0, 100, '${now}', '${now}')
              `)
            const quoteRow = sqlite.prepare('SELECT id FROM quotes ORDER BY id DESC LIMIT 1').get() as { id: number }

            // Add a quote item so detail works
            sqlite.exec(`
                INSERT INTO quote_items (quote_id, product_id, quantity, unit_price, discount_amount, tax_amount, total_amount, created_at)
                VALUES (${quoteRow.id}, 1, 1, 100, 0, 0, 100, '${now}')
              `)

            // Update should succeed
            const updated = await quoteService.update(1, quoteRow.id, { notes: 'updated note' })
            expect(updated.notes).toBe('updated note')

            // Clean up
            sqlite.exec('DELETE FROM quote_items')
            sqlite.exec('DELETE FROM quotes')
          }),
          { numRuns: 10 }
        )
      })

      /**
       * **Validates: Requirements 6.6**
       *
       * Attempting to update a sales order NOT in draft status should throw
       * BusinessRuleError.
       */
      it('sales order update rejects when status is not draft', async () => {
        const nonEditableStatuses: SalesOrderStatus[] = ['confirmed', 'partially_fulfilled', 'fulfilled', 'cancelled']

        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom(...nonEditableStatuses) as fc.Arbitrary<SalesOrderStatus>,
            async (status) => {
              const now = '2024-06-01T00:00:00.000Z'

              sqlite.exec(`
                INSERT INTO orders (company_id, customer_id, order_number, order_type, status, subtotal, discount_amount, tax_amount, total_amount, payment_status, created_at, updated_at)
                VALUES (1, 1, 'SO-EDIT-${Date.now()}-${Math.random()}', 'sale', '${status}', 100, 0, 0, 100, 'unpaid', '${now}', '${now}')
              `)
              const orderRow = sqlite.prepare('SELECT id FROM orders ORDER BY id DESC LIMIT 1').get() as { id: number }

              // Attempt to update — should throw BusinessRuleError
              await expect(salesOrderService.update(1, orderRow.id, { customerId: 1 })).rejects.toThrow(
                BusinessRuleError
              )

              // Clean up
              sqlite.exec('DELETE FROM orders')
            }
          ),
          { numRuns: 20 }
        )
      })

      /**
       * **Validates: Requirements 6.6**
       *
       * Updating a sales order in draft status should succeed.
       */
      it('sales order update succeeds when status is draft', async () => {
        await fc.assert(
          fc.asyncProperty(fc.constant('draft'), async () => {
            const now = '2024-06-01T00:00:00.000Z'

            sqlite.exec(`
              INSERT INTO orders (company_id, customer_id, order_number, order_type, status, subtotal, discount_amount, tax_amount, total_amount, payment_status, created_at, updated_at)
              VALUES (1, 1, 'SO-OK-${Date.now()}-${Math.random()}', 'sale', 'draft', 100, 0, 0, 100, 'unpaid', '${now}', '${now}')
            `)
            const orderRow = sqlite.prepare('SELECT id FROM orders ORDER BY id DESC LIMIT 1').get() as { id: number }

            // Add an order item so detail works
            sqlite.exec(`
              INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount_amount, tax_amount, total_amount, created_at)
              VALUES (${orderRow.id}, 1, 1, 100, 0, 0, 100, '${now}')
            `)

            // Update with new items should succeed
            const updated = await salesOrderService.update(1, orderRow.id, {
              items: [{ productId: 1, quantity: 2, unitPrice: 50, discountAmount: 0 }]
            })
            expect(updated.items).toHaveLength(1)
            expect(updated.items[0].quantity).toBe(2)

            // Clean up
            sqlite.exec('DELETE FROM order_items')
            sqlite.exec('DELETE FROM orders')
          }),
          { numRuns: 5 }
        )
      })
    })
  })
})
