/**
 * Integration tests for settings persistence and cache invalidation.
 *
 * These tests exercise the full settings flow through Fastify routes
 * with a real in-memory SQLite database (migration 001 applied).
 *
 * Test cases:
 * - App-level settings write and read
 * - App-level settings overwrite
 * - Company-level settings write and read
 * - Active company switch persists and restores
 * - Active company validation (non-existent company)
 *
 * **Validates: Requirements 4.1, 4.2, 2.6**
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerErrorHandler } from '../api/error-handler'
import { migration001 } from '../db/migrations/001-initial-schema'
import * as schema from '../db/schema'
import { registerCompanyRoutes } from '../routes/companies'
import { registerCompanySettingsRoutes } from '../routes/company-settings'
import { registerSettingsRoutes } from '../routes/settings'

// Mock the server module to provide controlled db instances
vi.mock('../server', () => ({
  getDb: vi.fn(),
  getSqlite: vi.fn()
}))

import { getDb, getSqlite } from '../server'

const mockedGetDb = vi.mocked(getDb)
const mockedGetSqlite = vi.mocked(getSqlite)

/**
 * Creates an in-memory SQLite database with migration 001 applied,
 * sets up Drizzle with schema, and configures a Fastify instance
 * with error handler + settings routes + company routes.
 */
function createTestDb(): Database.Database {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  // Apply migration 001 to set up the full schema
  migration001.up(sqlite)

  return sqlite
}

async function createTestFastify(): Promise<ReturnType<typeof Fastify>> {
  const fastify = Fastify()
  registerErrorHandler(fastify)
  registerSettingsRoutes(fastify)
  registerCompanyRoutes(fastify)
  registerCompanySettingsRoutes(fastify)
  await fastify.ready()
  return fastify
}

