/**
 * Integration tests for the commercial API routes (Phase 2).
 *
 * Tests the complete lifecycle flows end-to-end through the service layer:
 * 1. Quote lifecycle: create → send → accept → convert to order → verify order
 * 2. Purchase lifecycle: create PO → send → partial receipt → full receipt → verify stock
 * 3. Payment flow: create sales order → confirm → partial payment → full payment → verify paid
 * 4. Deletion guards: customer with quotes, supplier with POs
 * 5. Company isolation: create in A, query from B → empty
 * 6. Pagination correctness: create N records, list with limit < N
 *
 * Requirements: 1.6, 2.6, 5.1–5.6, 9.1–9.7, 10.1–10.7, 12.1–12.4
 */
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import { describe, expect, it, vi } from 'vitest'

import { EntityReferencedError } from '../../api/errors'
import * as schema from '../../db/schema'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetDb = vi.fn()
vi.mock('../../server', () => ({
  getDb: (): unknown => mockGetDb()
}))

vi.mock('../../services/audit-service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
}))

const mockRecordInbound = vi.fn().mockResolvedValue(undefined)
vi.mock('../../services/stock-service', () => ({
  recordInbound: (...args: unknown[]): unknown => mockRecordInbound(...args)
}))

// Import services AFTER mock setup
import * as CustomerService from '../../services/customer-service'
import * as PaymentService from '../../services/payment-service'
import * as PurchaseOrderService from '../../services/purchase-order-service'
import * as QuoteService from '../../services/quote-service'
import * as SalesOrderService from '../../services/sales-order-service'
import * as SupplierService from '../../services/supplier-service'

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
    CREATE UNIQUE INDEX companies_document_number_unique ON companies(document_number);

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
    CREATE UNIQUE INDEX customers_company_document_unique ON customers(company_id, document_number);
    CREATE INDEX customers_company_idx ON customers(company_id);

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
    CREATE UNIQUE INDEX suppliers_company_document_unique ON suppliers(company_id, document_number);
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
    CREATE UNIQUE INDEX quotes_company_quote_number_unique ON quotes(company_id, quote_number);
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
      payment_status TEXT NOT NULL DEFAULT 'pending',
      confirmed_at TEXT,
      fulfilled_at TEXT,
      cancelled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX orders_company_order_number_unique ON orders(company_id, order_number);
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
      payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
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

