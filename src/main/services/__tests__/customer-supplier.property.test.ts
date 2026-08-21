/**
 * Property-based tests for CustomerService and SupplierService.
 *
 * Tests cover:
 * - Property 13: Company data isolation — data in company A invisible to company B
 * - Property 14: Referential integrity on deletion — reject delete when dependent docs exist
 * - Property 15: Duplicate document number rejection — CONFLICT error on duplicate per company
 *
 * **Validates: Requirements 1.2, 1.6, 2.2, 2.6, 12.1, 12.2, 12.3, 12.4**
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConflictError, EntityReferencedError } from '../../api/errors'
import * as schema from '../../db/schema'

// Mock getDb to return our in-memory database
const mockGetDb = vi.fn()
vi.mock('../../server', () => ({
  getDb: (): unknown => mockGetDb()
}))

// Import services AFTER mock setup
import * as customerService from '../customer-service'
import * as supplierService from '../supplier-service'

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
    CREATE INDEX suppliers_status_idx ON suppliers(status);

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
    CREATE UNIQUE INDEX orders_company_order_number_unique
      ON orders(company_id, order_number);
    CREATE INDEX orders_company_idx ON orders(company_id);

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
    CREATE UNIQUE INDEX purchase_orders_company_order_unique
      ON purchase_orders(company_id, order_number);
    CREATE INDEX purchase_orders_company_idx ON purchase_orders(company_id);
    CREATE INDEX purchase_orders_supplier_idx ON purchase_orders(supplier_id);
  `)

  // Seed two companies
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (1, 'Company A', '11111111000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');

    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (2, 'Company B', '22222222000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)

  return sqlite
}

// ---------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------

/** Generates a non-empty trimmed name (1-100 chars, alphanumeric + spaces). */
const nameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.trim())

