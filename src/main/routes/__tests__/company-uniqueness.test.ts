/**
 * Property test for company name uniqueness enforcement.
 *
 * **Validates: Requirements 3.2**
 *
 * Property 6: Company name uniqueness enforcement
 * "For any attempt to create a company with a documentNumber that already
 * exists in the database, the operation SHALL fail with a validation error
 * and the database SHALL remain unchanged."
 *
 * Feature: phase-0-foundation, Property 6: Company name uniqueness enforcement
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

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

/**
 * Generates a valid company name (1-50 chars, alphanumeric + spaces, non-empty after trim).
 */
const companyNameArb = fc
  .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '.split('')), {
    minLength: 1,
    maxLength: 50
  })
  .map((chars) => chars.join(''))
  .filter((s) => s.trim().length > 0)

/**
 * Generates a valid document number (1-20 chars, alphanumeric, non-empty).
 */
const documentNumberArb = fc
  .array(fc.constantFrom(...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')), {
    minLength: 1,
    maxLength: 20
  })
  .map((chars) => chars.join(''))

describe('Company name uniqueness enforcement (Property 6)', () => {
  it('rejects duplicate documentNumber with 409 CONFLICT and leaves database unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        companyNameArb,
        companyNameArb,
        documentNumberArb,
        async (firstName, secondName, documentNumber) => {
          // Create a fresh in-memory database and Fastify instance per iteration
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)

          const fastify = Fastify()
          registerErrorHandler(fastify)
          registerCompanyRoutes(fastify)
          await fastify.ready()

          try {
            // First creation — should succeed
            const firstResponse = await fastify.inject({
              method: 'POST',
              url: '/api/companies',
              payload: {
                name: firstName,
                documentNumber
              }
            })

            expect(firstResponse.statusCode).toBe(201)
            const firstBody = firstResponse.json()
            expect(firstBody.success).toBe(true)

            // Count companies before the duplicate attempt
            const countBefore = (
              sqlite.prepare('SELECT COUNT(*) as count FROM companies').get() as {
                count: number
              }
            ).count
            expect(countBefore).toBe(1)

            // Second creation with the same documentNumber — should fail with 409
            const secondResponse = await fastify.inject({
              method: 'POST',
              url: '/api/companies',
              payload: {
                name: secondName,
                documentNumber
              }
            })

            expect(secondResponse.statusCode).toBe(409)
            const secondBody = secondResponse.json()
            expect(secondBody.success).toBe(false)
            expect(secondBody.error.code).toBe('CONFLICT')

            // Database remains unchanged — still exactly 1 company with that documentNumber
            const countAfter = (
              sqlite
                .prepare('SELECT COUNT(*) as count FROM companies WHERE document_number = ?')
                .get(documentNumber) as { count: number }
            ).count
            expect(countAfter).toBe(1)

            // Total company count unchanged
            const totalCount = (
              sqlite.prepare('SELECT COUNT(*) as count FROM companies').get() as {
                count: number
              }
            ).count
            expect(totalCount).toBe(1)
          } finally {
            await fastify.close()
            sqlite.close()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
