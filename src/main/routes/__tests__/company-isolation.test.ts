/**
 * Property test for company data isolation.
 *
 * **Validates: Requirements 2.4**
 *
 * Property 1: Company data isolation
 * "For any two distinct companies A and B, and for any query executed in the
 * context of company A, the results SHALL NOT include any records with
 * companyId equal to B's identifier."
 *
 * Feature: phase-0-foundation, Property 1: Company data isolation
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { registerErrorHandler } from '../../api/error-handler'
import * as schema from '../../db/schema'
import { registerCompanyRoutes } from '../companies'
import { registerCompanySettingsRoutes } from '../company-settings'

// Mock the server module to provide controlled db instances
vi.mock('../../server', () => ({
  getDb: vi.fn(),
  getSqlite: vi.fn()
}))

import { getDb } from '../../server'

const mockedGetDb = vi.mocked(getDb)

/**
 * Creates an in-memory SQLite database with the tables needed for this test:
 * companies, company_settings, and users.
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

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'admin',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX users_company_email_unique ON users(company_id, email);
    CREATE INDEX users_company_idx ON users(company_id);
    CREATE INDEX users_role_idx ON users(role);

    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX audit_logs_company_idx ON audit_logs(company_id);
    CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
    CREATE INDEX audit_logs_user_idx ON audit_logs(user_id);
  `)

  return sqlite
}

/**
 * Arbitrary for generating a company with a unique document number.
 * Uses a simple numeric string to avoid complex regex generation.
 */
interface GeneratedCompany {
  name: string
  documentNumber: string
  tradeName: string | null
}

const companyArbitrary: fc.Arbitrary<GeneratedCompany> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  documentNumber: fc.nat({ max: 99999999999999 }).map((n) => n.toString().padStart(14, '0')),
  tradeName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null })
})

/**
 * Arbitrary for generating a user to be associated with a company.
 */
interface GeneratedUser {
  name: string
  email: string
}

const userArbitrary: fc.Arbitrary<GeneratedUser> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  email: fc.emailAddress()
})

describe('Company data isolation (Property 1)', () => {
  it("company settings queries return only the settings for the requested company, never another company's settings", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(companyArbitrary, {
          minLength: 2,
          maxLength: 5,
          comparator: (a, b) => a.documentNumber === b.documentNumber
        }),
        fc.array(userArbitrary, { minLength: 1, maxLength: 3 }),
        async (companiesData, usersData) => {
          // Create a fresh database and Fastify instance for each iteration
          const sqlite = createTestDb()
          const db = drizzle(sqlite, { schema })
          mockedGetDb.mockReturnValue(db)

          const fastify = Fastify()
          registerErrorHandler(fastify)
          registerCompanyRoutes(fastify)
          registerCompanySettingsRoutes(fastify)
          await fastify.ready()

          try {
            const now = new Date().toISOString()
            const createdCompanyIds: number[] = []

            // Create all companies via the API
            for (const company of companiesData) {
              const response = await fastify.inject({
                method: 'POST',
                url: '/api/companies',
                payload: {
                  name: company.name,
                  documentNumber: company.documentNumber,
                  tradeName: company.tradeName
                }
              })

              expect(response.statusCode).toBe(201)
              const body = response.json()
              createdCompanyIds.push(body.data.id)
            }

            // Create users for each company (ensures scoped data exists)
            for (const companyId of createdCompanyIds) {
              for (let i = 0; i < usersData.length; i++) {
                const user = usersData[i]
                const uniqueEmail = `user${i}_c${companyId}@test.local`
                sqlite
                  .prepare(
                    'INSERT INTO users (company_id, name, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
                  )
                  .run(companyId, user.name, uniqueEmail, 'admin', 'active', now, now)
              }
            }

            // Verify data isolation: each company's settings endpoint returns only its own data
            for (let i = 0; i < createdCompanyIds.length; i++) {
              const companyId = createdCompanyIds[i]

              const settingsResponse = await fastify.inject({
                method: 'GET',
                url: `/api/companies/${companyId}/settings`
              })

              expect(settingsResponse.statusCode).toBe(200)
              const settingsBody = settingsResponse.json()

              // The settings must belong to this company, not any other
              expect(settingsBody.data.companyId).toBe(companyId)

              // Verify no other company's ID appears in the response
              for (let j = 0; j < createdCompanyIds.length; j++) {
                if (j !== i) {
                  expect(settingsBody.data.companyId).not.toBe(createdCompanyIds[j])
                }
              }
            }

            // Cross-company access check: company A's endpoint never returns company B's data
            for (let i = 0; i < createdCompanyIds.length; i++) {
              for (let j = i + 1; j < createdCompanyIds.length; j++) {
                const companyAId = createdCompanyIds[i]
                const companyBId = createdCompanyIds[j]

                const responseA = await fastify.inject({
                  method: 'GET',
                  url: `/api/companies/${companyAId}/settings`
                })

                const responseB = await fastify.inject({
                  method: 'GET',
                  url: `/api/companies/${companyBId}/settings`
                })

                expect(responseA.statusCode).toBe(200)
                expect(responseB.statusCode).toBe(200)

                const dataA = responseA.json().data
                const dataB = responseB.json().data

                // Company A's settings must have companyId = A, not B
                expect(dataA.companyId).toBe(companyAId)
                expect(dataA.companyId).not.toBe(companyBId)

                // Company B's settings must have companyId = B, not A
                expect(dataB.companyId).toBe(companyBId)
                expect(dataB.companyId).not.toBe(companyAId)

                // Settings records must be distinct
                expect(dataA.id).not.toBe(dataB.id)
              }
            }

            // Verify that a non-existent company ID returns 404 (no data leakage)
            const maxId = Math.max(...createdCompanyIds)
            const nonExistentId = maxId + 999

            const notFoundResponse = await fastify.inject({
              method: 'GET',
              url: `/api/companies/${nonExistentId}/settings`
            })

            expect(notFoundResponse.statusCode).toBe(404)
            const notFoundBody = notFoundResponse.json()
            expect(notFoundBody.success).toBe(false)
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
