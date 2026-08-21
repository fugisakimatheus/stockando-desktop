/**
 * Property-based tests for FiscalDocumentService.
 *
 * **Validates: Requirements 4.2, 4.3, 4.7, 5.3, 5.4, 5.5, 6.5, 7.3, 7.5, 11.1, 11.4, 11.5**
 *
 * Properties tested:
 * - Property 9: Fiscal document status transition validity
 * - Property 10: Access key format validation
 * - Property 11: Fiscal document creation copies items faithfully
 * - Property 12: Fiscal document total computation
 * - Property 14: Duplicate fiscal document rejection
 * - Property 15: Fiscal document item immutability after draft
 * - Property 17: Fiscal data preservation on cancellation
 * - Property 18: Fiscal file path structure compliance
 * - Property 19: Access key lookup round-trip
 * - Property 20: Date range filter correctness
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DuplicateFiscalDocumentError, InvalidAccessKeyError, InvalidStatusTransitionError } from '../../api/errors'
import * as schema from '../../db/schema'
import { getFiscalFilePath, getFiscalFilePathFromDate } from '../fiscal-file-path'
import {
  assertFiscalTransition,
  assertValidAccessKey,
  validateAccessKey,
  validateFiscalTransition,
  VALID_FISCAL_TRANSITIONS
} from '../fiscal-transitions'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../server', () => ({
  getDb: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/test-data'
  }
}))

vi.mock('../audit-service', () => ({
  log: vi.fn().mockResolvedValue(undefined),
  logAudit: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('<xml>test</xml>')
  }
}))

import { getDb } from '../../server'

const mockedGetDb = vi.mocked(getDb)

// ---------------------------------------------------------------------------
// Test database setup
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

    CREATE TABLE document_series (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      series TEXT NOT NULL,
      current_number INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX document_series_company_type_series_unique
      ON document_series(company_id, document_type, series);

    CREATE TABLE invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      digital_certificate_id INTEGER,
      tax_rule_id INTEGER,
      document_type TEXT NOT NULL,
      document_number TEXT NOT NULL,
      series TEXT,
      access_key TEXT,
      protocol_number TEXT,
      issue_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      authorized_at TEXT,
      cancelled_at TEXT,
      cancellation_justification TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX invoices_company_document_unique ON invoices(company_id, document_type, document_number);

    CREATE TABLE invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE invoice_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      protocol_number TEXT,
      justification TEXT,
      event_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER,
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

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const NOW = '2024-06-15T10:00:00.000Z'

function seedCompany(sqlite: Database.Database, id = 1): void {
  sqlite
    .prepare(
      `INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
       VALUES (?, 'Test Company', '12345678000100', 'active', ?, ?)`
    )
    .run(id, NOW, NOW)
}

function seedCustomer(sqlite: Database.Database, companyId = 1, id = 1): void {
  sqlite
    .prepare(
      `INSERT INTO customers (id, company_id, name, document_number, customer_type, status, created_at, updated_at)
       VALUES (?, ?, 'Test Customer', '11122233344', 'individual', 'active', ?, ?)`
    )
    .run(id, companyId, NOW, NOW)
}

function seedProduct(sqlite: Database.Database, companyId: number, id: number, name: string): void {
  sqlite
    .prepare(
      `INSERT INTO products (id, company_id, sku, name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`
    )
    .run(id, companyId, `SKU-${id}`, name, NOW, NOW)
}

function seedOrder(
  sqlite: Database.Database,
  params: {
    id: number
    companyId: number
    customerId: number
    status: string
    subtotal: number
    discountAmount: number
    taxAmount: number
    totalAmount: number
  }
): void {
  sqlite
    .prepare(
      `INSERT INTO orders (id, company_id, customer_id, order_number, order_type, status, subtotal, discount_amount, tax_amount, total_amount, payment_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'sale', ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    .run(
      params.id,
      params.companyId,
      params.customerId,
      `ORD-${params.id}`,
      params.status,
      params.subtotal,
      params.discountAmount,
      params.taxAmount,
      params.totalAmount,
      NOW,
      NOW
    )
}

function seedOrderItem(
  sqlite: Database.Database,
  params: {
    orderId: number
    productId: number
    quantity: number
    unitPrice: number
    discountAmount: number
    taxAmount: number
    totalAmount: number
  }
): void {
  sqlite
    .prepare(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount_amount, tax_amount, total_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.orderId,
      params.productId,
      params.quantity,
      params.unitPrice,
      params.discountAmount,
      params.taxAmount,
      params.totalAmount,
      NOW
    )
}

function seedDocumentSeries(
  sqlite: Database.Database,
  companyId: number,
  documentType: string,
  series: string,
  currentNumber = 0
): void {
  sqlite
    .prepare(
      `INSERT INTO document_series (company_id, document_type, series, current_number, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`
    )
    .run(companyId, documentType, series, currentNumber, NOW, NOW)
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const documentTypeArb = fc.constantFrom('NF-e' as const, 'NFC-e' as const)
const seriesArb = fc.constantFrom('1', '01', '001')
const statusArb = fc.constantFrom('draft' as const, 'authorized' as const, 'cancelled' as const, 'denied' as const)

const accessKey44Arb = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 44, maxLength: 44 })
  .map((digits) => digits.join(''))

const invalidAccessKeyArb = fc.oneof(
  // Too short
  fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 43 }).map((digits) => digits.join('')),
  // Too long
  fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 45, maxLength: 60 }).map((digits) => digits.join('')),
  // Contains letters (43 digits + 1 letter)
  fc
    .tuple(
      fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 43, maxLength: 43 }),
      fc.constantFrom('a', 'B', 'x', 'Z', 'k', 'M')
    )
    .map(([digits, letter]) => digits.join('') + letter),
  // Empty string
  fc.constant('')
)

const positiveAmountArb = fc.float({
  min: Math.fround(0.01),
  max: Math.fround(9999.99),
  noDefaultInfinity: true,
  noNaN: true
})

const quantityArb = fc.integer({ min: 1, max: 100 })

// Generate valid issue dates in ISO format
const issueDateArb = fc
  .tuple(fc.integer({ min: 2020, max: 2025 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)

// ---------------------------------------------------------------------------
// Property 9: Fiscal document status transition validity
// ---------------------------------------------------------------------------

describe('Property 9: Fiscal document status transition validity', () => {
  /**
   * **Validates: Requirements 5.3, 5.4**
   *
   * For any fiscal document in a given status, only the transitions defined in
   * the valid transition map (draft→authorized, draft→denied, authorized→cancelled)
   * SHALL succeed. All other status change requests SHALL be rejected.
   */
  it('valid transitions succeed (draft→authorized, draft→denied, authorized→cancelled)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ['draft', 'authorized'] as const,
          ['draft', 'denied'] as const,
          ['authorized', 'cancelled'] as const
        ),
        ([from, to]) => {
          expect(validateFiscalTransition(from, to)).toBe(true)
          expect(() => assertFiscalTransition(from, to)).not.toThrow()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('invalid transitions are rejected', () => {
    fc.assert(
      fc.property(statusArb, statusArb, (from, to) => {
        const allowed = VALID_FISCAL_TRANSITIONS[from]
        if (allowed.includes(to)) return // skip valid transitions

        expect(validateFiscalTransition(from, to)).toBe(false)
        expect(() => assertFiscalTransition(from, to)).toThrow(InvalidStatusTransitionError)
      }),
      { numRuns: 100 }
    )
  })

  it('terminal states (cancelled, denied) reject all transitions', () => {
    fc.assert(
      fc.property(fc.constantFrom('cancelled' as const, 'denied' as const), statusArb, (from, to) => {
        expect(validateFiscalTransition(from, to)).toBe(false)
        expect(() => assertFiscalTransition(from, to)).toThrow(InvalidStatusTransitionError)
      }),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 10: Access key format validation
// ---------------------------------------------------------------------------

describe('Property 10: Access key format validation', () => {
  /**
   * **Validates: Requirements 5.5**
   *
   * For any string provided as an access key, the system SHALL accept it only if
   * it consists of exactly 44 numeric digits. All other strings SHALL be rejected.
   */
  it('accepts exactly 44 numeric digits', () => {
    fc.assert(
      fc.property(accessKey44Arb, (key) => {
        expect(validateAccessKey(key)).toBe(true)
        expect(() => assertValidAccessKey(key)).not.toThrow()
      }),
      { numRuns: 100 }
    )
  })

  it('rejects strings that are not exactly 44 numeric digits', () => {
    fc.assert(
      fc.property(invalidAccessKeyArb, (key) => {
        expect(validateAccessKey(key)).toBe(false)
        expect(() => assertValidAccessKey(key)).toThrow(InvalidAccessKeyError)
      }),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 18: Fiscal file path structure compliance
// ---------------------------------------------------------------------------

describe('Property 18: Fiscal file path structure compliance', () => {
  /**
   * **Validates: Requirements 6.5**
   *
   * For any fiscal document file (XML or DANFE), the storage path SHALL follow the
   * pattern `{companyId}/fiscal/{year}/{paddedMonth}/{typeDir}/{documentNumber}/{fileName}`
   */
  it('getFiscalFilePath produces correct structured path', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 999 }),
        fc.integer({ min: 2020, max: 2030 }),
        fc.integer({ min: 1, max: 12 }),
        documentTypeArb,
        fc.stringMatching(/^[0-9]{1,10}$/),
        fc.stringMatching(/^[a-z0-9_-]+\.(xml|pdf)$/),
        (companyId, year, month, documentType, documentNumber, fileName) => {
          const result = getFiscalFilePath({
            companyId,
            year,
            month,
            documentType,
            documentNumber,
            fileName
          })

          const expectedTypeDir = documentType === 'NF-e' ? 'nfe' : 'nfce'
          const expectedMonth = String(month).padStart(2, '0')
          const expected = `${companyId}/fiscal/${year}/${expectedMonth}/${expectedTypeDir}/${documentNumber}/${fileName}`

          expect(result).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('getFiscalFilePathFromDate extracts year/month from ISO date correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 999 }),
        issueDateArb,
        documentTypeArb,
        fc.stringMatching(/^[0-9]{1,10}$/),
        fc.stringMatching(/^[a-z0-9_-]+\.(xml|pdf)$/),
        (companyId, issueDate, documentType, documentNumber, fileName) => {
          const result = getFiscalFilePathFromDate({
            companyId,
            issueDate,
            documentType,
            documentNumber,
            fileName
          })

          const date = new Date(issueDate)
          const year = date.getFullYear()
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const typeDir = documentType === 'NF-e' ? 'nfe' : 'nfce'

          const expected = `${companyId}/fiscal/${year}/${month}/${typeDir}/${documentNumber}/${fileName}`
          expect(result).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// DB-based property tests
// ---------------------------------------------------------------------------

/**
 * Patches `db.transaction` to work with async callbacks in tests.
 * better-sqlite3 rejects promises from transaction functions, but the
 * service code uses `async (tx) => {...}` for consistency. In tests we
 * wrap the db so that `transaction` just awaits the callback with the db itself.
 */
function patchTransaction(db: ReturnType<typeof drizzle<typeof schema>>): ReturnType<typeof drizzle<typeof schema>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(db as any).transaction = async (fn: (tx: any) => Promise<any>) => {
    // Run the async callback with `db` acting as the tx (synchronous queries still work)
    return fn(db)
  }
  return db
}

describe('FiscalDocumentService DB Properties', () => {
  afterEach(() => {
    mockedGetDb.mockReset()
  })

  // -------------------------------------------------------------------------
  // Property 11: Fiscal document creation copies items faithfully
  // -------------------------------------------------------------------------

  describe('Property 11: Fiscal document creation copies items faithfully', () => {
    /**
     * **Validates: Requirements 4.2**
     *
     * For any sales order with N items, the resulting fiscal document SHALL contain
     * exactly N invoice_items with matching productId, quantity, unitPrice, and taxAmount.
     */
    it('invoice_items match order items in count and field values', async () => {
      const { create } = await import('../fiscal-document-service')

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              quantity: quantityArb,
              unitPrice: positiveAmountArb,
              taxAmount: fc.float({ min: Math.fround(0), max: Math.fround(50), noDefaultInfinity: true, noNaN: true })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          documentTypeArb,
          seriesArb,
          async (items, documentType, series) => {
            // Fresh DB per iteration
            const localSqlite = createTestDb()
            const localDb = patchTransaction(drizzle(localSqlite, { schema }))
            seedCompany(localSqlite, 1)
            seedCustomer(localSqlite, 1, 1)

            // Mock getDb for this iteration
            mockedGetDb.mockReturnValue(localDb)

            try {
              // Create products
              for (let i = 0; i < items.length; i++) {
                seedProduct(localSqlite, 1, i + 1, `Product ${i + 1}`)
              }

              // Compute totals
              const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0)
              const discountAmount = 0
              const taxAmount = items.reduce((sum, it) => sum + it.taxAmount, 0)
              const totalAmount = subtotal - discountAmount + taxAmount

              // Seed order
              seedOrder(localSqlite, {
                id: 1,
                companyId: 1,
                customerId: 1,
                status: 'confirmed',
                subtotal,
                discountAmount,
                taxAmount,
                totalAmount
              })

              // Seed order items
              for (let i = 0; i < items.length; i++) {
                const item = items[i]
                seedOrderItem(localSqlite, {
                  orderId: 1,
                  productId: i + 1,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  discountAmount: 0,
                  taxAmount: item.taxAmount,
                  totalAmount: item.quantity * item.unitPrice - 0 + item.taxAmount
                })
              }

              // Seed document series
              seedDocumentSeries(localSqlite, 1, documentType, series)

              // Create fiscal document
              const result = await create(1, {
                orderId: 1,
                documentType,
                series,
                issueDate: '2024-06-15'
              })

              // Verify item count matches
              expect(result.items).toHaveLength(items.length)

              // Verify each item's fields
              for (let i = 0; i < items.length; i++) {
                const invItem = result.items[i]
                expect(invItem.productId).toBe(i + 1)
                expect(invItem.quantity).toBe(items[i].quantity)
                expect(invItem.unitPrice).toBeCloseTo(items[i].unitPrice, 2)
                expect(invItem.taxAmount).toBeCloseTo(items[i].taxAmount, 2)
              }
            } finally {
              localSqlite.close()
            }
          }
        ),
        { numRuns: 30 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 12: Fiscal document total computation
  // -------------------------------------------------------------------------

  describe('Property 12: Fiscal document total computation', () => {
    /**
     * **Validates: Requirements 4.3, 11.1**
     *
     * For any fiscal document with items, the persisted totalAmount SHALL equal
     * subtotal - discountAmount + taxAmount, where subtotal = sum(qty * unitPrice)
     * and taxAmount = sum(item.taxAmount).
     */
    it('document totalAmount = subtotal - discountAmount + taxAmount', async () => {
      const { create } = await import('../fiscal-document-service')

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              quantity: quantityArb,
              unitPrice: positiveAmountArb,
              taxAmount: fc.float({ min: Math.fround(0), max: Math.fround(50), noDefaultInfinity: true, noNaN: true })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          documentTypeArb,
          async (items, documentType) => {
            const localSqlite = createTestDb()
            const localDb = patchTransaction(drizzle(localSqlite, { schema }))
            seedCompany(localSqlite, 1)
            seedCustomer(localSqlite, 1, 1)

            mockedGetDb.mockReturnValue(localDb)

            try {
              for (let i = 0; i < items.length; i++) {
                seedProduct(localSqlite, 1, i + 1, `Product ${i + 1}`)
              }

              const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0)
              const discountAmount = 0
              const taxAmount = items.reduce((sum, it) => sum + it.taxAmount, 0)
              const totalAmount = subtotal - discountAmount + taxAmount

              seedOrder(localSqlite, {
                id: 1,
                companyId: 1,
                customerId: 1,
                status: 'confirmed',
                subtotal,
                discountAmount,
                taxAmount,
                totalAmount
              })

              for (let i = 0; i < items.length; i++) {
                const item = items[i]
                seedOrderItem(localSqlite, {
                  orderId: 1,
                  productId: i + 1,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  discountAmount: 0,
                  taxAmount: item.taxAmount,
                  totalAmount: item.quantity * item.unitPrice + item.taxAmount
                })
              }

              seedDocumentSeries(localSqlite, 1, documentType, '1')

              const result = await create(1, {
                orderId: 1,
                documentType,
                series: '1',
                issueDate: '2024-06-15'
              })

              // Verify computed totals
              expect(result.subtotal).toBeCloseTo(subtotal, 2)
              expect(result.discountAmount).toBeCloseTo(discountAmount, 2)
              expect(result.taxAmount).toBeCloseTo(taxAmount, 2)
              expect(result.totalAmount).toBeCloseTo(subtotal - discountAmount + taxAmount, 2)
            } finally {
              localSqlite.close()
            }
          }
        ),
        { numRuns: 30 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 14: Duplicate fiscal document rejection
  // -------------------------------------------------------------------------

  describe('Property 14: Duplicate fiscal document rejection', () => {
    /**
     * **Validates: Requirements 4.7**
     *
     * For any sales order that already has an active (non-cancelled) fiscal document
     * of a given type, a subsequent creation request for the same type SHALL be rejected.
     */
    it('rejects second fiscal document of same type for same order', async () => {
      const { create } = await import('../fiscal-document-service')

      await fc.assert(
        fc.asyncProperty(documentTypeArb, seriesArb, async (documentType, series) => {
          const localSqlite = createTestDb()
          const localDb = patchTransaction(drizzle(localSqlite, { schema }))
          seedCompany(localSqlite, 1)
          seedCustomer(localSqlite, 1, 1)
          seedProduct(localSqlite, 1, 1, 'Product 1')

          mockedGetDb.mockReturnValue(localDb)

          try {
            const subtotal = 100
            const totalAmount = 100

            seedOrder(localSqlite, {
              id: 1,
              companyId: 1,
              customerId: 1,
              status: 'confirmed',
              subtotal,
              discountAmount: 0,
              taxAmount: 0,
              totalAmount
            })

            seedOrderItem(localSqlite, {
              orderId: 1,
              productId: 1,
              quantity: 1,
              unitPrice: 100,
              discountAmount: 0,
              taxAmount: 0,
              totalAmount: 100
            })

            seedDocumentSeries(localSqlite, 1, documentType, series)

            // First creation succeeds
            await create(1, {
              orderId: 1,
              documentType,
              series,
              issueDate: '2024-06-15'
            })

            // Second creation of same type should throw
            await expect(
              create(1, {
                orderId: 1,
                documentType,
                series,
                issueDate: '2024-06-15'
              })
            ).rejects.toThrow(DuplicateFiscalDocumentError)
          } finally {
            localSqlite.close()
          }
        }),
        { numRuns: 20 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 17: Fiscal data preservation on cancellation
  // -------------------------------------------------------------------------

  describe('Property 17: Fiscal data preservation on cancellation', () => {
    /**
     * **Validates: Requirements 11.5**
     *
     * For any fiscal document that transitions from "authorized" to "cancelled",
     * the original items, totals, and XML attachment SHALL remain unchanged.
     */
    it('cancellation preserves items, subtotal, taxAmount, totalAmount', async () => {
      const { create, authorize, cancel } = await import('../fiscal-document-service')

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              quantity: quantityArb,
              unitPrice: positiveAmountArb,
              taxAmount: fc.float({ min: Math.fround(0), max: Math.fround(50), noDefaultInfinity: true, noNaN: true })
            }),
            { minLength: 1, maxLength: 3 }
          ),
          documentTypeArb,
          accessKey44Arb,
          async (items, documentType, accessKey) => {
            const localSqlite = createTestDb()
            const localDb = patchTransaction(drizzle(localSqlite, { schema }))
            seedCompany(localSqlite, 1)
            seedCustomer(localSqlite, 1, 1)

            mockedGetDb.mockReturnValue(localDb)

            try {
              for (let i = 0; i < items.length; i++) {
                seedProduct(localSqlite, 1, i + 1, `Product ${i + 1}`)
              }

              const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0)
              const taxAmount = items.reduce((sum, it) => sum + it.taxAmount, 0)
              const totalAmount = subtotal + taxAmount

              seedOrder(localSqlite, {
                id: 1,
                companyId: 1,
                customerId: 1,
                status: 'confirmed',
                subtotal,
                discountAmount: 0,
                taxAmount,
                totalAmount
              })

              for (let i = 0; i < items.length; i++) {
                const item = items[i]
                seedOrderItem(localSqlite, {
                  orderId: 1,
                  productId: i + 1,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  discountAmount: 0,
                  taxAmount: item.taxAmount,
                  totalAmount: item.quantity * item.unitPrice + item.taxAmount
                })
              }

              seedDocumentSeries(localSqlite, 1, documentType, '1')

              // Create fiscal document
              const created = await create(1, {
                orderId: 1,
                documentType,
                series: '1',
                issueDate: '2024-06-15'
              })

              // Authorize
              const authorized = await authorize(1, created.id, {
                accessKey,
                protocolNumber: '123456789012345',
                xmlContent: '<nfe>authorized</nfe>',
                authorizedAt: '2024-06-15T12:00:00.000Z'
              })

              // Capture pre-cancellation state
              const preItems = authorized.items
              const preSubtotal = authorized.subtotal
              const preTaxAmount = authorized.taxAmount
              const preTotalAmount = authorized.totalAmount

              // Cancel
              const cancelled = await cancel(1, created.id, {
                protocolNumber: '987654321098765',
                justification: 'Test cancellation justification for compliance reasons',
                cancelledAt: '2024-06-15T14:00:00.000Z'
              })

              // Verify data preserved
              expect(cancelled.items).toHaveLength(preItems.length)
              expect(cancelled.subtotal).toBeCloseTo(preSubtotal, 2)
              expect(cancelled.taxAmount).toBeCloseTo(preTaxAmount, 2)
              expect(cancelled.totalAmount).toBeCloseTo(preTotalAmount, 2)
              expect(cancelled.status).toBe('cancelled')

              // Verify items unchanged
              for (let i = 0; i < preItems.length; i++) {
                expect(cancelled.items[i].productId).toBe(preItems[i].productId)
                expect(cancelled.items[i].quantity).toBe(preItems[i].quantity)
                expect(cancelled.items[i].unitPrice).toBeCloseTo(preItems[i].unitPrice, 2)
                expect(cancelled.items[i].taxAmount).toBeCloseTo(preItems[i].taxAmount, 2)
              }
            } finally {
              localSqlite.close()
            }
          }
        ),
        { numRuns: 20 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 15: Fiscal document item immutability after draft
  // -------------------------------------------------------------------------

  describe('Property 15: Fiscal document item immutability after draft', () => {
    /**
     * **Validates: Requirements 11.4**
     *
     * For any fiscal document not in "draft" status, the items SHALL remain unchanged
     * through authorize and cancel operations.
     */
    it('authorize and cancel do not modify invoice_items', async () => {
      const { create, authorize, cancel } = await import('../fiscal-document-service')

      await fc.assert(
        fc.asyncProperty(accessKey44Arb, async (accessKey) => {
          const localSqlite = createTestDb()
          const localDb = patchTransaction(drizzle(localSqlite, { schema }))
          seedCompany(localSqlite, 1)
          seedCustomer(localSqlite, 1, 1)
          seedProduct(localSqlite, 1, 1, 'Product A')
          seedProduct(localSqlite, 1, 2, 'Product B')

          mockedGetDb.mockReturnValue(localDb)

          try {
            seedOrder(localSqlite, {
              id: 1,
              companyId: 1,
              customerId: 1,
              status: 'confirmed',
              subtotal: 200,
              discountAmount: 0,
              taxAmount: 20,
              totalAmount: 220
            })

            seedOrderItem(localSqlite, {
              orderId: 1,
              productId: 1,
              quantity: 2,
              unitPrice: 50,
              discountAmount: 0,
              taxAmount: 10,
              totalAmount: 110
            })

            seedOrderItem(localSqlite, {
              orderId: 1,
              productId: 2,
              quantity: 2,
              unitPrice: 50,
              discountAmount: 0,
              taxAmount: 10,
              totalAmount: 110
            })

            seedDocumentSeries(localSqlite, 1, 'NF-e', '1')

            // Create
            const created = await create(1, {
              orderId: 1,
              documentType: 'NF-e',
              series: '1',
              issueDate: '2024-06-15'
            })

            const draftItems = created.items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              taxAmount: it.taxAmount
            }))

            // Authorize — items should not change
            const authorized = await authorize(1, created.id, {
              accessKey,
              protocolNumber: '123456789012345',
              xmlContent: '<nfe>content</nfe>',
              authorizedAt: '2024-06-15T12:00:00.000Z'
            })

            const authorizedItems = authorized.items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              taxAmount: it.taxAmount
            }))

            expect(authorizedItems).toEqual(draftItems)

            // Cancel — items should not change
            const cancelled = await cancel(1, created.id, {
              protocolNumber: '987654321098765',
              justification: 'Test cancellation for property testing validation',
              cancelledAt: '2024-06-15T14:00:00.000Z'
            })

            const cancelledItems = cancelled.items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              taxAmount: it.taxAmount
            }))

            expect(cancelledItems).toEqual(draftItems)
          } finally {
            localSqlite.close()
          }
        }),
        { numRuns: 20 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 19: Access key lookup round-trip
  // -------------------------------------------------------------------------

  describe('Property 19: Access key lookup round-trip', () => {
    /**
     * **Validates: Requirements 7.3**
     *
     * For any authorized fiscal document with a stored access key, searching by that
     * exact access key within the same company SHALL return that document.
     */
    it('searchByAccessKey finds the authorized document', async () => {
      const { create, authorize, searchByAccessKey } = await import('../fiscal-document-service')

      await fc.assert(
        fc.asyncProperty(accessKey44Arb, documentTypeArb, async (accessKey, documentType) => {
          const localSqlite = createTestDb()
          const localDb = patchTransaction(drizzle(localSqlite, { schema }))
          seedCompany(localSqlite, 1)
          seedCustomer(localSqlite, 1, 1)
          seedProduct(localSqlite, 1, 1, 'Product X')

          mockedGetDb.mockReturnValue(localDb)

          try {
            seedOrder(localSqlite, {
              id: 1,
              companyId: 1,
              customerId: 1,
              status: 'confirmed',
              subtotal: 100,
              discountAmount: 0,
              taxAmount: 10,
              totalAmount: 110
            })

            seedOrderItem(localSqlite, {
              orderId: 1,
              productId: 1,
              quantity: 1,
              unitPrice: 100,
              discountAmount: 0,
              taxAmount: 10,
              totalAmount: 110
            })

            seedDocumentSeries(localSqlite, 1, documentType, '1')

            // Create and authorize
            const created = await create(1, {
              orderId: 1,
              documentType,
              series: '1',
              issueDate: '2024-06-15'
            })

            await authorize(1, created.id, {
              accessKey,
              protocolNumber: '123456789012345',
              xmlContent: '<nfe>authorized xml</nfe>',
              authorizedAt: '2024-06-15T12:00:00.000Z'
            })

            // Search by access key
            const found = await searchByAccessKey(1, accessKey)

            expect(found).not.toBeNull()
            expect(found?.id).toBe(created.id)
            expect(found?.accessKey).toBe(accessKey)
            expect(found?.status).toBe('authorized')
          } finally {
            localSqlite.close()
          }
        }),
        { numRuns: 20 }
      )
    })
  })

  // -------------------------------------------------------------------------
  // Property 20: Date range filter correctness
  // -------------------------------------------------------------------------

  describe('Property 20: Date range filter correctness', () => {
    /**
     * **Validates: Requirements 7.5**
     *
     * For any fiscal document list request with start date and end date, all returned
     * documents SHALL have an issue date >= start date AND <= end date. No documents
     * outside the range SHALL appear in results.
     */
    it('list with date range returns only documents within range', async () => {
      const { list } = await import('../fiscal-document-service')

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 12 }),
          async (startMonth, endMonth) => {
            // Ensure startMonth <= endMonth
            const [s, e] = startMonth <= endMonth ? [startMonth, endMonth] : [endMonth, startMonth]

            const localSqlite = createTestDb()
            const localDb = patchTransaction(drizzle(localSqlite, { schema }))
            seedCompany(localSqlite, 1)
            seedCustomer(localSqlite, 1, 1)

            mockedGetDb.mockReturnValue(localDb)

            try {
              // Insert invoices with different issue dates (one per month)
              for (let month = 1; month <= 12; month++) {
                const issueDate = `2024-${String(month).padStart(2, '0')}-15`
                localSqlite
                  .prepare(
                    `INSERT INTO invoices (company_id, customer_id, document_type, document_number, series, issue_date, status, subtotal, discount_amount, tax_amount, total_amount, created_at, updated_at)
                     VALUES (1, 1, 'NF-e', ?, '1', ?, 'draft', 100, 0, 10, 110, ?, ?)`
                  )
                  .run(String(month), issueDate, NOW, NOW)
              }

              const startDate = `2024-${String(s).padStart(2, '0')}-01`
              const endDate = `2024-${String(e).padStart(2, '0')}-28`

              const result = await list(1, {
                startDate,
                endDate,
                limit: 20,
                offset: 0
              })

              // All returned documents should be within range
              for (const doc of result.data) {
                expect(doc.issueDate >= startDate).toBe(true)
                expect(doc.issueDate <= endDate).toBe(true)
              }

              // Count of documents should match months in range
              const expectedCount = e - s + 1
              expect(result.data.length).toBe(expectedCount)
            } finally {
              localSqlite.close()
            }
          }
        ),
        { numRuns: 30 }
      )
    })
  })
})
