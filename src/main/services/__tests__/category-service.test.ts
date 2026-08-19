/**
 * Unit tests for the CategoryService.
 *
 * Tests cover:
 * - Listing categories scoped to a company
 * - Creating a category with validation
 * - Handling duplicate name conflict
 * - Validating parent category existence and company scope
 * - Updating a category with all fields
 * - Deleting a category (success and rejection when referenced)
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 8.1, 8.2, 8.4**
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../../db/schema'
import { create, deleteCategory, list, update } from '../category-service'

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

describe('CategoryService', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = createTestDb()
    const db = drizzle(sqlite, { schema })
    mockedGetDb.mockReturnValue(db)
    seedCompanies(sqlite)
  })

  afterEach(() => {
    sqlite.close()
  })

  describe('list', () => {
    it('should return all categories for the given company', async () => {
      sqlite.exec(`
        INSERT INTO categories (company_id, name, status, created_at, updated_at)
        VALUES
          (1, 'Electronics', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
          (1, 'Clothing', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
          (2, 'Food', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
      `)

      const result = await list(1)
      expect(result).toHaveLength(2)
      expect(result.map((c) => c.name).sort()).toEqual(['Clothing', 'Electronics'])
    })

    it('should return empty array when company has no categories', async () => {
      const result = await list(1)
      expect(result).toHaveLength(0)
    })

    it('should not return categories from other companies (requirement 8.1)', async () => {
      sqlite.exec(`
        INSERT INTO categories (company_id, name, status, created_at, updated_at)
        VALUES (2, 'Other Company Category', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
      `)

      const result = await list(1)
      expect(result).toHaveLength(0)
    })
  })

  describe('create', () => {
    it('should create a category with valid input', async () => {
      const result = await create(1, { name: 'Electronics' })

      expect(result.id).toBeDefined()
      expect(result.companyId).toBe(1)
      expect(result.name).toBe('Electronics')
      expect(result.parentCategoryId).toBeNull()
      expect(result.status).toBe('active')
      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('should create a category with a valid parent category', async () => {
      const parent = await create(1, { name: 'Electronics' })
      const child = await create(1, { name: 'Smartphones', parentCategoryId: parent.id })

      expect(child.parentCategoryId).toBe(parent.id)
    })

    it('should reject creation with empty name', async () => {
      await expect(create(1, { name: '' })).rejects.toThrow('Category name is required')
    })

    it('should reject creation with whitespace-only name', async () => {
      await expect(create(1, { name: '   ' })).rejects.toThrow('Category name is required')
    })

    it('should reject duplicate name within the same company (requirement 1.2)', async () => {
      await create(1, { name: 'Electronics' })

      await expect(create(1, { name: 'Electronics' })).rejects.toThrow(
        'A category with name "Electronics" already exists'
      )
    })

    it('should allow same name in different companies', async () => {
      await create(1, { name: 'Electronics' })
      const result = await create(2, { name: 'Electronics' })

      expect(result.name).toBe('Electronics')
      expect(result.companyId).toBe(2)
    })

    it('should reject when parent category does not exist', async () => {
      await expect(create(1, { name: 'Child', parentCategoryId: 999 })).rejects.toThrow('Parent category not found')
    })

    it('should reject when parent category belongs to another company (requirement 8.2)', async () => {
      const otherCompanyCategory = await create(2, { name: 'Other' })

      await expect(create(1, { name: 'Child', parentCategoryId: otherCompanyCategory.id })).rejects.toThrow(
        'Parent category not found'
      )
    })

    it('should trim the category name', async () => {
      const result = await create(1, { name: '  Electronics  ' })
      expect(result.name).toBe('Electronics')
    })
  })

  describe('update', () => {
    it('should update category name', async () => {
      const category = await create(1, { name: 'Electronics' })

      // Small delay to ensure timestamp differs
      await new Promise((resolve) => setTimeout(resolve, 10))

      const updated = await update(1, category.id, { name: 'Consumer Electronics' })

      expect(updated.name).toBe('Consumer Electronics')
      expect(updated.updatedAt >= category.updatedAt).toBe(true)
    })

    it('should update category status', async () => {
      const category = await create(1, { name: 'Electronics' })
      const updated = await update(1, category.id, { status: 'inactive' })

      expect(updated.status).toBe('inactive')
    })

    it('should update parent category', async () => {
      const parent = await create(1, { name: 'Electronics' })
      const child = await create(1, { name: 'Smartphones' })
      const updated = await update(1, child.id, { parentCategoryId: parent.id })

      expect(updated.parentCategoryId).toBe(parent.id)
    })

    it('should allow setting parent category to null', async () => {
      const parent = await create(1, { name: 'Electronics' })
      const child = await create(1, { name: 'Smartphones', parentCategoryId: parent.id })
      const updated = await update(1, child.id, { parentCategoryId: null })

      expect(updated.parentCategoryId).toBeNull()
    })

    it('should throw NotFoundError when category does not exist', async () => {
      await expect(update(1, 999, { name: 'New Name' })).rejects.toThrow('Category not found')
    })

    it('should throw NotFoundError when category belongs to another company (requirement 8.4)', async () => {
      const category = await create(2, { name: 'Other' })

      await expect(update(1, category.id, { name: 'Hacked' })).rejects.toThrow('Category not found')
    })

    it('should reject update with duplicate name in same company', async () => {
      await create(1, { name: 'Electronics' })
      const category = await create(1, { name: 'Clothing' })

      await expect(update(1, category.id, { name: 'Electronics' })).rejects.toThrow(
        'A category with name "Electronics" already exists'
      )
    })

    it('should reject update with empty name', async () => {
      const category = await create(1, { name: 'Electronics' })

      await expect(update(1, category.id, { name: '' })).rejects.toThrow('Category name cannot be empty')
    })

    it('should reject update with invalid parent category', async () => {
      const category = await create(1, { name: 'Electronics' })

      await expect(update(1, category.id, { parentCategoryId: 999 })).rejects.toThrow('Parent category not found')
    })
  })

  describe('deleteCategory', () => {
    it('should delete a category with no product references (requirement 1.7)', async () => {
      const category = await create(1, { name: 'Electronics' })

      await deleteCategory(1, category.id)

      const result = await list(1)
      expect(result).toHaveLength(0)
    })

    it('should throw NotFoundError when category does not exist', async () => {
      await expect(deleteCategory(1, 999)).rejects.toThrow('Category not found')
    })

    it('should throw NotFoundError when category belongs to another company', async () => {
      const category = await create(2, { name: 'Other' })

      await expect(deleteCategory(1, category.id)).rejects.toThrow('Category not found')
    })

    it('should reject deletion when products reference the category (requirement 1.6)', async () => {
      const category = await create(1, { name: 'Electronics' })

      sqlite.exec(`
        INSERT INTO products (company_id, category_id, sku, name, track_inventory, status, created_at, updated_at)
        VALUES (1, ${category.id}, 'SKU-001', 'Test Product', 0, 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
      `)

      await expect(deleteCategory(1, category.id)).rejects.toThrow(
        'Cannot delete category because it is referenced by products'
      )
    })

    it('should allow deletion when products reference different category', async () => {
      const category1 = await create(1, { name: 'Electronics' })
      const category2 = await create(1, { name: 'Clothing' })

      sqlite.exec(`
        INSERT INTO products (company_id, category_id, sku, name, track_inventory, status, created_at, updated_at)
        VALUES (1, ${category2.id}, 'SKU-001', 'Test Product', 0, 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
      `)

      await deleteCategory(1, category1.id)

      const result = await list(1)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Clothing')
    })
  })
})
