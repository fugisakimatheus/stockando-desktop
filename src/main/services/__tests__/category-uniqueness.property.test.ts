/**
 * Property test for category uniqueness constraint enforcement.
 *
 * **Validates: Requirements 1.2**
 *
 * Property 6: Uniqueness constraint enforcement
 * "For any attempt to create a category with a name that already exists for
 * the same company, the operation SHALL be rejected with a conflict error
 * and the database SHALL remain unchanged."
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import { ConflictError } from '../../api/errors'
import * as schema from '../../db/schema'
import { create } from '../category-service'

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

function seedCompany(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (1, 'Test Company', '11111111000100', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

/**
 * Generates a valid category name: non-empty after trimming,
 * printable ASCII characters (avoiding control chars).
 */
const categoryNameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .map((s) => s.replace(/[\x00-\x1f\x7f]/g, 'a'))
  .filter((s) => s.trim().length > 0)

const COMPANY_ID = 1

describe('Category uniqueness constraint enforcement (Property 6)', () => {
  it('rejects duplicate category name with ConflictError and leaves database unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(categoryNameArb, async (name) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompany(sqlite)

        try {
          // First creation should succeed
          const created = await create(COMPANY_ID, { name })
          expect(created.name).toBe(name.trim())
          expect(created.companyId).toBe(COMPANY_ID)

          // Count categories before duplicate attempt
          const countBefore = (
            sqlite.prepare('SELECT COUNT(*) as count FROM categories WHERE company_id = ?').get(COMPANY_ID) as {
              count: number
            }
          ).count
          expect(countBefore).toBe(1)

          // Second creation with same name should throw ConflictError
          await expect(create(COMPANY_ID, { name })).rejects.toThrow(ConflictError)

          // Database remains unchanged — still exactly 1 category with that name
          const countAfterByName = (
            sqlite
              .prepare('SELECT COUNT(*) as count FROM categories WHERE company_id = ? AND name = ?')
              .get(COMPANY_ID, name.trim()) as { count: number }
          ).count
          expect(countAfterByName).toBe(1)

          // Total category count unchanged
          const totalCount = (
            sqlite.prepare('SELECT COUNT(*) as count FROM categories WHERE company_id = ?').get(COMPANY_ID) as {
              count: number
            }
          ).count
          expect(totalCount).toBe(1)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 100 }
    )
  })

  it('rejects duplicate category name regardless of surrounding whitespace', async () => {
    await fc.assert(
      fc.asyncProperty(categoryNameArb, async (name) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)
        seedCompany(sqlite)

        try {
          // Create with the original name
          await create(COMPANY_ID, { name })

          // Attempt with extra whitespace — should still conflict because names are trimmed
          const paddedName = `  ${name.trim()}  `
          await expect(create(COMPANY_ID, { name: paddedName })).rejects.toThrow(ConflictError)

          // Database still has exactly one category
          const totalCount = (
            sqlite.prepare('SELECT COUNT(*) as count FROM categories WHERE company_id = ?').get(COMPANY_ID) as {
              count: number
            }
          ).count
          expect(totalCount).toBe(1)
        } finally {
          sqlite.close()
        }
      }),
      { numRuns: 50 }
    )
  })
})
