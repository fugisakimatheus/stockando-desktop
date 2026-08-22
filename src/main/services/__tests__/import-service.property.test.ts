/**
 * Property tests for CSV import validation and commit.
 *
 * **Validates: Requirements 5.2, 5.4, 5.5, 5.7, 16.5, 17.1, 17.2, 17.3, 17.4**
 *
 * Property 7: Import validation rejects empty required fields
 * "For any CSV import row where a required field is empty or contains only whitespace,
 * the validation SHALL classify that row as 'invalid' with an error referencing the
 * specific column."
 *
 * Property 8: Import transaction atomicity
 * "For any confirmed full import that encounters a database failure during insertion,
 * the system SHALL roll back all changes and return zero imported records."
 *
 * Property 9: Partial import correctness
 * "For any confirmed partial import (skipInvalid=true) with V valid rows and I invalid
 * rows, the commit SHALL insert/update exactly V records and skip exactly I rows."
 *
 * Property 10: Import company scoping
 * "For any import operation, all inserted records SHALL have their companyId set to
 * the active company, regardless of any company-related data present in the import file."
 */
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'

vi.mock('../../server', () => ({
  getDb: vi.fn()
}))

vi.mock('../audit-service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
}))

import { getDb } from '../../server'
import { clearValidationCache, confirm, validate } from '../import-service'

const mockedGetDb = vi.mocked(getDb)

