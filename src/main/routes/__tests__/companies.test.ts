/**
 * Unit tests for GET /api/companies and POST /api/companies routes.
 *
 * Tests cover:
 * - Listing companies ordered by name
 * - Creating a company with valid data
 * - Auto-creating companySettings on company creation
 * - Setting createdAt/updatedAt timestamps on creation
 * - Returning validation errors for missing/invalid fields
 * - Returning conflict error for duplicate documentNumber
 *
 * **Validates: Requirements 3.1, 3.2, 3.5, 12.2**
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerErrorHandler } from '../../api/error-handler'
import * as schema from '../../db/schema'
import { registerCompanyRoutes } from '../companies'

// Mock the server module to provide controlled db instances
vi.mock('../../server', () => ({
  getDb: vi.fn(),
  getSqlite: vi.fn()
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
    CREATE INDEX companies_status_idx ON companies(status);

    CREATE TABLE company_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL,
      tax_regime TEXT,
      currency_code TEXT NOT NULL DEFAULT 'BRL',
      fiscal_environment TEXT NOT NULL DEFAULT 'production',
      invoice_series TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  return sqlite
}

describe('Company routes', () => {
  let sqlite: Database.Database
  let fastify: ReturnType<typeof Fastify>

  beforeEach(async () => {
    sqlite = createTestDb()
    const db = drizzle(sqlite, { schema })

    mockedGetDb.mockReturnValue(db)

    fastify = Fastify()
    registerErrorHandler(fastify)
    registerCompanyRoutes(fastify)
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify.close()
    sqlite.close()
  })

  describe('GET /api/companies', () => {
    it('returns empty list when no companies exist', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/companies'
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
      expect(body.data).toEqual([])
    })

    it('returns companies ordered by name ascending', async () => {
      const now = new Date().toISOString()
      sqlite
        .prepare('INSERT INTO companies (name, document_number, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run('Zebra Corp', '111', 'active', now, now)
      sqlite
        .prepare('INSERT INTO companies (name, document_number, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run('Alpha Inc', '222', 'active', now, now)
      sqlite
        .prepare('INSERT INTO companies (name, document_number, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run('Mango Ltd', '333', 'active', now, now)

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/companies'
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
      expect(body.data).toHaveLength(3)
      expect(body.data[0].name).toBe('Alpha Inc')
      expect(body.data[1].name).toBe('Mango Ltd')
      expect(body.data[2].name).toBe('Zebra Corp')
    })
  })

  describe('POST /api/companies', () => {
    it('creates a company with valid data and returns 201', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: {
          name: 'Test Company',
          documentNumber: '12345678000190'
        }
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.success).toBe(true)
      expect(body.data.id).toBeDefined()
      expect(body.data.name).toBe('Test Company')
      expect(body.data.documentNumber).toBe('12345678000190')
      expect(body.data.status).toBe('active')
    })

    it('creates a company with optional tradeName', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: {
          name: 'Test Company',
          documentNumber: '12345678000190',
          tradeName: 'Test Trade'
        }
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.data.tradeName).toBe('Test Trade')
    })

    it('sets createdAt and updatedAt timestamps on creation', async () => {
      const before = new Date().toISOString()

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: {
          name: 'Timestamp Test',
          documentNumber: '99988877000166'
        }
      })

      const after = new Date().toISOString()
      const body = response.json()

      expect(body.data.createdAt).toBeTruthy()
      expect(body.data.updatedAt).toBeTruthy()
      // Timestamps should be valid ISO strings
      expect(new Date(body.data.createdAt).toISOString()).toBe(body.data.createdAt)
      // Timestamps should be within the test execution window
      expect(body.data.createdAt >= before).toBe(true)
      expect(body.data.createdAt <= after).toBe(true)
      // createdAt and updatedAt should be equal on creation
      expect(body.data.createdAt).toBe(body.data.updatedAt)
    })

    it('automatically creates companySettings with defaults', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: {
          name: 'Settings Test Co',
          documentNumber: '55566677000188'
        }
      })

      const body = response.json()
      const companyId = body.data.id

      // Verify company_settings row was created
      const settings = sqlite.prepare('SELECT * FROM company_settings WHERE company_id = ?').get(companyId) as Record<
        string,
        unknown
      >

      expect(settings).toBeDefined()
      expect(settings.company_name).toBe('Settings Test Co')
      expect(settings.currency_code).toBe('BRL')
      expect(settings.fiscal_environment).toBe('production')
      expect(settings.tax_regime).toBeNull()
      expect(settings.invoice_series).toBeNull()
    })

    it('returns 400 with field errors when name is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: {
          documentNumber: '12345678000190'
        }
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.fields).toBeDefined()
      expect(body.error.fields.name).toBeTruthy()
    })

    it('returns 400 with field errors when documentNumber is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: {
          name: 'Test Company'
        }
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.fields).toBeDefined()
      expect(body.error.fields.documentNumber).toBeTruthy()
    })

    it('returns 400 with field errors when name is empty string', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: {
          name: '',
          documentNumber: '12345678000190'
        }
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.fields?.name).toBeTruthy()
    })

    it('returns 400 when body has unrecognized keys', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: {
          name: 'Test',
          documentNumber: '123',
          unknownField: 'hack'
        }
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 409 for duplicate documentNumber', async () => {
      // Create first company
      await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: {
          name: 'First Company',
          documentNumber: '12345678000190'
        }
      })

      // Attempt duplicate
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: {
          name: 'Second Company',
          documentNumber: '12345678000190'
        }
      })

      expect(response.statusCode).toBe(409)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('CONFLICT')
    })

    it('allows null tradeName', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: {
          name: 'Null Trade Test',
          documentNumber: '77788899000155',
          tradeName: null
        }
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.data.tradeName).toBeNull()
    })
  })
})
