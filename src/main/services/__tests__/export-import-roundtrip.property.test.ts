/**
 * Property test for export-import round-trip compatibility.
 *
 * **Validates: Requirements 6.3**
 *
 * Property 6: CSV export round-trip compatibility
 * "For any entity type supporting both import and export, exporting all records
 * of that type and then importing the resulting CSV file SHALL produce an
 * ImportValidationResult with zero invalid rows and all rows classified as
 * updates (matching existing records)."
 *
 * Test logic:
 * 1. Seed the database with random products (using fast-check)
 * 2. Call exportEntities(companyId, { entityType: 'products' }) to export
 * 3. Read the exported file content
 * 4. Strip the UTF-8 BOM
 * 5. Call validate(companyId, { entityType: 'products', fileBuffer: exportedContent, delimiter: ';' })
 * 6. Verify: validationResult.invalidRows === 0 (all rows are valid for re-import)
 * 7. Verify: validationResult.validRows === number of exported records
 */
import { readFileSync, rmSync } from 'node:fs'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../server', () => ({
  getDb: vi.fn()
}))

vi.mock('../audit-service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-roundtrip-exports')
  }
}))

import { getDb } from '../../server'
import { exportEntities } from '../export-service'
import { clearValidationCache, validate } from '../import-service'

const mockedGetDb = vi.mocked(getDb)

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
const NOW = '2024-06-15T12:00:00.000Z'

function seedCompany(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (${COMPANY_ID}, 'Test Company', '11111111000100', 'active', '${NOW}', '${NOW}');
  `)
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  try {
    rmSync('/tmp/test-roundtrip-exports', { recursive: true, force: true })
  } catch {
    // ignore cleanup errors
  }
})

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a valid SKU (unique alphanumeric identifier). */
const skuArb = fc.stringMatching(/^[A-Z]{2,4}-[0-9]{3,5}$/)

/** Generates a valid product name (no semicolons, quotes, or newlines to avoid CSV ambiguity). */
const productNameArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{2,20}$/)

/** Generates a valid cost/sale price. */
const priceArb = fc.double({ min: 0.01, max: 99999.99, noNaN: true })

/** Generates a valid barcode (optional). */
const barcodeArb = fc.option(fc.stringMatching(/^[0-9]{8,13}$/), { nil: null })

/** Generates a complete product record suitable for seeding. */
const productArb = fc.record({
  sku: skuArb,
  name: productNameArb,
  costPrice: priceArb,
  salePrice: priceArb,
  barcode: barcodeArb
})

// ---------------------------------------------------------------------------
// Property 6: CSV export round-trip compatibility
// ---------------------------------------------------------------------------

describe('CSV export round-trip compatibility (Property 6)', () => {
  beforeEach(() => {
    clearValidationCache()
  })

  it('exported products CSV can be validated by ImportService with zero invalid rows', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(productArb, { minLength: 1, maxLength: 20 }), async (productsData) => {
        clearValidationCache()
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompany(sqlite)

        // Deduplicate by SKU (unique constraint)
        const uniqueProducts = productsData.filter((p, idx, arr) => arr.findIndex((x) => x.sku === p.sku) === idx)

        if (uniqueProducts.length === 0) return

        // Seed products into the database
        for (const product of uniqueProducts) {
          sqlite.exec(`
              INSERT INTO products (company_id, sku, name, cost_price, sale_price, barcode, track_inventory, status, created_at, updated_at)
              VALUES (
                ${COMPANY_ID},
                '${product.sku}',
                '${product.name.replace(/'/g, "''")}',
                ${product.costPrice},
                ${product.salePrice},
                ${product.barcode ? `'${product.barcode}'` : 'NULL'},
                0,
                'active',
                '${NOW}',
                '${NOW}'
              );
            `)
        }

        try {
          // Step 1: Export entities
          const exportResult = await exportEntities(COMPANY_ID, {
            entityType: 'products'
          })

          expect(exportResult.recordCount).toBe(uniqueProducts.length)

          // Step 2: Read the exported file content
          const fileContent = readFileSync(exportResult.filePath)

          // Step 3: Strip the UTF-8 BOM (first 3 bytes: EF BB BF)
          // The validate function receives a Buffer, so we strip BOM bytes directly
          const hasBom = fileContent[0] === 0xef && fileContent[1] === 0xbb && fileContent[2] === 0xbf
          const contentWithoutBom = hasBom ? fileContent.subarray(3) : fileContent

          // Step 4: Validate the exported content through ImportService
          const validationResult = await validate(COMPANY_ID, {
            entityType: 'products',
            fileBuffer: Buffer.from(contentWithoutBom),
            delimiter: ';'
          })

          // Step 5: Verify zero invalid rows
          expect(validationResult.invalidRows).toBe(0)

          // Step 6: Verify valid rows match exported record count
          expect(validationResult.validRows).toBe(uniqueProducts.length)

          // Step 7: All rows should be classified as updates (records already exist)
          expect(validationResult.expectedChanges.updates).toBe(uniqueProducts.length)
          expect(validationResult.expectedChanges.creates).toBe(0)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 100 }
    )
  })
})
