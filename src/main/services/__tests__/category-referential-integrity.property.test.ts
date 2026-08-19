/**
 * Property test for referential integrity on category deletion.
 *
 * **Validates: Requirements 1.6**
 *
 * Property 8: Referential integrity on deletion
 * "For any category that is referenced by products as their categoryId,
 * deletion SHALL be rejected and the database SHALL remain unchanged."
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import { EntityReferencedError } from '../../api/errors'
import * as schema from '../../db/schema'
import { create, deleteCategory, list } from '../category-service'

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
    CREATE UNIQUE INDEX companies_document_number_unique ON companies(document_number);

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

    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (1, 'Test Company', '11111111000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)

  return sqlite
}

/**
 * Generates a valid category name (alphabetic + spaces, non-empty after trim, unique-friendly).
 */
const categoryNameArb = fc
  .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '.split('')), {
    minLength: 1,
    maxLength: 30
  })
  .map((chars) => chars.join(''))
  .filter((s) => s.trim().length > 0)

/**
 * Generates a valid product SKU (alphanumeric + dashes, non-empty).
 */
const skuArb = fc
  .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-'.split('')), {
    minLength: 3,
    maxLength: 20
  })
  .map((chars) => chars.join(''))
  .filter((s) => s.trim().length >= 3)

/**
 * Generates a valid product name.
 */
const productNameArb = fc
  .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '.split('')), {
    minLength: 1,
    maxLength: 40
  })
  .map((chars) => chars.join(''))
  .filter((s) => s.trim().length > 0)

const COMPANY_ID = 1

describe('Referential integrity on deletion — categories (Property 8)', () => {
  it('rejects deletion of a category referenced by products and leaves database unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(categoryNameArb, productNameArb, skuArb, async (catName, prodName, sku) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)

        try {
          // Create a category
          const category = await create(COMPANY_ID, { name: catName })

          // Insert a product that references this category
          sqlite.exec(`
            INSERT INTO products (company_id, category_id, sku, name, track_inventory, status, created_at, updated_at)
            VALUES (
              ${COMPANY_ID},
              ${category.id},
              '${sku.replace(/'/g, "''")}',
              '${prodName.replace(/'/g, "''")}',
              0,
              'active',
              '2024-01-01T00:00:00.000Z',
              '2024-01-01T00:00:00.000Z'
            );
          `)

          // Count categories before deletion attempt
          const countBefore = (sqlite.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number })
            .count

          // Attempt to delete the referenced category — should throw EntityReferencedError
          await expect(deleteCategory(COMPANY_ID, category.id)).rejects.toThrow(EntityReferencedError)

          // Verify database remains unchanged — category still exists
          const countAfter = (sqlite.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number })
            .count
          expect(countAfter).toBe(countBefore)

          // Verify the specific category still exists with its original data
          const row = sqlite.prepare('SELECT id, name FROM categories WHERE id = ?').get(category.id) as
            | { id: number; name: string }
            | undefined
          expect(row).toBeDefined()
          expect(row?.name).toBe(catName.trim())
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 100 }
    )
  })

  it('allows deletion of a category with no product references', async () => {
    await fc.assert(
      fc.asyncProperty(categoryNameArb, async (catName) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)

        try {
          // Create a category with no product references
          const category = await create(COMPANY_ID, { name: catName })

          // Verify it exists
          const categoriesBefore = await list(COMPANY_ID)
          expect(categoriesBefore.some((c) => c.id === category.id)).toBe(true)

          // Delete should succeed
          await deleteCategory(COMPANY_ID, category.id)

          // Verify it no longer exists
          const categoriesAfter = await list(COMPANY_ID)
          expect(categoriesAfter.some((c) => c.id === category.id)).toBe(false)

          // Verify the row is gone from the database
          const row = sqlite.prepare('SELECT id FROM categories WHERE id = ?').get(category.id) as
            | { id: number }
            | undefined
          expect(row).toBeUndefined()
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 100 }
    )
  })
})