describe('Settings integration tests', () => {
  let sqlite: Database.Database
  let fastify: ReturnType<typeof Fastify>

  beforeEach(async () => {
    sqlite = createTestDb()
    const db = drizzle(sqlite, { schema })

    mockedGetDb.mockReturnValue(db)
    mockedGetSqlite.mockReturnValue(sqlite)

    fastify = await createTestFastify()
  })

  afterEach(async () => {
    await fastify.close()
    sqlite.close()
  })

  describe('App-level settings write and read', () => {
    it('writes a setting and reads it back with defaults preserved', async () => {
      // Write theme setting
      const putResponse = await fastify.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: { theme: 'dark' }
      })

      expect(putResponse.statusCode).toBe(200)
      const putBody = putResponse.json()
      expect(putBody.success).toBe(true)
      expect(putBody.data.theme).toBe('dark')

      // Read all settings and verify theme was persisted
      const getResponse = await fastify.inject({
        method: 'GET',
        url: '/api/settings'
      })

      expect(getResponse.statusCode).toBe(200)
      const getBody = getResponse.json()
      expect(getBody.success).toBe(true)
      expect(getBody.data.theme).toBe('dark')
      // Other defaults are still present
      expect(getBody.data.lastActiveCompanyId).toBe('null')
    })

    it('overwrites an existing setting value', async () => {
      // Write theme as 'dark'
      await fastify.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: { theme: 'dark' }
      })

      // Overwrite theme as 'light'
      const putResponse = await fastify.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: { theme: 'light' }
      })

      expect(putResponse.statusCode).toBe(200)
      expect(putResponse.json().data.theme).toBe('light')

      // Read and verify the final value
      const getResponse = await fastify.inject({
        method: 'GET',
        url: '/api/settings'
      })

      expect(getResponse.statusCode).toBe(200)
      expect(getResponse.json().data.theme).toBe('light')
    })

    it('writes multiple settings atomically in a single request', async () => {
      const putResponse = await fastify.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: { theme: 'dark', language: 'pt-BR' }
      })

      expect(putResponse.statusCode).toBe(200)

      const getResponse = await fastify.inject({
        method: 'GET',
        url: '/api/settings'
      })

      const data = getResponse.json().data
      expect(data.theme).toBe('dark')
      expect(data.language).toBe('pt-BR')
      expect(data.lastActiveCompanyId).toBe('null')
    })
  })

  describe('Company-level settings write and read', () => {
    it('creates a company and reads/writes its settings', async () => {
      // Create a company
      const createResponse = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: {
          name: 'Integration Test Co',
          documentNumber: '12345678000190'
        }
      })

      expect(createResponse.statusCode).toBe(201)
      const company = createResponse.json().data
      const companyId = company.id

      // Read default company settings
      const getResponse = await fastify.inject({
        method: 'GET',
        url: `/api/companies/${companyId}/settings`
      })

      expect(getResponse.statusCode).toBe(200)
      const defaultSettings = getResponse.json().data
      expect(defaultSettings.companyId).toBe(companyId)
      expect(defaultSettings.currencyCode).toBe('BRL')
      expect(defaultSettings.fiscalEnvironment).toBe('production')
      expect(defaultSettings.taxRegime).toBeNull()

      // Update company settings
      const putResponse = await fastify.inject({
        method: 'PUT',
        url: `/api/companies/${companyId}/settings`,
        payload: {
          taxRegime: 'simples',
          currencyCode: 'USD'
        }
      })

      expect(putResponse.statusCode).toBe(200)
      const updatedBody = putResponse.json()
      expect(updatedBody.success).toBe(true)
      expect(updatedBody.data.taxRegime).toBe('simples')
      expect(updatedBody.data.currencyCode).toBe('USD')

      // Read again to confirm persistence
      const getAfterUpdate = await fastify.inject({
        method: 'GET',
        url: `/api/companies/${companyId}/settings`
      })

      expect(getAfterUpdate.statusCode).toBe(200)
      const finalSettings = getAfterUpdate.json().data
      expect(finalSettings.taxRegime).toBe('simples')
      expect(finalSettings.currencyCode).toBe('USD')
      // Unchanged fields remain at their previous values
      expect(finalSettings.fiscalEnvironment).toBe('production')
    })

    it('company settings are isolated between companies', async () => {
      // Create company A
      const createA = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Company A', documentNumber: 'AAA111' }
      })
      const companyA = createA.json().data

      // Create company B
      const createB = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Company B', documentNumber: 'BBB222' }
      })
      const companyB = createB.json().data

      // Update company A settings
      await fastify.inject({
        method: 'PUT',
        url: `/api/companies/${companyA.id}/settings`,
        payload: { taxRegime: 'lucro_real', currencyCode: 'EUR' }
      })

      // Update company B settings
      await fastify.inject({
        method: 'PUT',
        url: `/api/companies/${companyB.id}/settings`,
        payload: { taxRegime: 'simples', currencyCode: 'USD' }
      })

      // Verify company A settings are independent
      const getA = await fastify.inject({
        method: 'GET',
        url: `/api/companies/${companyA.id}/settings`
      })
      expect(getA.json().data.taxRegime).toBe('lucro_real')
      expect(getA.json().data.currencyCode).toBe('EUR')

      // Verify company B settings are independent
      const getB = await fastify.inject({
        method: 'GET',
        url: `/api/companies/${companyB.id}/settings`
      })
      expect(getB.json().data.taxRegime).toBe('simples')
      expect(getB.json().data.currencyCode).toBe('USD')
    })
  })

  describe('Active company switch persists and restores', () => {
    it('switches active company and persists the choice', async () => {
      // Create two companies
      const createA = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Company Alpha', documentNumber: 'ALPHA001' }
      })
      const companyA = createA.json().data

      const createB = await fastify.inject({
        method: 'POST',
        url: '/api/companies',
        payload: { name: 'Company Beta', documentNumber: 'BETA002' }
      })
      const companyB = createB.json().data

      // Set active company to A
      const switchA = await fastify.inject({
        method: 'PUT',
        url: '/api/settings/active-company',
        payload: { companyId: companyA.id }
      })

      expect(switchA.statusCode).toBe(200)
      expect(switchA.json().data.lastActiveCompanyId).toBe(companyA.id)

      // Verify in app settings
      const getAfterA = await fastify.inject({
        method: 'GET',
        url: '/api/settings'
      })

      expect(getAfterA.json().data.lastActiveCompanyId).toBe(String(companyA.id))

      // Switch active company to B
      const switchB = await fastify.inject({
        method: 'PUT',
        url: '/api/settings/active-company',
        payload: { companyId: companyB.id }
      })

      expect(switchB.statusCode).toBe(200)
      expect(switchB.json().data.lastActiveCompanyId).toBe(companyB.id)

      // Verify in app settings — should now be B
      const getAfterB = await fastify.inject({
        method: 'GET',
        url: '/api/settings'
      })

      expect(getAfterB.json().data.lastActiveCompanyId).toBe(String(companyB.id))
    })

    it('rejects setting active company to a non-existent ID', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/settings/active-company',
        payload: { companyId: 99999 }
      })

      expect(response.statusCode).toBe(404)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('NOT_FOUND')
    })

    it('rejects setting active company with invalid payload', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/settings/active-company',
        payload: { companyId: -1 }
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })
  })
})