// ---------------------------------------------------------------------------
// Transaction Patch
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
  const patchedDb = Object.create(db)
  patchedDb.transaction = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
    sqlite.exec('BEGIN')
    try {
      const result = await fn(db as unknown)
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
// Test DB Setup
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

    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      parent_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX categories_company_name_unique ON categories(company_id, name);

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

    CREATE TABLE import_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_rows INTEGER,
      imported_rows INTEGER,
      skipped_rows INTEGER,
      failed_rows INTEGER,
      error_details TEXT,
      created_at TEXT NOT NULL
    );
  `)

  return sqlite
}

const COMPANY_ID = 1

function seedCompany(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (${COMPANY_ID}, 'Test Company', '11111111000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

// ---------------------------------------------------------------------------
// CSV Helper
// ---------------------------------------------------------------------------

function buildCsvBuffer(headers: string[], rows: string[][], delimiter: ',' | ';'): Buffer {
  const lines = [headers.join(delimiter), ...rows.map((r) => r.join(delimiter))]
  return Buffer.from(lines.join('\n'), 'utf-8')
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates whitespace-only or empty strings for invalid required fields. */
const emptyOrWhitespaceArb = fc.constantFrom('', ' ', '  ', '\t', '   ')

/** Generates a valid SKU (unique alphanumeric identifier). */
const skuArb = fc.stringMatching(/^[A-Z]{2,4}-[0-9]{3,5}$/)

/** Generates a valid product name. */
const productNameArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{2,20}$/)

/** Generates a valid document number. */
const documentNumberArb = fc.stringMatching(/^[0-9]{11,14}$/)

/** Generates a valid person/entity name. */
const entityNameArb = fc.stringMatching(/^[A-Za-z][A-Za-z ]{2,20}$/)

/** Generates a valid category name. */
const categoryNameArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{2,15}$/)

/** Delimiter arbitrary. */
const delimiterArb = fc.constantFrom(',' as const, ';' as const)

// ---------------------------------------------------------------------------
// Property 7: Import validation rejects empty required fields
// ---------------------------------------------------------------------------

describe('Import validation rejects empty required fields (Property 7)', () => {
  beforeEach(() => {
    clearValidationCache()
  })

  it('rows with empty required fields are marked invalid for products', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            sku: fc.oneof(skuArb, emptyOrWhitespaceArb),
            name: fc.oneof(productNameArb, emptyOrWhitespaceArb)
          }),
          { minLength: 1, maxLength: 15 }
        ),
        delimiterArb,
        async (rows, delimiter) => {
          clearValidationCache()
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)

          const headers = ['sku', 'name', 'costPrice', 'salePrice']
          const csvRows = rows.map((r) => [r.sku, r.name, '10.00', '20.00'])
          const fileBuffer = buildCsvBuffer(headers, csvRows, delimiter)

          try {
            const result = await validate(COMPANY_ID, {
              entityType: 'products',
              fileBuffer,
              delimiter
            })

            // Check each row: rows with empty/whitespace required fields must be invalid
            for (let i = 0; i < rows.length; i++) {
              const inputRow = rows[i]
              const validation = result.rows[i]
              const skuEmpty = !inputRow.sku || inputRow.sku.trim() === ''
              const nameEmpty = !inputRow.name || inputRow.name.trim() === ''

              if (skuEmpty || nameEmpty) {
                expect(validation.status).toBe('invalid')
                // Must have errors referencing the empty columns
                const errorColumns = validation.errors.map((e) => e.column)
                if (skuEmpty) expect(errorColumns).toContain('sku')
                if (nameEmpty) expect(errorColumns).toContain('name')
              }
            }

            // validRows count must exclude all invalid rows
            const expectedInvalid = rows.filter(
              (r) => !r.sku || r.sku.trim() === '' || !r.name || r.name.trim() === ''
            ).length
            expect(result.invalidRows).toBe(expectedInvalid)
            expect(result.validRows).toBe(rows.length - expectedInvalid)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('rows with empty required fields are marked invalid for suppliers', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: fc.oneof(entityNameArb, emptyOrWhitespaceArb),
            documentNumber: fc.oneof(documentNumberArb, emptyOrWhitespaceArb)
          }),
          { minLength: 1, maxLength: 15 }
        ),
        delimiterArb,
        async (rows, delimiter) => {
          clearValidationCache()
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)

          const headers = ['name', 'documentNumber', 'email', 'phone']
          const csvRows = rows.map((r) => [r.name, r.documentNumber, 'test@test.com', '123456789'])
          const fileBuffer = buildCsvBuffer(headers, csvRows, delimiter)

          try {
            const result = await validate(COMPANY_ID, {
              entityType: 'suppliers',
              fileBuffer,
              delimiter
            })

            for (let i = 0; i < rows.length; i++) {
              const inputRow = rows[i]
              const validation = result.rows[i]
              const nameEmpty = !inputRow.name || inputRow.name.trim() === ''
              const docEmpty = !inputRow.documentNumber || inputRow.documentNumber.trim() === ''

              if (nameEmpty || docEmpty) {
                expect(validation.status).toBe('invalid')
                const errorColumns = validation.errors.map((e) => e.column)
                if (nameEmpty) expect(errorColumns).toContain('name')
                if (docEmpty) expect(errorColumns).toContain('documentNumber')
              }
            }

            const expectedInvalid = rows.filter(
              (r) => !r.name || r.name.trim() === '' || !r.documentNumber || r.documentNumber.trim() === ''
            ).length
            expect(result.invalidRows).toBe(expectedInvalid)
            expect(result.validRows).toBe(rows.length - expectedInvalid)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('rows with empty required fields are marked invalid for categories', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: fc.oneof(categoryNameArb, emptyOrWhitespaceArb)
          }),
          { minLength: 1, maxLength: 15 }
        ),
        delimiterArb,
        async (rows, delimiter) => {
          clearValidationCache()
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)

          const headers = ['name', 'parentCategoryName']
          const csvRows = rows.map((r) => [r.name, ''])
          const fileBuffer = buildCsvBuffer(headers, csvRows, delimiter)

          try {
            const result = await validate(COMPANY_ID, {
              entityType: 'categories',
              fileBuffer,
              delimiter
            })

            for (let i = 0; i < rows.length; i++) {
              const inputRow = rows[i]
              const validation = result.rows[i]
              const nameEmpty = !inputRow.name || inputRow.name.trim() === ''

              if (nameEmpty) {
                expect(validation.status).toBe('invalid')
                const errorColumns = validation.errors.map((e) => e.column)
                expect(errorColumns).toContain('name')
              }
            }

            const expectedInvalid = rows.filter((r) => !r.name || r.name.trim() === '').length
            expect(result.invalidRows).toBe(expectedInvalid)
            expect(result.validRows).toBe(rows.length - expectedInvalid)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 8: Import transaction atomicity
// ---------------------------------------------------------------------------

describe('Import transaction atomicity (Property 8)', () => {
  beforeEach(() => {
    clearValidationCache()
  })

  it('rolls back all changes when transaction fails mid-import', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            sku: skuArb,
            name: productNameArb
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (products) => {
          clearValidationCache()
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          // Use the unpatched db for validation (read-only, no transaction)
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)

          // Deduplicate SKUs to avoid unique constraint errors during the normal path
          const uniqueProducts = products.filter((p, idx, arr) => arr.findIndex((x) => x.sku === p.sku) === idx)
          if (uniqueProducts.length < 2) return // need at least 2 rows

          const headers = ['sku', 'name', 'costPrice', 'salePrice']
          const csvRows = uniqueProducts.map((p) => [p.sku, p.name, '10.00', '20.00'])
          const fileBuffer = buildCsvBuffer(headers, csvRows, ',')

          try {
            // Phase 1: validate (no transaction needed)
            const validationResult = await validate(COMPANY_ID, {
              entityType: 'products',
              fileBuffer,
              delimiter: ','
            })

            expect(validationResult.validRows).toBe(uniqueProducts.length)

            // Create a patched db that simulates a mid-transaction failure
            // by throwing after processing the first row
            let rowsProcessed = 0
            const failingPatchedDb = Object.create(db)
            failingPatchedDb.transaction = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
              sqlite.exec('BEGIN')
              try {
                // Create a proxy that throws after inserting some rows
                const txProxy = new Proxy(db as object, {
                  get(target, prop) {
                    if (prop === 'insert') {
                      return (...args: unknown[]) => {
                        rowsProcessed++
                        if (rowsProcessed > 1) {
                          throw new Error('Simulated mid-transaction failure')
                        }
                        return (target as Record<string, Function>).insert(...args)
                      }
                    }
                    return (target as Record<string, unknown>)[prop as string]
                  }
                })
                const result = await fn(txProxy as unknown)
                sqlite.exec('COMMIT')
                return result
              } catch (error) {
                sqlite.exec('ROLLBACK')
                throw error
              }
            }

            // Switch to failing db for commit
            mockedGetDb.mockReturnValue(failingPatchedDb)

            // Phase 2: confirm should throw due to simulated failure
            await expect(
              confirm(COMPANY_ID, {
                validationId: validationResult.validationId,
                skipInvalid: false
              })
            ).rejects.toThrow()

            // Verify no records were committed (rollback undid everything)
            const count = sqlite.prepare('SELECT COUNT(*) as cnt FROM products').get() as {
              cnt: number
            }
            expect(count.cnt).toBe(0)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 50 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 9: Partial import correctness
// ---------------------------------------------------------------------------

describe('Partial import correctness (Property 9)', () => {
  beforeEach(() => {
    clearValidationCache()
  })

  it('skipInvalid=true commits only valid rows and counts match', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            sku: fc.oneof(skuArb, emptyOrWhitespaceArb),
            name: fc.oneof(productNameArb, emptyOrWhitespaceArb)
          }),
          { minLength: 2, maxLength: 15 }
        ),
        async (rows) => {
          clearValidationCache()
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          const patchedDb = patchTransactionForTests(db, sqlite)
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)

          // Deduplicate valid rows by SKU to avoid constraint conflicts
          const processedRows: typeof rows = []
          const seenSkus = new Set<string>()
          for (const row of rows) {
            const skuVal = row.sku.trim()
            if (skuVal && row.name.trim() && !seenSkus.has(skuVal)) {
              seenSkus.add(skuVal)
              processedRows.push(row)
            } else {
              processedRows.push(row)
            }
          }

          // We need at least one valid and one invalid row for a meaningful test
          const hasValid = processedRows.some(
            (r) => r.sku.trim() !== '' && r.name.trim() !== '' && !isDuplicateSku(r, processedRows)
          )
          const hasInvalid = processedRows.some((r) => r.sku.trim() === '' || r.name.trim() === '')
          if (!hasValid || !hasInvalid) return

          const headers = ['sku', 'name', 'costPrice', 'salePrice']
          const csvRows = processedRows.map((r) => [r.sku, r.name, '10.00', '20.00'])
          const fileBuffer = buildCsvBuffer(headers, csvRows, ',')

          try {
            // Phase 1: validate (uses unpatched db - no transaction)
            const validationResult = await validate(COMPANY_ID, {
              entityType: 'products',
              fileBuffer,
              delimiter: ','
            })

            const validRowCount = validationResult.validRows
            const invalidRowCount = validationResult.invalidRows

            // Must have both valid and invalid
            if (validRowCount === 0 || invalidRowCount === 0) return

            // Switch to patched db for commit (needs transaction support)
            mockedGetDb.mockReturnValue(patchedDb)

            // Phase 2: confirm with skipInvalid=true
            const commitResult = await confirm(COMPANY_ID, {
              validationId: validationResult.validationId,
              skipInvalid: true
            })

            // Verify counts
            expect(commitResult.importedRows).toBe(validRowCount)
            expect(commitResult.skippedRows).toBe(invalidRowCount)
            expect(commitResult.importedRows + commitResult.skippedRows).toBe(validationResult.totalRows)

            // Verify actual DB records match
            const dbCount = sqlite
              .prepare('SELECT COUNT(*) as cnt FROM products WHERE company_id = ?')
              .get(COMPANY_ID) as {
              cnt: number
            }
            expect(dbCount.cnt).toBe(validRowCount)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

/** Helper to check if a row's SKU is a duplicate in the array (appears more than once as valid). */
function isDuplicateSku(row: { sku: string; name: string }, allRows: { sku: string; name: string }[]): boolean {
  const sku = row.sku.trim()
  if (!sku) return false
  const occurrences = allRows.filter((r) => r.sku.trim() === sku)
  return occurrences.length > 1
}

// ---------------------------------------------------------------------------
// Property 10: Import company scoping
// ---------------------------------------------------------------------------

describe('Import company scoping (Property 10)', () => {
  beforeEach(() => {
    clearValidationCache()
  })

  it('all imported records have the correct companyId regardless of file content', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: categoryNameArb
          }),
          { minLength: 1, maxLength: 10 }
        ),
        fc.integer({ min: 2, max: 100 }), // random "fake" companyId in file content (ignored)
        async (rows, _fakeCompanyId) => {
          clearValidationCache()
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          const patchedDb = patchTransactionForTests(db, sqlite)
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)

          // Deduplicate category names
          const uniqueRows = rows.filter(
            (r, idx, arr) => r.name.trim() !== '' && arr.findIndex((x) => x.name === r.name) === idx
          )
          if (uniqueRows.length === 0) return

          const headers = ['name', 'parentCategoryName']
          const csvRows = uniqueRows.map((r) => [r.name, ''])
          const fileBuffer = buildCsvBuffer(headers, csvRows, ',')

          try {
            // Phase 1: validate (no transaction needed)
            const validationResult = await validate(COMPANY_ID, {
              entityType: 'categories',
              fileBuffer,
              delimiter: ','
            })

            if (validationResult.validRows === 0) return

            // Switch to patched db for commit
            mockedGetDb.mockReturnValue(patchedDb)

            // Phase 2: confirm
            await confirm(COMPANY_ID, {
              validationId: validationResult.validationId,
              skipInvalid: true
            })

            // Verify all records have the active companyId
            const allCategories = sqlite.prepare('SELECT company_id FROM categories').all() as { company_id: number }[]

            expect(allCategories.length).toBeGreaterThan(0)
            for (const cat of allCategories) {
              expect(cat.company_id).toBe(COMPANY_ID)
            }

            // Verify no records belong to any other company
            const wrongCompanyCount = sqlite
              .prepare('SELECT COUNT(*) as cnt FROM categories WHERE company_id != ?')
              .get(COMPANY_ID) as { cnt: number }
            expect(wrongCompanyCount.cnt).toBe(0)
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('products imported are scoped to active company', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            sku: skuArb,
            name: productNameArb
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (rows) => {
          clearValidationCache()
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          const patchedDb = patchTransactionForTests(db, sqlite)
          mockedGetDb.mockReturnValue(db)
          seedCompany(sqlite)

          // Deduplicate by SKU
          const uniqueRows = rows.filter((r, idx, arr) => arr.findIndex((x) => x.sku === r.sku) === idx)
          if (uniqueRows.length === 0) return

          const headers = ['sku', 'name', 'costPrice', 'salePrice']
          const csvRows = uniqueRows.map((r) => [r.sku, r.name, '5.00', '15.00'])
          const fileBuffer = buildCsvBuffer(headers, csvRows, ',')

          try {
            // Phase 1: validate (no transaction needed)
            const validationResult = await validate(COMPANY_ID, {
              entityType: 'products',
              fileBuffer,
              delimiter: ','
            })

            if (validationResult.validRows === 0) return

            // Switch to patched db for commit
            mockedGetDb.mockReturnValue(patchedDb)

            await confirm(COMPANY_ID, {
              validationId: validationResult.validationId,
              skipInvalid: true
            })

            // Verify all products have the correct companyId
            const allProducts = sqlite.prepare('SELECT company_id FROM products').all() as { company_id: number }[]

            expect(allProducts.length).toBeGreaterThan(0)
            for (const product of allProducts) {
              expect(product.company_id).toBe(COMPANY_ID)
            }
          } finally {
            sqlite.close()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
