/**
 * Property test for settings two-tier resolution.
 *
 * **Validates: Requirements 4.1, 4.5**
 *
 * Property 4: Settings two-tier resolution
 * "For any setting key, if a company-level value exists for the active company
 * then it SHALL be returned; otherwise the application-level default SHALL be
 * returned. App-level settings are never affected by company-level writes."
 *
 * Feature: phase-0-foundation, Property 4: Settings two-tier resolution
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerErrorHandler } from '../../api/error-handler'
import * as schema from '../../db/schema'
import { registerCompanyRoutes } from '../companies'
import { registerCompanySettingsRoutes } from '../company-settings'
import { registerSettingsRoutes } from '../settings'

// Mock the server module to provide controlled db instances
vi.mock('../../server', () => ({
  getDb: vi.fn(),
  getSqlite: vi.fn()
}))

import { getDb, getSqlite } from '../../server'

const mockedGetDb = vi.mocked(getDb)
const mockedGetSqlite = vi.mocked(getSqlite)

/**
 * Creates an in-memory SQLite database with the required tables for
 * app_settings, companies, and company_settings.
 */
function createTestDb(): Database.Database {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  sqlite.exec(`
    CREATE TABLE app_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

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

/**
 * Arbitrary that generates valid app-level setting key-value pairs.
 * Keys are alphanumeric strings (avoiding conflict with defaults).
 */
const appSettingsArbitrary = fc
  .uniqueArray(
    fc.tuple(
      fc.stringMatching(/^[a-z][a-zA-Z0-9]{1,20}$/).filter((s) => s !== 'theme' && s !== 'lastActiveCompanyId'),
      fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)
    ),
    { minLength: 1, maxLength: 5, selector: ([key]) => key }
  )
  .map((tuples) => Object.fromEntries(tuples))

/**
 * Arbitrary for company-level settings (valid subset of fields).
 */
const companySettingsArbitrary = fc.record({
  taxRegime: fc.constantFrom('simples_nacional', 'lucro_presumido', 'lucro_real', null),
  currencyCode: fc.constantFrom('BRL', 'USD', 'EUR'),
  fiscalEnvironment: fc.constantFrom('production', 'homologation'),
  invoiceSeries: fc.oneof(fc.constant(null), fc.stringMatching(/^[A-Z0-9]{1,5}$/))
})

describe('Settings two-tier resolution (Property 4)', () => {
  let sqlite: Database.Database
  let fastify: ReturnType<typeof Fastify>

  beforeEach(async () => {
    sqlite = createTestDb()
    const db = drizzle(sqlite, { schema })

    mockedGetDb.mockReturnValue(db)
    mockedGetSqlite.mockReturnValue(sqlite)

    fastify = Fastify()
    registerErrorHandler(fastify)
    registerSettingsRoutes(fastify)
    registerCompanyRoutes(fastify)
    registerCompanySettingsRoutes(fastify)
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify.close()
    sqlite.close()
  })

  it('company-level settings writes NEVER modify app-level settings', async () => {
    await fc.assert(
      fc.asyncProperty(appSettingsArbitrary, companySettingsArbitrary, async (appSettings, compSettings) => {
        // Reset database state between iterations
        sqlite.exec('DELETE FROM company_settings')
        sqlite.exec('DELETE FROM companies')
        sqlite.exec('DELETE FROM app_settings')

        // Step 1: Write app-level settings
        const putAppRes = await fastify.inject({
          method: 'PUT',
          url: '/api/settings',
          payload: appSettings
        })
        expect(putAppRes.statusCode).toBe(200)

        // Step 2: Read app-level settings and record the snapshot
        const getAppBeforeRes = await fastify.inject({
          method: 'GET',
          url: '/api/settings'
        })
        expect(getAppBeforeRes.statusCode).toBe(200)
        const appSettingsBefore = getAppBeforeRes.json().data

        // Step 3: Create a company
        const createCompRes = await fastify.inject({
          method: 'POST',
          url: '/api/companies',
          payload: {
            name: 'Test Company',
            documentNumber: '12345678000190'
          }
        })
        expect(createCompRes.statusCode).toBe(201)
        const companyId = createCompRes.json().data.id

        // Step 4: Write company-level settings
        const putCompSettingsRes = await fastify.inject({
          method: 'PUT',
          url: `/api/companies/${companyId}/settings`,
          payload: {
            taxRegime: compSettings.taxRegime,
            currencyCode: compSettings.currencyCode,
            fiscalEnvironment: compSettings.fiscalEnvironment,
            invoiceSeries: compSettings.invoiceSeries
          }
        })
        expect(putCompSettingsRes.statusCode).toBe(200)

        // Step 5: Read app-level settings AFTER the company write
        const getAppAfterRes = await fastify.inject({
          method: 'GET',
          url: '/api/settings'
        })
        expect(getAppAfterRes.statusCode).toBe(200)
        const appSettingsAfter = getAppAfterRes.json().data

        // PROPERTY: App-level settings are unchanged after company-level writes
        expect(appSettingsAfter).toEqual(appSettingsBefore)
      }),
      { numRuns: 100 }
    )
  })

  it('app-level settings writes NEVER modify company-level settings', async () => {
    await fc.assert(
      fc.asyncProperty(appSettingsArbitrary, companySettingsArbitrary, async (appSettings, compSettings) => {
        // Reset database state between iterations
        sqlite.exec('DELETE FROM company_settings')
        sqlite.exec('DELETE FROM companies')
        sqlite.exec('DELETE FROM app_settings')

        // Step 1: Create a company
        const createCompRes = await fastify.inject({
          method: 'POST',
          url: '/api/companies',
          payload: {
            name: 'Test Company',
            documentNumber: '12345678000190'
          }
        })
        expect(createCompRes.statusCode).toBe(201)
        const companyId = createCompRes.json().data.id

        // Step 2: Write company-level settings
        const putCompSettingsRes = await fastify.inject({
          method: 'PUT',
          url: `/api/companies/${companyId}/settings`,
          payload: {
            taxRegime: compSettings.taxRegime,
            currencyCode: compSettings.currencyCode,
            fiscalEnvironment: compSettings.fiscalEnvironment,
            invoiceSeries: compSettings.invoiceSeries
          }
        })
        expect(putCompSettingsRes.statusCode).toBe(200)

        // Step 3: Read company settings and take snapshot
        const getCompBeforeRes = await fastify.inject({
          method: 'GET',
          url: `/api/companies/${companyId}/settings`
        })
        expect(getCompBeforeRes.statusCode).toBe(200)
        const compSettingsBefore = getCompBeforeRes.json().data

        // Step 4: Write app-level settings
        const putAppRes = await fastify.inject({
          method: 'PUT',
          url: '/api/settings',
          payload: appSettings
        })
        expect(putAppRes.statusCode).toBe(200)

        // Step 5: Read company settings AFTER app-level write
        const getCompAfterRes = await fastify.inject({
          method: 'GET',
          url: `/api/companies/${companyId}/settings`
        })
        expect(getCompAfterRes.statusCode).toBe(200)
        const compSettingsAfter = getCompAfterRes.json().data

        // PROPERTY: Company-level settings are unchanged after app-level writes
        expect(compSettingsAfter).toEqual(compSettingsBefore)
      }),
      { numRuns: 100 }
    )
  })

  it('GET /api/settings returns defaults for keys not yet persisted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(
          fc.stringMatching(/^[a-z][a-zA-Z0-9]{1,15}$/).filter((s) => s !== 'theme' && s !== 'lastActiveCompanyId'),
          { minLength: 1, maxLength: 5 }
        ),
        async (customKeys) => {
          // Reset
          sqlite.exec('DELETE FROM app_settings')

          // Write only a subset of settings (just the generated custom keys)
          const payload: Record<string, string> = {}
          for (const key of customKeys) {
            payload[key] = 'someValue'
          }

          await fastify.inject({
            method: 'PUT',
            url: '/api/settings',
            payload
          })

          // Read all settings
          const getRes = await fastify.inject({
            method: 'GET',
            url: '/api/settings'
          })
          expect(getRes.statusCode).toBe(200)
          const data = getRes.json().data

          // PROPERTY: Default keys always present even when not explicitly set
          expect(data.theme).toBe('system')
          expect(data.lastActiveCompanyId).toBe('null')

          // PROPERTY: Custom keys that were explicitly set are returned
          for (const key of customKeys) {
            expect(data[key]).toBe('someValue')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('company settings are scoped — different companies have independent settings', async () => {
    await fc.assert(
      fc.asyncProperty(companySettingsArbitrary, companySettingsArbitrary, async (settingsA, settingsB) => {
        // Reset
        sqlite.exec('DELETE FROM company_settings')
        sqlite.exec('DELETE FROM companies')

        // Create two companies
        const createA = await fastify.inject({
          method: 'POST',
          url: '/api/companies',
          payload: { name: 'Company A', documentNumber: '11111111000111' }
        })
        expect(createA.statusCode).toBe(201)
        const companyAId = createA.json().data.id

        const createB = await fastify.inject({
          method: 'POST',
          url: '/api/companies',
          payload: { name: 'Company B', documentNumber: '22222222000222' }
        })
        expect(createB.statusCode).toBe(201)
        const companyBId = createB.json().data.id

        // Write settings for company A
        const putA = await fastify.inject({
          method: 'PUT',
          url: `/api/companies/${companyAId}/settings`,
          payload: {
            taxRegime: settingsA.taxRegime,
            currencyCode: settingsA.currencyCode,
            fiscalEnvironment: settingsA.fiscalEnvironment,
            invoiceSeries: settingsA.invoiceSeries
          }
        })
        expect(putA.statusCode).toBe(200)

        // Write settings for company B
        const putB = await fastify.inject({
          method: 'PUT',
          url: `/api/companies/${companyBId}/settings`,
          payload: {
            taxRegime: settingsB.taxRegime,
            currencyCode: settingsB.currencyCode,
            fiscalEnvironment: settingsB.fiscalEnvironment,
            invoiceSeries: settingsB.invoiceSeries
          }
        })
        expect(putB.statusCode).toBe(200)

        // Read settings for company A
        const getA = await fastify.inject({
          method: 'GET',
          url: `/api/companies/${companyAId}/settings`
        })
        expect(getA.statusCode).toBe(200)
        const dataA = getA.json().data

        // Read settings for company B
        const getB = await fastify.inject({
          method: 'GET',
          url: `/api/companies/${companyBId}/settings`
        })
        expect(getB.statusCode).toBe(200)
        const dataB = getB.json().data

        // PROPERTY: Each company returns its own settings, not the other's
        expect(dataA.taxRegime).toBe(settingsA.taxRegime)
        expect(dataA.currencyCode).toBe(settingsA.currencyCode)
        expect(dataA.fiscalEnvironment).toBe(settingsA.fiscalEnvironment)
        expect(dataA.invoiceSeries).toBe(settingsA.invoiceSeries)

        expect(dataB.taxRegime).toBe(settingsB.taxRegime)
        expect(dataB.currencyCode).toBe(settingsB.currencyCode)
        expect(dataB.fiscalEnvironment).toBe(settingsB.fiscalEnvironment)
        expect(dataB.invoiceSeries).toBe(settingsB.invoiceSeries)
      }),
      { numRuns: 100 }
    )
  })
})
