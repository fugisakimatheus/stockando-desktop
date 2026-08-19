/**
 * Feature: phase-0-foundation, Property 7: Settings write atomicity
 *
 * For any settings write operation, either all setting values are persisted
 * and the new values are returned on subsequent reads, or the operation fails
 * and all previous values remain unchanged.
 *
 * **Validates: Requirements 4.2, 4.4**
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as fc from 'fast-check'
import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerErrorHandler } from '../../api/error-handler'
import * as schema from '../../db/schema'
import { registerSettingsRoutes } from '../settings'

// Mock the server module to provide controlled db instances
vi.mock('../../server', () => ({
  getDb: vi.fn(),
  getSqlite: vi.fn()
}))

import { getDb, getSqlite } from '../../server'

const mockedGetDb = vi.mocked(getDb)
const mockedGetSqlite = vi.mocked(getSqlite)

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
    )
  `)

  return sqlite
}

/**
 * Arbitrary that generates valid settings key strings.
 * Keys are alphanumeric with optional dots/underscores, 1–30 chars.
 */
const settingsKeyArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9._]{0,29}$/)

/**
 * Arbitrary that generates valid settings value strings (non-empty, printable).
 */
const settingsValueArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0)

/**
 * Arbitrary that generates a batch of 1–10 unique key-value pairs for settings.
 */
const settingsBatchArb = fc.uniqueArray(settingsKeyArb, { minLength: 1, maxLength: 10 }).chain((keys) =>
  fc.tuple(...keys.map(() => settingsValueArb)).map((values) => {
    const entries: Record<string, string> = {}
    keys.forEach((key, i) => {
      entries[key] = values[i]
    })
    return entries
  })
)

describe('Property 7: Settings write atomicity', () => {
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
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify.close()
    sqlite.close()
  })

  it('all written values appear in subsequent reads (all-or-nothing success)', async () => {
    await fc.assert(
      fc.asyncProperty(settingsBatchArb, async (batch) => {
        // Write the settings batch
        const writeResponse = await fastify.inject({
          method: 'PUT',
          url: '/api/settings',
          payload: batch
        })

        expect(writeResponse.statusCode).toBe(200)
        const writeBody = writeResponse.json()
        expect(writeBody.success).toBe(true)

        // Verify ALL written values appear in the response
        for (const [key, value] of Object.entries(batch)) {
          expect(writeBody.data[key]).toBe(value)
        }

        // Read settings independently and verify persistence
        const readResponse = await fastify.inject({
          method: 'GET',
          url: '/api/settings'
        })

        expect(readResponse.statusCode).toBe(200)
        const readBody = readResponse.json()
        expect(readBody.success).toBe(true)

        // ALL written values must be present in the read
        for (const [key, value] of Object.entries(batch)) {
          expect(readBody.data[key]).toBe(value)
        }

        // Clean up for next iteration
        sqlite.exec('DELETE FROM app_settings')
      }),
      { numRuns: 100 }
    )
  })

  it('sequential writes preserve all values from both batches', async () => {
    await fc.assert(
      fc.asyncProperty(settingsBatchArb, settingsBatchArb, async (batch1, batch2) => {
        // Write first batch
        const write1 = await fastify.inject({
          method: 'PUT',
          url: '/api/settings',
          payload: batch1
        })

        expect(write1.statusCode).toBe(200)
        expect(write1.json().success).toBe(true)

        // Write second batch
        const write2 = await fastify.inject({
          method: 'PUT',
          url: '/api/settings',
          payload: batch2
        })

        expect(write2.statusCode).toBe(200)
        expect(write2.json().success).toBe(true)

        // Read and verify BOTH batches are reflected
        const readResponse = await fastify.inject({
          method: 'GET',
          url: '/api/settings'
        })

        expect(readResponse.statusCode).toBe(200)
        const readBody = readResponse.json()
        expect(readBody.success).toBe(true)

        // Merge expected: batch2 values override batch1 for shared keys
        const expected = { ...batch1, ...batch2 }

        for (const [key, value] of Object.entries(expected)) {
          expect(readBody.data[key]).toBe(value)
        }

        // Clean up for next iteration
        sqlite.exec('DELETE FROM app_settings')
      }),
      { numRuns: 100 }
    )
  })

  it('invalid payload (empty object) returns 400 and previous settings remain unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(settingsBatchArb, async (initialBatch) => {
        // Set up initial state with valid settings
        const setupResponse = await fastify.inject({
          method: 'PUT',
          url: '/api/settings',
          payload: initialBatch
        })
        expect(setupResponse.statusCode).toBe(200)

        // Attempt to write empty object — should fail with 400
        const failedWrite = await fastify.inject({
          method: 'PUT',
          url: '/api/settings',
          payload: {}
        })

        expect(failedWrite.statusCode).toBe(400)
        const failBody = failedWrite.json()
        expect(failBody.success).toBe(false)
        expect(failBody.error.code).toBe('VALIDATION_ERROR')

        // Read settings — previous values must remain unchanged
        const readResponse = await fastify.inject({
          method: 'GET',
          url: '/api/settings'
        })

        expect(readResponse.statusCode).toBe(200)
        const readBody = readResponse.json()
        expect(readBody.success).toBe(true)

        for (const [key, value] of Object.entries(initialBatch)) {
          expect(readBody.data[key]).toBe(value)
        }

        // Clean up for next iteration
        sqlite.exec('DELETE FROM app_settings')
      }),
      { numRuns: 100 }
    )
  })

  it('invalid payload (non-string values) returns 400 and previous settings remain unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(settingsBatchArb, async (initialBatch) => {
        // Set up initial state with valid settings
        const setupResponse = await fastify.inject({
          method: 'PUT',
          url: '/api/settings',
          payload: initialBatch
        })
        expect(setupResponse.statusCode).toBe(200)

        // Attempt to write non-string values — should fail with 400
        const failedWrite = await fastify.inject({
          method: 'PUT',
          url: '/api/settings',
          payload: { invalidKey: 12345 }
        })

        expect(failedWrite.statusCode).toBe(400)
        const failBody = failedWrite.json()
        expect(failBody.success).toBe(false)
        expect(failBody.error.code).toBe('VALIDATION_ERROR')

        // Read settings — previous values must remain unchanged
        const readResponse = await fastify.inject({
          method: 'GET',
          url: '/api/settings'
        })

        expect(readResponse.statusCode).toBe(200)
        const readBody = readResponse.json()
        expect(readBody.success).toBe(true)

        for (const [key, value] of Object.entries(initialBatch)) {
          expect(readBody.data[key]).toBe(value)
        }

        // Clean up for next iteration
        sqlite.exec('DELETE FROM app_settings')
      }),
      { numRuns: 100 }
    )
  })
})
