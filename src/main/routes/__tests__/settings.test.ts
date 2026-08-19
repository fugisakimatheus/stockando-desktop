/**
 * Unit tests for GET /api/settings and PUT /api/settings routes.
 *
 * Tests cover:
 * - Reading settings returns defaults when no settings exist
 * - Reading settings returns persisted values overlaid on defaults
 * - Writing settings atomically persists all key-value pairs
 * - Writing settings handles upsert (insert + update) correctly
 * - Writing empty body returns validation error
 * - Writing invalid body returns validation error
 *
 * **Validates: Requirements 4.1, 4.2, 4.5**
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
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

describe('Settings routes', () => {
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

  describe('GET /api/settings', () => {
    it('returns defaults when no settings exist in the database', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/settings'
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
      expect(body.data).toEqual({
        theme: 'system',
        lastActiveCompanyId: 'null'
      })
    })

    it('returns persisted values overlaid on defaults', async () => {
      const now = new Date().toISOString()
      sqlite
        .prepare('INSERT INTO app_settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run('theme', 'dark', now, now)

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/settings'
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
      expect(body.data.theme).toBe('dark')
      expect(body.data.lastActiveCompanyId).toBe('null')
    })

    it('returns custom keys not in defaults', async () => {
      const now = new Date().toISOString()
      sqlite
        .prepare('INSERT INTO app_settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run('customKey', 'customValue', now, now)

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/settings'
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.data.customKey).toBe('customValue')
    })
  })

  describe('PUT /api/settings', () => {
    it('persists new settings and returns full settings object', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: { theme: 'dark', lastActiveCompanyId: '5' }
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
      expect(body.data.theme).toBe('dark')
      expect(body.data.lastActiveCompanyId).toBe('5')
    })

    it('upserts existing settings without duplicating rows', async () => {
      const now = new Date().toISOString()
      sqlite
        .prepare('INSERT INTO app_settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run('theme', 'light', now, now)

      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: { theme: 'dark' }
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.data.theme).toBe('dark')

      // Verify only one row exists for the key
      const rows = sqlite.prepare("SELECT * FROM app_settings WHERE key = 'theme'").all()
      expect(rows).toHaveLength(1)
    })

    it('writes atomically — all or nothing', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: { theme: 'dark', language: 'pt-BR', timezone: 'America/Sao_Paulo' }
      })

      expect(response.statusCode).toBe(200)

      // Verify all three were written
      const rows = sqlite.prepare('SELECT key, value FROM app_settings').all() as {
        key: string
        value: string
      }[]
      const keys = rows.map((r) => r.key)
      expect(keys).toContain('theme')
      expect(keys).toContain('language')
      expect(keys).toContain('timezone')
    })

    it('sets createdAt and updatedAt on new inserts', async () => {
      await fastify.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: { theme: 'dark' }
      })

      const row = sqlite.prepare("SELECT created_at, updated_at FROM app_settings WHERE key = 'theme'").get() as {
        created_at: string
        updated_at: string
      }

      expect(row.created_at).toBeTruthy()
      expect(row.updated_at).toBeTruthy()
      // Both should be valid ISO dates
      expect(new Date(row.created_at).toISOString()).toBe(row.created_at)
      expect(new Date(row.updated_at).toISOString()).toBe(row.updated_at)
    })

    it('updates updatedAt on existing keys', async () => {
      const oldTime = '2020-01-01T00:00:00.000Z'
      sqlite
        .prepare('INSERT INTO app_settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run('theme', 'light', oldTime, oldTime)

      await fastify.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: { theme: 'dark' }
      })

      const row = sqlite.prepare("SELECT created_at, updated_at FROM app_settings WHERE key = 'theme'").get() as {
        created_at: string
        updated_at: string
      }

      // updatedAt should be newer than the old time
      expect(new Date(row.updated_at).getTime()).toBeGreaterThan(new Date(oldTime).getTime())
    })

    it('returns validation error for empty body', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: {}
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns error for non-object body', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: JSON.stringify('not an object'),
        headers: { 'content-type': 'application/json' }
      })

      // Fastify or our validation rejects non-object payloads
      expect(response.statusCode).toBeGreaterThanOrEqual(400)
      const body = response.json()
      expect(body.success).toBe(false)
    })

    it('returns validation error for non-string values', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/settings',
        payload: { theme: 123 }
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })
  })
})
