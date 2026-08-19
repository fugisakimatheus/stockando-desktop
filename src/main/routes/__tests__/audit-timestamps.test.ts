/**
 * Property test for audit timestamp consistency.
 *
 * **Validates: Requirements 12.2, 12.3**
 *
 * Property 5: Audit timestamp consistency
 * "For any record creation, created_at SHALL be set to the current time.
 * For any record update, updated_at SHALL be updated to the current time
 * while created_at remains unchanged."
 *
 * Feature: phase-0-foundation, Property 5: Audit timestamp consistency
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
 * Generates a valid document number (1-20 chars, alphanumeric).
 */
const documentNumberArb = fc
  .array(fc.constantFrom(...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')), {
    minLength: 1,
    maxLength: 20
  })
  .map((chars) => chars.join(''))

describe('Audit timestamp consistency (Property 5)', () => {
  it('sets createdAt and updatedAt to the current time on creation, both equal', async () => {
    await fc.assert(
      fc.asyncProperty(companyNameArb, documentNumberArb, async (name, documentNumber) => {
        const sqlite = createTestDb()
        const db = drizzle(sqlite, { schema })
        mockedGetDb.mockReturnValue(db)

        const fastify = Fastify()
        registerErrorHandler(fastify)
        registerCompanyRoutes(fastify)
        await fastify.ready()

        try {
          const before = Date.now()

          const response = await fastify.inject({
            method: 'POST',
            url: '/api/companies',
            payload: { name, documentNumber }
          })

          const after = Date.now()

          expect(response.statusCode).toBe(201)
          const body = response.json()
          const { createdAt, updatedAt } = body.data

          // Both timestamps must be valid ISO 8601 strings
          const createdDate = new Date(createdAt)
          const updatedDate = new Date(updatedAt)
          expect(createdDate.toISOString()).toBe(createdAt)
          expect(updatedDate.toISOString()).toBe(updatedAt)

          // createdAt and updatedAt should be equal on creation
          expect(createdAt).toBe(updatedAt)

          // Timestamps should be near the current time (within 5 seconds)
          const createdMs = createdDate.getTime()
          expect(createdMs).toBeGreaterThanOrEqual(before - 5000)
          expect(createdMs).toBeLessThanOrEqual(after + 5000)
        } finally {
          await fastify.close()
          sqlite.close()
        }
      }),
      { numRuns: 100 }
    )
  })

  it('preserves createdAt and updates updatedAt on record update', async () => {
    await fc.assert(
      fc.asyncProperty(
        companyNameArb,
        companyNameArb,
        documentNumberArb,
        async (originalName, updatedName, documentNumber) => {
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)

          const fastify = Fastify()
          registerErrorHandler(fastify)
          registerCompanyRoutes(fastify)
          await fastify.ready()

          try {
            // Create a company
            const createResponse = await fastify.inject({
              method: 'POST',
              url: '/api/companies',
              payload: { name: originalName, documentNumber }
            })

            expect(createResponse.statusCode).toBe(201)
            const createBody = createResponse.json()
            const companyId = createBody.data.id
            const originalCreatedAt = createBody.data.createdAt
            const originalUpdatedAt = createBody.data.updatedAt

            // Update the company
            const beforeUpdate = Date.now()

            const updateResponse = await fastify.inject({
              method: 'PUT',
              url: `/api/companies/${companyId}`,
              payload: { name: updatedName }
            })

            const afterUpdate = Date.now()

            expect(updateResponse.statusCode).toBe(200)
            const updateBody = updateResponse.json()
            const { createdAt: newCreatedAt, updatedAt: newUpdatedAt } = updateBody.data

            // createdAt MUST remain unchanged after update
            expect(newCreatedAt).toBe(originalCreatedAt)

            // updatedAt MUST be updated to a new value >= the original
            const newUpdatedMs = new Date(newUpdatedAt).getTime()
            const originalUpdatedMs = new Date(originalUpdatedAt).getTime()
            expect(newUpdatedMs).toBeGreaterThanOrEqual(originalUpdatedMs)

            // updatedAt should be near the current time (within 5 seconds)
            expect(newUpdatedMs).toBeGreaterThanOrEqual(beforeUpdate - 5000)
            expect(newUpdatedMs).toBeLessThanOrEqual(afterUpdate + 5000)

            // updatedAt must be a valid ISO string
            expect(new Date(newUpdatedAt).toISOString()).toBe(newUpdatedAt)
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