function seedBaseData(sqlite: Database.Database): void {
  const now = '2024-01-01T00:00:00.000Z'
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (1, 'Company A', '11111111000100', 'active', '${now}', '${now}');

    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (2, 'Company B', '22222222000200', 'active', '${now}', '${now}');

    INSERT INTO customers (id, company_id, name, document_number, customer_type, status, created_at, updated_at)
    VALUES (1, 1, 'Customer One', '12345678901', 'business', 'active', '${now}', '${now}');

    INSERT INTO customers (id, company_id, name, document_number, customer_type, status, created_at, updated_at)
    VALUES (2, 2, 'Customer Two', '98765432101', 'business', 'active', '${now}', '${now}');

    INSERT INTO suppliers (id, company_id, name, document_number, status, created_at, updated_at)
    VALUES (1, 1, 'Supplier One', '99999999000199', 'active', '${now}', '${now}');

    INSERT INTO suppliers (id, company_id, name, document_number, status, created_at, updated_at)
    VALUES (2, 2, 'Supplier Two', '88888888000188', 'active', '${now}', '${now}');

    INSERT INTO products (id, company_id, sku, name, sale_price, cost_price, track_inventory, status, created_at, updated_at)
    VALUES
      (1, 1, 'PROD-001', 'Product A', 100.00, 50.00, 1, 'active', '${now}', '${now}'),
      (2, 1, 'PROD-002', 'Product B', 200.00, 80.00, 1, 'active', '${now}', '${now}'),
      (3, 1, 'PROD-003', 'Product C', 50.00, 25.00, 1, 'active', '${now}', '${now}');

    INSERT INTO products (id, company_id, sku, name, sale_price, cost_price, track_inventory, status, created_at, updated_at)
    VALUES (4, 2, 'PROD-004', 'Product D', 150.00, 60.00, 1, 'active', '${now}', '${now}');

    INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
    VALUES (1, 1, 'Main Warehouse', 'WH-01', 'active', '${now}', '${now}');

    INSERT INTO payment_methods (id, company_id, name, code, status, created_at, updated_at)
    VALUES
      (1, 1, 'Bank Transfer', 'bank_transfer', 'active', '${now}', '${now}'),
      (2, 2, 'Credit Card', 'credit_card', 'active', '${now}', '${now}');

    INSERT INTO numbering_sequences (company_id, sequence_type, current_value, created_at, updated_at)
    VALUES
      (1, 'quote', 0, '${now}', '${now}'),
      (1, 'sales_order', 0, '${now}', '${now}'),
      (1, 'purchase_order', 0, '${now}', '${now}'),
      (2, 'quote', 0, '${now}', '${now}'),
      (2, 'sales_order', 0, '${now}', '${now}'),
      (2, 'purchase_order', 0, '${now}', '${now}');
  `)
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function setupDb(): { sqlite: Database.Database; db: BetterSQLite3Database<typeof schema> } {
  const sqlite = createTestDb()
  const db = drizzle(sqlite, { schema })
  patchDbTransaction(db, sqlite)
  mockGetDb.mockReturnValue(db)
  seedBaseData(sqlite)
  return { sqlite, db }
}

// ---------------------------------------------------------------------------
// Test Scenarios
// ---------------------------------------------------------------------------

describe('Commercial routes integration tests', () => {
  describe('Scenario 1: Quote lifecycle — create → send → accept → convert → verify order', () => {
    it('full quote lifecycle produces a sales order with matching items and totals', async () => {
      const { sqlite } = setupDb()
      mockRecordInbound.mockClear()

      try {
        // Step 1: Create a quote with 2 items
        const quote = await QuoteService.create(1, {
          customerId: 1,
          validUntil: '2024-12-31',
          notes: 'Test quote',
          items: [
            { productId: 1, quantity: 5, unitPrice: 100, discountAmount: 10 },
            { productId: 2, quantity: 3, unitPrice: 200, discountAmount: 0 }
          ]
        })

        expect(quote.status).toBe('draft')
        expect(quote.items).toHaveLength(2)
        // Line 1: 5 * 100 - 10 = 490
        // Line 2: 3 * 200 - 0 = 600
        // Total: 1090
        expect(quote.totalAmount).toBe(1090)

        // Step 2: Transition to "sent"
        const sentQuote = await QuoteService.transitionStatus(1, quote.id, 'sent')
        expect(sentQuote.status).toBe('sent')

        // Step 3: Transition to "accepted"
        const acceptedQuote = await QuoteService.transitionStatus(1, quote.id, 'accepted')
        expect(acceptedQuote.status).toBe('accepted')

        // Step 4: Convert to sales order
        const conversion = await QuoteService.convertToOrder(1, quote.id)

        // Verify quote is now "converted"
        expect(conversion.quote.status).toBe('converted')
        expect(conversion.quote.convertedAt).not.toBeNull()

        // Verify sales order was created
        const salesOrder = conversion.salesOrder
        expect(salesOrder.status).toBe('draft')
        expect(salesOrder.customerId).toBe(1)
        expect(salesOrder.totalAmount).toBe(1090)
        expect(salesOrder.items).toHaveLength(2)

        // Verify items match the quote items
        const orderItem1 = salesOrder.items.find((i) => i.productId === 1)
        const orderItem2 = salesOrder.items.find((i) => i.productId === 2)

        if (!orderItem1) throw new Error('Expected order item for productId 1')
        expect(orderItem1.quantity).toBe(5)
        expect(orderItem1.unitPrice).toBe(100)
        expect(orderItem1.discountAmount).toBe(10)
        expect(orderItem1.totalAmount).toBe(490)

        if (!orderItem2) throw new Error('Expected order item for productId 2')
        expect(orderItem2.quantity).toBe(3)
        expect(orderItem2.unitPrice).toBe(200)
        expect(orderItem2.discountAmount).toBe(0)
        expect(orderItem2.totalAmount).toBe(600)
      } finally {
        sqlite.close()
      }
    })
  })

  describe('Scenario 2: Purchase lifecycle — create PO → send → partial receipt → full receipt → verify status', () => {
    it('full purchase lifecycle transitions correctly through statuses', async () => {
      const { sqlite } = setupDb()
      mockRecordInbound.mockClear()

      try {
        // Step 1: Create a purchase order with 2 items
        const po = await PurchaseOrderService.create(1, {
          supplierId: 1,
          expectedDeliveryDate: '2024-06-30',
          items: [
            { productId: 1, quantity: 10, unitCost: 50 },
            { productId: 2, quantity: 20, unitCost: 80 }
          ]
        })

        expect(po.status).toBe('draft')
        expect(po.items).toHaveLength(2)
        // Item 1: 10 * 50 = 500
        // Item 2: 20 * 80 = 1600
        // Total: 2100
        expect(po.totalAmount).toBe(2100)

        // Step 2: Transition to "sent"
        const sentPo = await PurchaseOrderService.transitionStatus(1, po.id, 'sent')
        expect(sentPo.status).toBe('sent')

        // Step 3: Partial receipt — receive 5 of 10 for item 1
        const poItem1 = po.items.find((i) => i.productId === 1)
        if (!poItem1) throw new Error('Expected PO item for productId 1')
        const partialReceipt = await PurchaseOrderService.recordReceipt(1, po.id, {
          items: [{ purchaseOrderItemId: poItem1.id, receivedQuantity: 5, warehouseId: 1 }]
        })

        expect(partialReceipt.status).toBe('partially_received')
        const updatedItem1 = partialReceipt.items.find((i) => i.productId === 1)
        if (!updatedItem1) throw new Error('Expected updated item for productId 1')
        expect(updatedItem1.receivedQuantity).toBe(5)

        // Verify stock movement was called
        expect(mockRecordInbound).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            productId: 1,
            warehouseId: 1,
            quantity: 5,
            unitCost: 50,
            referenceType: 'purchase_order',
            referenceId: String(po.id)
          })
        )

        // Step 4: Full receipt — receive remaining items
        const poItem2 = po.items.find((i) => i.productId === 2)
        if (!poItem2) throw new Error('Expected PO item for productId 2')
        const fullReceipt = await PurchaseOrderService.recordReceipt(1, po.id, {
          items: [
            { purchaseOrderItemId: poItem1.id, receivedQuantity: 5, warehouseId: 1 },
            { purchaseOrderItemId: poItem2.id, receivedQuantity: 20, warehouseId: 1 }
          ]
        })

        // Should now be "received" since all items are fully received
        expect(fullReceipt.status).toBe('received')
        const finalItem1 = fullReceipt.items.find((i) => i.productId === 1)
        const finalItem2 = fullReceipt.items.find((i) => i.productId === 2)
        if (!finalItem1) throw new Error('Expected final item for productId 1')
        if (!finalItem2) throw new Error('Expected final item for productId 2')
        expect(finalItem1.receivedQuantity).toBe(10)
        expect(finalItem2.receivedQuantity).toBe(20)
      } finally {
        sqlite.close()
      }
    })
  })

  describe('Scenario 3: Payment flow — create order → confirm → partial payment → full payment → verify paid', () => {
    it('payment flow correctly tracks balance and transitions payment status', async () => {
      const { sqlite } = setupDb()
      mockRecordInbound.mockClear()

      try {
        // Step 1: Create a sales order
        const order = await SalesOrderService.create(1, {
          customerId: 1,
          items: [
            { productId: 1, quantity: 2, unitPrice: 100, discountAmount: 0 },
            { productId: 3, quantity: 4, unitPrice: 50, discountAmount: 0 }
          ]
        })

        expect(order.status).toBe('draft')
        // Item 1: 2 * 100 = 200
        // Item 2: 4 * 50 = 200
        // Total: 400
        expect(order.totalAmount).toBe(400)

        // Step 2: Confirm the sales order
        const confirmed = await SalesOrderService.transitionStatus(1, order.id, 'confirmed')
        expect(confirmed.status).toBe('confirmed')

        // Step 3: Register partial payment of 150
        const payment1 = await PaymentService.registerForSalesOrder(1, order.id, {
          paymentMethodId: 1,
          amount: 150,
          paidAt: '2024-03-15T10:00:00.000Z',
          transactionReference: 'TXN-001'
        })

        expect(payment1.amount).toBe(150)

        // Verify remaining balance
        const summary1 = await PaymentService.listForSalesOrder(1, order.id)
        expect(summary1.documentTotal).toBe(400)
        expect(summary1.totalPaid).toBe(150)
        expect(summary1.remainingBalance).toBe(250)
        expect(summary1.paymentStatus).toBe('partially_paid')

        // Step 4: Register remaining payment of 250
        const payment2 = await PaymentService.registerForSalesOrder(1, order.id, {
          paymentMethodId: 1,
          amount: 250,
          paidAt: '2024-03-20T10:00:00.000Z',
          transactionReference: 'TXN-002'
        })

        expect(payment2.amount).toBe(250)

        // Verify fully paid
        const summary2 = await PaymentService.listForSalesOrder(1, order.id)
        expect(summary2.documentTotal).toBe(400)
        expect(summary2.totalPaid).toBe(400)
        expect(summary2.remainingBalance).toBe(0)
        expect(summary2.paymentStatus).toBe('paid')
        expect(summary2.payments).toHaveLength(2)
      } finally {
        sqlite.close()
      }
    })
  })

  describe('Scenario 4: Deletion guards — referential integrity', () => {
    it('rejects deletion of customer referenced by quotes', async () => {
      const { sqlite } = setupDb()

      try {
        // Create a quote for customer 1
        await QuoteService.create(1, {
          customerId: 1,
          items: [{ productId: 1, quantity: 1, unitPrice: 100 }]
        })

        // Try to delete the customer — should throw EntityReferencedError
        await expect(CustomerService.deleteCustomer(1, 1)).rejects.toThrow(EntityReferencedError)
      } finally {
        sqlite.close()
      }
    })

    it('rejects deletion of supplier referenced by purchase orders', async () => {
      const { sqlite } = setupDb()

      try {
        // Create a PO for supplier 1
        await PurchaseOrderService.create(1, {
          supplierId: 1,
          items: [{ productId: 1, quantity: 5, unitCost: 50 }]
        })

        // Try to delete the supplier — should throw EntityReferencedError
        await expect(SupplierService.deleteSupplier(1, 1)).rejects.toThrow(EntityReferencedError)
      } finally {
        sqlite.close()
      }
    })

    it('allows deletion of customer with no dependent documents', async () => {
      const { sqlite } = setupDb()

      try {
        // Create a fresh customer with no quotes or orders
        const customer = await CustomerService.create(1, {
          name: 'Deletable Customer',
          documentNumber: '00000000000'
        })

        // Deletion should succeed
        await expect(CustomerService.deleteCustomer(1, customer.id)).resolves.not.toThrow()
      } finally {
        sqlite.close()
      }
    })
  })

  describe('Scenario 5: Company isolation', () => {
    it('customer created in company A is not visible from company B', async () => {
      const { sqlite } = setupDb()

      try {
        // Create a customer in company 1
        await CustomerService.create(1, {
          name: 'Isolated Customer',
          documentNumber: '11111111111'
        })

        // List customers from company 2 — should not include company 1's customers
        const result = await CustomerService.list(2, { limit: 100, offset: 0 })

        const names = result.data.map((c) => c.name)
        expect(names).not.toContain('Isolated Customer')
        // Company 2 has its own seeded customer
        expect(names).toContain('Customer Two')
      } finally {
        sqlite.close()
      }
    })

    it('quote created in company A is not visible from company B', async () => {
      const { sqlite } = setupDb()

      try {
        // Create a quote in company 1
        await QuoteService.create(1, {
          customerId: 1,
          items: [{ productId: 1, quantity: 1, unitPrice: 100 }]
        })

        // List quotes from company 2 — should be empty
        const result = await QuoteService.list(2, { limit: 100, offset: 0 })
        expect(result.data).toHaveLength(0)
        expect(result.total).toBe(0)
      } finally {
        sqlite.close()
      }
    })

    it('purchase order created in company A is not visible from company B', async () => {
      const { sqlite } = setupDb()

      try {
        // Create a PO in company 1
        await PurchaseOrderService.create(1, {
          supplierId: 1,
          items: [{ productId: 1, quantity: 5, unitCost: 50 }]
        })

        // List POs from company 2 — should be empty
        const result = await PurchaseOrderService.list(2, { limit: 100, offset: 0 })
        expect(result.data).toHaveLength(0)
        expect(result.total).toBe(0)
      } finally {
        sqlite.close()
      }
    })
  })

  describe('Scenario 6: Pagination correctness', () => {
    it('returns correct subset and total when limit < total records', async () => {
      const { sqlite } = setupDb()

      try {
        // Create 5 customers in company 1 (1 already seeded = 6 total)
        for (let i = 0; i < 5; i++) {
          await CustomerService.create(1, {
            name: `Customer ${i + 10}`,
            documentNumber: `9000000000${i}`
          })
        }

        // List with limit=2
        const page1 = await CustomerService.list(1, { limit: 2, offset: 0 })
        expect(page1.data).toHaveLength(2)
        expect(page1.total).toBe(6) // 1 seeded + 5 created
        expect(page1.limit).toBe(2)
        expect(page1.offset).toBe(0)

        // List with offset=2, limit=2 — second page
        const page2 = await CustomerService.list(1, { limit: 2, offset: 2 })
        expect(page2.data).toHaveLength(2)
        expect(page2.total).toBe(6)
        expect(page2.offset).toBe(2)

        // Verify no overlap between pages
        const page1Ids = page1.data.map((c) => c.id)
        const page2Ids = page2.data.map((c) => c.id)
        const overlap = page1Ids.filter((id) => page2Ids.includes(id))
        expect(overlap).toHaveLength(0)

        // Last page: offset=4, limit=2 — should return 2 items (indexes 4, 5)
        const page3 = await CustomerService.list(1, { limit: 2, offset: 4 })
        expect(page3.data).toHaveLength(2)
        expect(page3.total).toBe(6)
      } finally {
        sqlite.close()
      }
    })

    it('returns empty data when offset exceeds total', async () => {
      const { sqlite } = setupDb()

      try {
        // Company 1 has 1 seeded customer
        const result = await CustomerService.list(1, { limit: 20, offset: 100 })
        expect(result.data).toHaveLength(0)
        expect(result.total).toBe(1) // 1 seeded
      } finally {
        sqlite.close()
      }
    })
  })
})
