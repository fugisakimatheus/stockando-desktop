/**
 * Unit tests for the WarehouseService.
 *
 * Tests cover:
 * - Listing warehouses scoped to a company
 * - Creating a warehouse with all required fields
 * - Rejecting duplicate warehouse codes with ConflictError
 * - Updating an existing warehouse
 * - Returning NotFoundError when updating/deleting a non-existent warehouse
 * - Preventing deletion when non-zero stock exists (EntityReferencedError)
 * - Successful deletion when no non-zero stock
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 8.1, 8.4**
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConflictError, EntityReferencedError, NotFoundError } from '../../api/errors'
import * as schema from '../../db/schema'
import { create, deleteWarehouse, list, update } from '../warehouse-service'

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
    CREATE INDEX warehouses_company_idx ON warehouses(company_id);

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
    CREATE INDEX stock_product_idx ON stock(product_id);
    CREATE INDEX stock_warehouse_idx ON stock(warehouse_id);
  `)

  return sqlite
}

function seedCompany(sqlite: Database.Database, id = 1): void {
  sqlite.exec(`
    INSERT INTO companies (id, name, document_number, status, created_at, updated_at)
    VALUES (${id}, 'Company ${id}', '1234567800010${id}', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
  `)
}

describe('WarehouseService', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = createTestDb()
    const db = drizzle(sqlite, { schema })
    mockedGetDb.mockReturnValue(db)
    seedCompany(sqlite, 1)
    seedCompany(sqlite, 2)
  })

  afterEach(() => {
    sqlite.close()
  })

  describe('list', () => {
    it('should return all warehouses for a given company', async () => {
      sqlite.exec(`
        INSERT INTO warehouses (company_id, name, code, status, created_at, updated_at)
        VALUES (1, 'Warehouse A', 'WH-A', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
        INSERT INTO warehouses (company_id, name, code, status, created_at, updated_at)
        VALUES (1, 'Warehouse B', 'WH-B', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
        INSERT INTO warehouses (company_id, name, code, status, created_at, updated_at)
        VALUES (2, 'Other Warehouse', 'WH-X', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
      `)

      const result = await list(1)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Warehouse A')
      expect(result[1].name).toBe('Warehouse B')
    })

    it('should return empty array when company has no warehouses', async () => {
      const result = await list(1)
      expect(result).toHaveLength(0)
    })

    it('should not return warehouses from another company (company isolation)', async () => {
      sqlite.exec(`
        INSERT INTO warehouses (company_id, name, code, status, created_at, updated_at)
        VALUES (2, 'Other Warehouse', 'WH-X', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
      `)

      const result = await list(1)
      expect(result).toHaveLength(0)
    })
  })

  describe('create', () => {
    it('should create a warehouse with required fields', async () => {
      const result = await create(1, { name: 'Main Warehouse', code: 'MAIN' })

      expect(result.id).toBeDefined()
      expect(result.companyId).toBe(1)
      expect(result.name).toBe('Main Warehouse')
      expect(result.code).toBe('MAIN')
      expect(result.status).toBe('active')
      expect(result.address).toBeNull()
      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('should create a warehouse with optional address', async () => {
      const result = await create(1, {
        name: 'Main Warehouse',
        code: 'MAIN',
        address: '123 Storage St'
      })

      expect(result.address).toBe('123 Storage St')
    })

    it('should throw ConflictError when code already exists for the same company', async () => {
      await create(1, { name: 'First', code: 'WH-01' })

      await expect(create(1, { name: 'Second', code: 'WH-01' })).rejects.toThrow(ConflictError)
    })

    it('should allow the same code in different companies', async () => {
      await create(1, { name: 'Company 1 WH', code: 'SHARED' })
      const result = await create(2, { name: 'Company 2 WH', code: 'SHARED' })

      expect(result.companyId).toBe(2)
      expect(result.code).toBe('SHARED')
    })
  })

  describe('update', () => {
    it('should update warehouse name', async () => {
      sqlite.exec(`
        INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
        VALUES (1, 1, 'Old Name', 'WH-01', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
      `)

      const result = await update(1, 1, { name: 'New Name' })

      expect(result.name).toBe('New Name')
      expect(result.code).toBe('WH-01')
      expect(result.updatedAt).not.toBe('2024-01-01T00:00:00.000Z')
    })

    it('should update warehouse status', async () => {
      sqlite.exec(`
        INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
        VALUES (1, 1, 'Warehouse', 'WH-01', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
      `)

      const result = await update(1, 1, { status: 'inactive' })

      expect(result.status).toBe('inactive')
    })

    it('should throw NotFoundError when warehouse does not exist', async () => {
      await expect(update(1, 999, { name: 'New Name' })).rejects.toThrow(NotFoundError)
    })

    it('should throw NotFoundError when warehouse belongs to another company', async () => {
      sqlite.exec(`
        INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
        VALUES (1, 2, 'Other Company WH', 'WH-01', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
      `)

      await expect(update(1, 1, { name: 'Hijack' })).rejects.toThrow(NotFoundError)
    })
  })

  describe('deleteWarehouse', () => {
    it('should delete a warehouse with no stock records', async () => {
      sqlite.exec(`
        INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
        VALUES (1, 1, 'Warehouse', 'WH-01', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
      `)

      await deleteWarehouse(1, 1)

      const rows = sqlite.prepare('SELECT * FROM warehouses WHERE id = 1').all()
      expect(rows).toHaveLength(0)
    })

    it('should delete a warehouse with stock records that have zero quantity', async () => {
      sqlite.exec(`
        INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
        VALUES (1, 1, 'Warehouse', 'WH-01', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
        INSERT INTO products (id, company_id, sku, name, track_inventory, status, created_at, updated_at)
        VALUES (1, 1, 'SKU-001', 'Product 1', 1, 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
        INSERT INTO stock (company_id, product_id, warehouse_id, quantity, reserved_quantity, created_at, updated_at)
        VALUES (1, 1, 1, 0, 0, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
      `)

      await deleteWarehouse(1, 1)

      const rows = sqlite.prepare('SELECT * FROM warehouses WHERE id = 1').all()
      expect(rows).toHaveLength(0)
    })

    it('should throw EntityReferencedError when stock has non-zero quantity', async () => {
      sqlite.exec(`
        INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
        VALUES (1, 1, 'Warehouse', 'WH-01', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
        INSERT INTO products (id, company_id, sku, name, track_inventory, status, created_at, updated_at)
        VALUES (1, 1, 'SKU-001', 'Product 1', 1, 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
        INSERT INTO stock (company_id, product_id, warehouse_id, quantity, reserved_quantity, created_at, updated_at)
        VALUES (1, 1, 1, 10, 0, '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
      `)

      await expect(deleteWarehouse(1, 1)).rejects.toThrow(EntityReferencedError)
    })

    it('should throw NotFoundError when warehouse does not exist', async () => {
      await expect(deleteWarehouse(1, 999)).rejects.toThrow(NotFoundError)
    })

    it('should throw NotFoundError when warehouse belongs to another company', async () => {
      sqlite.exec(`
        INSERT INTO warehouses (id, company_id, name, code, status, created_at, updated_at)
        VALUES (1, 2, 'Other WH', 'WH-01', 'active', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
      `)

      await expect(deleteWarehouse(1, 1)).rejects.toThrow(NotFoundError)
    })
  })
})
