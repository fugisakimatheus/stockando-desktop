/**
 * Integration tests for company CRUD through the Fastify API.
 *
 * These tests exercise the full company CRUD flow through Fastify routes
 * with a real in-memory SQLite database (not mocked). They verify:
 * - Creating, listing, and updating companies
 * - Duplicate document number rejection
 * - Company settings read/write cycle
 * - Validation errors
 *
 * **Validates: Requirements 3.1, 3.2, 3.4, 4.1**
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerErrorHandler } from '../api/error-handler'
import * as schema from '../db/schema'
import { registerCompanyRoutes } from '../routes/companies'
import { registerCompanySettingsRoutes } from '../routes/company-settings'

// Mock the server module to provide controlled db instances
vi.mock('../server', () => ({
  getDb: vi.fn(),
  getSqlite: vi.fn()
}))

import { getDb } from '../server'

const mockedGetDb = vi.mocked(getDb)

/**
 * Creates an in-memory SQLite database with the full schema needed
 * for integration testing of company CRUD and settings.
 */
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

describe('Company CRUD integration tests', () => {
  let sqlite: Database.Database
  let fastify: ReturnType<typeof Fastify>

  beforeEach(async () => {
    sqlite = createTestDb()
    const db = drizzle(sqlite, { schema })

    mockedGetDb.mockReturnValue(db)

    fastify = Fastify()
    registerErrorHandler(fastify)
    registerCompanyRoutes(fastify)
    registerCompanySettingsRoutes(fastify)
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify.close()
    sqlite.close()
  })

  describe('Create and list companies', () => {
    it('creates a company via POST and retrieves it via GET', async () => {
      // Create a company
      const createResponse = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: {
          name: 'Integration Corp',
          documentNumber: '11222333000181',
          tradeName: 'IntCorp'
        }
      })

      expect(createResponse.statusCode).toBe(201)
      const created = createResponse.json()
      expect(created.success).toBe(true)
      expect(created.data.name).toBe('Integration Corp')
      expect(created.data.documentNumber).toBe('11222333000181')
      expect(created.data.tradeName).toBe('IntCorp')
      expect(created.data.status).toBe('active')
      expect(created.data.id).toBeDefined()

      // List companies and verify it appears
      const listResponse = await fastify.inject({
        method: 'GET',
        url: '/api/companies'
      })

      expect(listResponse.statusCode).toBe(200)
      const list = listResponse.json()
      expect(list.success).toBe(true)
      expect(list.data).toHaveLength(1)
      expect(list.data[0].id).toBe(created.data.id)
      expect(list.data[0].name).toBe('Integration Corp')
    })

    it('returns companies ordered by name when multiple exist', async () => {
      // Create companies in non-alphabetical order
      await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Zebra Supplies', documentNumber: '001' }
      })
      await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Alpha Services', documentNumber: '002' }
      })
      await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Mango Logistics', documentNumber: '003' }
      })

      const listResponse = await fastify.inject({
        method: 'GET',
        url: '/api/companies'
      })

      const list = listResponse.json()
      expect(list.data).toHaveLength(3)
      expect(list.data[0].name).toBe('Alpha Services')
      expect(list.data[1].name).toBe('Mango Logistics')
      expect(list.data[2].name).toBe('Zebra Supplies')
    })
  })

  describe('Duplicate document number rejection', () => {
    it('returns 409 CONFLICT when creating a company with an existing documentNumber', async () => {
      // Create the first company
      const first = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'First Co', documentNumber: '12345678000190' }
      })
      expect(first.statusCode).toBe(201)

      // Attempt to create a second company with the same documentNumber
      const duplicate = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Second Co', documentNumber: '12345678000190' }
      })

      expect(duplicate.statusCode).toBe(409)
      const body = duplicate.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('CONFLICT')
    })

    it('allows different documentNumbers for different companies', async () => {
      const first = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Company A', documentNumber: '11111111000100' }
      })
      expect(first.statusCode).toBe(201)

      const second = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Company B', documentNumber: '22222222000200' }
      })
      expect(second.statusCode).toBe(201)
    })
  })

  describe('Update company', () => {
    it('updates company name via PUT and reflects the change', async () => {
      // Create a company
      const createResponse = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Original Name', documentNumber: '55566677000188' }
      })
      const companyId = createResponse.json().data.id
      const originalCreatedAt = createResponse.json().data.createdAt

      // Small delay to ensure updatedAt differs
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Update the company name
      const updateResponse = await fastify.inject({
        method: 'PUT',
        url: `/api/companies/${companyId}`,
        payload: { name: 'Updated Name' }
      })

      expect(updateResponse.statusCode).toBe(200)
      const updated = updateResponse.json()
      expect(updated.success).toBe(true)
      expect(updated.data.name).toBe('Updated Name')
      expect(updated.data.createdAt).toBe(originalCreatedAt)
      expect(updated.data.updatedAt).not.toBe(originalCreatedAt)
    })

    it('updates tradeName via PUT', async () => {
      const createResponse = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Trade Test', documentNumber: '77788899000155' }
      })
      const companyId = createResponse.json().data.id

      const updateResponse = await fastify.inject({
        method: 'PUT',
        url: `/api/companies/${companyId}`,
        payload: { tradeName: 'New Trade Name' }
      })

      expect(updateResponse.statusCode).toBe(200)
      expect(updateResponse.json().data.tradeName).toBe('New Trade Name')
    })

    it('returns 404 when updating a non-existent company', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/companies/9999',
        payload: { name: 'Ghost' }
      })

      expect(response.statusCode).toBe(404)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('Company settings read/write cycle', () => {
    it('auto-creates settings with defaults on company creation', async () => {
      // Create a company — settings should be auto-created
      const createResponse = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Settings Corp', documentNumber: '33344455000166' }
      })
      const companyId = createResponse.json().data.id

      // Read the settings
      const getResponse = await fastify.inject({
        method: 'GET',
        url: `/api/companies/${companyId}/settings`
      })

      expect(getResponse.statusCode).toBe(200)
      const settings = getResponse.json()
      expect(settings.success).toBe(true)
      expect(settings.data.companyId).toBe(companyId)
      expect(settings.data.companyName).toBe('Settings Corp')
      expect(settings.data.currencyCode).toBe('BRL')
      expect(settings.data.fiscalEnvironment).toBe('production')
      expect(settings.data.taxRegime).toBeNull()
      expect(settings.data.invoiceSeries).toBeNull()
    })

    it('updates settings via PUT and returns updated values on subsequent GET', async () => {
      // Create a company
      const createResponse = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Update Settings Corp', documentNumber: '44455566000177' }
      })
      const companyId = createResponse.json().data.id

      // Update settings
      const updateResponse = await fastify.inject({
        method: 'PUT',
        url: `/api/companies/${companyId}/settings`,
        payload: {
          taxRegime: 'simples_nacional',
          currencyCode: 'USD',
          fiscalEnvironment: 'homologation',
          invoiceSeries: '001'
        }
      })

      expect(updateResponse.statusCode).toBe(200)
      const updatedBody = updateResponse.json()
      expect(updatedBody.success).toBe(true)
      expect(updatedBody.data.taxRegime).toBe('simples_nacional')
      expect(updatedBody.data.currencyCode).toBe('USD')
      expect(updatedBody.data.fiscalEnvironment).toBe('homologation')
      expect(updatedBody.data.invoiceSeries).toBe('001')

      // Verify the changes persist on a subsequent GET
      const getResponse = await fastify.inject({
        method: 'GET',
        url: `/api/companies/${companyId}/settings`
      })

      expect(getResponse.statusCode).toBe(200)
      const persisted = getResponse.json()
      expect(persisted.data.taxRegime).toBe('simples_nacional')
      expect(persisted.data.currencyCode).toBe('USD')
      expect(persisted.data.fiscalEnvironment).toBe('homologation')
      expect(persisted.data.invoiceSeries).toBe('001')
    })

    it('supports partial settings update without overwriting other fields', async () => {
      // Create a company
      const createResponse = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Partial Update Corp', documentNumber: '55566677000199' }
      })
      const companyId = createResponse.json().data.id

      // Update only taxRegime
      await fastify.inject({
        method: 'PUT',
        url: `/api/companies/${companyId}/settings`,
        payload: { taxRegime: 'lucro_real' }
      })

      // Verify other defaults remain intact
      const getResponse = await fastify.inject({
        method: 'GET',
        url: `/api/companies/${companyId}/settings`
      })

      const settings = getResponse.json().data
      expect(settings.taxRegime).toBe('lucro_real')
      expect(settings.currencyCode).toBe('BRL')
      expect(settings.fiscalEnvironment).toBe('production')
      expect(settings.invoiceSeries).toBeNull()
    })

    it('returns 404 for settings of non-existent company', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/companies/9999/settings'
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().success).toBe(false)
      expect(response.json().error.code).toBe('NOT_FOUND')
    })
  })

  describe('Validation errors', () => {
    it('returns 400 with field errors when body is empty', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: {}
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.fields).toBeDefined()
    })

    it('returns 400 with fields.name error when name is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { documentNumber: '12345678000190' }
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.fields).toBeDefined()
      expect(body.error.fields.name).toBeTruthy()
    })

    it('returns 400 with fields.documentNumber error when documentNumber is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Missing Doc' }
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.fields).toBeDefined()
      expect(body.error.fields.documentNumber).toBeTruthy()
    })

    it('returns 400 when settings update has invalid fiscalEnvironment', async () => {
      // Create a company
      const createResponse = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Validation Corp', documentNumber: '66677788000111' }
      })
      const companyId = createResponse.json().data.id

      // Attempt invalid settings update
      const response = await fastify.inject({
        method: 'PUT',
        url: `/api/companies/${companyId}/settings`,
        payload: { fiscalEnvironment: 'invalid_value' }
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })
  })
})
