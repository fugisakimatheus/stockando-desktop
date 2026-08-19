/**
 * Property test for company data isolation.
 *
 * **Validates: Requirements 8.1, 8.4**
 *
 * Property 5: Company data isolation
 * "For any two distinct companies A and B, and for any catalog or inventory
 * query executed in the context of company A, the results SHALL NOT include
 * records belonging to company B."
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'
import { list as listCategories } from '../category-service'
import { list as listProducts } from '../product-service'

vi.mock('../../server', () => ({
  getDb: vi.fn()
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
    CREATE UNIQUE INDEX categories_company_name_unique ON categories(company_id, name);
    CREATE INDEX categories_parent_category_idx ON categories(parent_category_id);

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
    CREATE INDEX products_category_idx ON products(category_id);
  `)

  return sqlite
}

function seedCompanies(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES
      (1, 'Company A', '11111111000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
      (2, 'Company B', '22222222000200', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

const COMPANY_A = 1
const COMPANY_B = 2

/**
 * Generates a valid category name: non-empty after trimming, printable characters.
 */
const categoryNameArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .map((s) => s.replace(/[\x00-\x1f\x7f]/g, 'a'))
  .filter((s) => s.trim().length > 0)

/**
 * Generates a valid product SKU: alphanumeric with dashes, non-empty.
 */
const skuArb = fc.stringMatching(/^[A-Z0-9\-]{3,20}$/)

/**
 * Generates a valid product name.
 */
const productNameArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .map((s) => s.replace(/[\x00-\x1f\x7f]/g, 'a'))
  .filter((s) => s.trim().length > 0)

describe('Company data isolation (Property 5)', () => {
  it('listing categories for company A returns no records from company B', async () => {
    await fc.assert(
      fc.asyncProperty(categoryNameArb, categoryNameArb, async (nameA, nameB) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanies(sqlite)

        try {
          const now = new Date().toISOString()

          // Insert category for Company A
          sqlite
            .prepare('INSERT INTO categories (company_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
            .run(COMPANY_A, nameA.trim(), 'active', now, now)

          // Insert category for Company B (use nameB, but ensure it doesn't conflict within same company)
          sqlite
            .prepare('INSERT INTO categories (company_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
            .run(COMPANY_B, nameB.trim(), 'active', now, now)

          // List categories for Company A
          const categoriesA = await listCategories(COMPANY_A)

          // Verify no record belongs to Company B
          for (const cat of categoriesA) {
            expect(cat.companyId).toBe(COMPANY_A)
          }

          // Additionally verify the Company B category is NOT present
          const companyBIds = categoriesA.filter((cat) => cat.companyId === COMPANY_B)
          expect(companyBIds).toHaveLength(0)

          // Verify Company A's list only contains records from Company A
          expect(categoriesA.length).toBeGreaterThanOrEqual(1)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })

  it('listing products for company A returns no records from company B', async () => {
    await fc.assert(
      fc.asyncProperty(skuArb, productNameArb, skuArb, productNameArb, async (skuA, nameA, skuB, nameB) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompanies(sqlite)

        try {
          const now = new Date().toISOString()

          // Insert product for Company A
          sqlite
            .prepare(
              `INSERT INTO products (company_id, sku, name, track_inventory, status, created_at, updated_at)
                 VALUES (?, ?, ?, 0, 'active', ?, ?)`
            )
            .run(COMPANY_A, skuA, nameA.trim(), now, now)

          // Insert product for Company B
          sqlite
            .prepare(
              `INSERT INTO products (company_id, sku, name, track_inventory, status, created_at, updated_at)
                 VALUES (?, ?, ?, 0, 'active', ?, ?)`
            )
            .run(COMPANY_B, skuB, nameB.trim(), now, now)

          // List products for Company A
          const result = await listProducts(COMPANY_A, { limit: 100, offset: 0 })

          // Verify no record belongs to Company B
          // The list response contains productListItems, verify via the DB that all ids returned belong to A
          for (const item of result.data) {
            // Verify the product belongs to Company A by checking the database
            const row = sqlite.prepare('SELECT company_id FROM products WHERE id = ?').get(item.id) as
              | { company_id: number }
              | undefined

            expect(row).toBeDefined()
            expect(row?.company_id).toBe(COMPANY_A)
          }

          // Verify we got at least the product we inserted for Company A
          expect(result.data.length).toBeGreaterThanOrEqual(1)

          // Verify that no product from Company B leaked into Company A's list
          const allCompanyBProducts = sqlite.prepare('SELECT id FROM products WHERE company_id = ?').all(COMPANY_B) as {
            id: number
          }[]

          const companyBProductIds = new Set(allCompanyBProducts.map((p) => p.id))
          const leakedProducts = result.data.filter((item) => companyBProductIds.has(item.id))
          expect(leakedProducts).toHaveLength(0)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })
})