/** Generates a valid document number (CNPJ-like: 11-14 digits). */
const documentNumberArb = fc
  .array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
    minLength: 11,
    maxLength: 14
  })
  .map((chars) => chars.join(''))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CustomerService & SupplierService — Property Tests', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof drizzle<typeof schema>>

  beforeEach(() => {
    sqlite = createTestDb()
    db = drizzle(sqlite, { schema })
    mockGetDb.mockReturnValue(db)
  })

  afterEach(() => {
    sqlite.close()
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Property 15: Duplicate document number rejection
  // -------------------------------------------------------------------------

  describe('Property 15: Duplicate document number rejection', () => {
    it('creating a customer with duplicate documentNumber in same company throws ConflictError', async () => {
      await fc.assert(
        fc.asyncProperty(nameArb, nameArb, documentNumberArb, async (name1, name2, docNumber) => {
          // Create first customer
          await customerService.create(1, {
            name: name1,
            documentNumber: docNumber
          })

          // Second customer with same documentNumber in same company should conflict
          await expect(
            customerService.create(1, {
              name: name2,
              documentNumber: docNumber
            })
          ).rejects.toThrow(ConflictError)

          // Clean up for next iteration
          sqlite.exec('DELETE FROM customers')
        }),
        { numRuns: 50 }
      )
    })

    it('creating a supplier with duplicate documentNumber in same company throws ConflictError', async () => {
      await fc.assert(
        fc.asyncProperty(nameArb, nameArb, documentNumberArb, async (name1, name2, docNumber) => {
          // Create first supplier
          await supplierService.create(1, {
            name: name1,
            documentNumber: docNumber
          })

          // Second supplier with same documentNumber in same company should conflict
          await expect(
            supplierService.create(1, {
              name: name2,
              documentNumber: docNumber
            })
          ).rejects.toThrow(ConflictError)

          // Clean up for next iteration
          sqlite.exec('DELETE FROM suppliers')
        }),
        { numRuns: 50 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 14: Referential integrity on deletion
  // -------------------------------------------------------------------------

  describe('Property 14: Referential integrity on deletion', () => {
    it('deleting a customer with associated quotes throws EntityReferencedError', async () => {
      await fc.assert(
        fc.asyncProperty(nameArb, documentNumberArb, async (name, docNumber) => {
          // Create customer
          const customer = await customerService.create(1, {
            name,
            documentNumber: docNumber
          })

          // Create a quote referencing the customer
          const now = '2024-06-01T00:00:00.000Z'
          sqlite.exec(`
            INSERT INTO quotes (company_id, customer_id, quote_number, status, subtotal, discount_amount, tax_amount, total_amount, created_at, updated_at)
            VALUES (1, ${customer.id}, 'Q-${customer.id}', 'draft', 0, 0, 0, 0, '${now}', '${now}')
          `)

          // Attempting to delete should be rejected
          await expect(customerService.deleteCustomer(1, customer.id)).rejects.toThrow(EntityReferencedError)

          // Clean up
          sqlite.exec('DELETE FROM quotes')
          sqlite.exec('DELETE FROM customers')
        }),
        { numRuns: 30 }
      )
    })

    it('deleting a customer with associated orders throws EntityReferencedError', async () => {
      await fc.assert(
        fc.asyncProperty(nameArb, documentNumberArb, async (name, docNumber) => {
          // Create customer
          const customer = await customerService.create(1, {
            name,
            documentNumber: docNumber
          })

          // Create an order referencing the customer
          const now = '2024-06-01T00:00:00.000Z'
          sqlite.exec(`
            INSERT INTO orders (company_id, customer_id, order_number, order_type, status, subtotal, discount_amount, tax_amount, total_amount, payment_status, created_at, updated_at)
            VALUES (1, ${customer.id}, 'O-${customer.id}', 'sale', 'draft', 0, 0, 0, 0, 'pending', '${now}', '${now}')
          `)

          // Attempting to delete should be rejected
          await expect(customerService.deleteCustomer(1, customer.id)).rejects.toThrow(EntityReferencedError)

          // Clean up
          sqlite.exec('DELETE FROM orders')
          sqlite.exec('DELETE FROM customers')
        }),
        { numRuns: 30 }
      )
    })

    it('deleting a supplier with associated purchase orders throws EntityReferencedError', async () => {
      await fc.assert(
        fc.asyncProperty(nameArb, documentNumberArb, async (name, docNumber) => {
          // Create supplier
          const supplier = await supplierService.create(1, {
            name,
            documentNumber: docNumber
          })

          // Create a purchase order referencing the supplier
          const now = '2024-06-01T00:00:00.000Z'
          sqlite.exec(`
            INSERT INTO purchase_orders (company_id, supplier_id, order_number, status, subtotal, discount_amount, tax_amount, total_amount, payment_status, created_at, updated_at)
            VALUES (1, ${supplier.id}, 'PO-${supplier.id}', 'draft', 0, 0, 0, 0, 'pending', '${now}', '${now}')
          `)

          // Attempting to delete should be rejected
          await expect(supplierService.deleteSupplier(1, supplier.id)).rejects.toThrow(EntityReferencedError)

          // Clean up
          sqlite.exec('DELETE FROM purchase_orders')
          sqlite.exec('DELETE FROM suppliers')
        }),
        { numRuns: 30 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 13: Company data isolation
  // -------------------------------------------------------------------------

  describe('Property 13: Company data isolation', () => {
    it('customers created in company A are invisible when listing from company B', async () => {
      await fc.assert(
        fc.asyncProperty(nameArb, documentNumberArb, async (name, docNumber) => {
          // Create customer in company A
          await customerService.create(1, {
            name,
            documentNumber: docNumber
          })

          // List from company B should return empty
          const result = await customerService.list(2, { limit: 100, offset: 0 })
          expect(result.data).toHaveLength(0)
          expect(result.total).toBe(0)

          // Clean up
          sqlite.exec('DELETE FROM customers')
        }),
        { numRuns: 30 }
      )
    })

    it('customers created in company A are not found by detail from company B', async () => {
      await fc.assert(
        fc.asyncProperty(nameArb, documentNumberArb, async (name, docNumber) => {
          // Create customer in company A
          const customer = await customerService.create(1, {
            name,
            documentNumber: docNumber
          })

          // Detail from company B should throw NotFoundError
          await expect(customerService.detail(2, customer.id)).rejects.toThrow('not found')

          // Clean up
          sqlite.exec('DELETE FROM customers')
        }),
        { numRuns: 30 }
      )
    })

    it('suppliers created in company A are invisible when listing from company B', async () => {
      await fc.assert(
        fc.asyncProperty(nameArb, documentNumberArb, async (name, docNumber) => {
          // Create supplier in company A
          await supplierService.create(1, {
            name,
            documentNumber: docNumber
          })

          // List from company B should return empty
          const result = await supplierService.list(2, { limit: 100, offset: 0 })
          expect(result.data).toHaveLength(0)
          expect(result.total).toBe(0)

          // Clean up
          sqlite.exec('DELETE FROM suppliers')
        }),
        { numRuns: 30 }
      )
    })

    it('suppliers created in company A are not found by detail from company B', async () => {
      await fc.assert(
        fc.asyncProperty(nameArb, documentNumberArb, async (name, docNumber) => {
          // Create supplier in company A
          const supplier = await supplierService.create(1, {
            name,
            documentNumber: docNumber
          })

          // Detail from company B should throw NotFoundError
          await expect(supplierService.detail(2, supplier.id)).rejects.toThrow('not found')

          // Clean up
          sqlite.exec('DELETE FROM suppliers')
        }),
        { numRuns: 30 }
      )
    })

    it('same documentNumber can exist in different companies without conflict', async () => {
      await fc.assert(
        fc.asyncProperty(nameArb, nameArb, documentNumberArb, async (nameA, nameB, docNumber) => {
          // Create customer in company A
          await customerService.create(1, {
            name: nameA,
            documentNumber: docNumber
          })

          // Same documentNumber in company B should succeed (no conflict)
          const customerB = await customerService.create(2, {
            name: nameB,
            documentNumber: docNumber
          })

          expect(customerB.companyId).toBe(2)
          expect(customerB.documentNumber).toBe(docNumber)

          // Clean up
          sqlite.exec('DELETE FROM customers')
        }),
        { numRuns: 30 }
      )
    })

    it('same supplier documentNumber can exist in different companies without conflict', async () => {
      await fc.assert(
        fc.asyncProperty(nameArb, nameArb, documentNumberArb, async (nameA, nameB, docNumber) => {
          // Create supplier in company A
          await supplierService.create(1, {
            name: nameA,
            documentNumber: docNumber
          })

          // Same documentNumber in company B should succeed (no conflict)
          const supplierB = await supplierService.create(2, {
            name: nameB,
            documentNumber: docNumber
          })

          expect(supplierB.companyId).toBe(2)
          expect(supplierB.documentNumber).toBe(docNumber)

          // Clean up
          sqlite.exec('DELETE FROM suppliers')
        }),
        { numRuns: 30 }
      )
    })
  })
})
