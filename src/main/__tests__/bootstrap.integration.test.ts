/**
 * Integration tests for the bootstrap sequence.
 *
 * Exercises the full bootstrap flow (migration runner + seed + bootstrap route)
 * against in-memory SQLite databases.
 *
 * Test cases:
 * a. Fresh database initialization end-to-end
 * b. Startup with existing database and pending migrations (idempotent re-run)
 * c. Startup failure handling (failed migration)
 * d. Bootstrap route returns correct data
 *
 * **Validates: Requirements 1.1, 1.3, 1.4, 1.5**
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerErrorHandler } from '../api/error-handler'
import { migration001 } from '../db/migrations/001-initial-schema'
import type { Migration } from '../db/migrations/index'
import { MigrationError, runMigrations } from '../db/migrations/index'
import * as schema from '../db/schema'
import { seedDefaults } from '../db/seed'
import { registerBootstrapRoutes } from '../routes/bootstrap'

// Mock the server module to provide controlled db instances
vi.mock('../server', () => ({
  getDb: vi.fn(),
  getSqlite: vi.fn()
}))

import { getDb } from '../server'

const mockedGetDb = vi.mocked(getDb)

/**
 * Expected tables created by migration 001.
 */
const EXPECTED_TABLES = [
  'app_settings',
  'companies',
  'company_settings',
  'users',
  'roles',
  'role_permissions',
  'audit_logs'
]

describe('Bootstrap sequence integration tests', () => {
  describe('Fresh database initialization', () => {
    it('creates all expected tables when running migrations on a fresh database', () => {
      const db = new Database(':memory:')
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')

      try {
        const result = runMigrations(db, [migration001])

        // Verify migration result
        expect(result.applied).toBe(1)
        expect(result.total).toBe(1)
        expect(result.lastVersion).toBe(1)

        // Verify all expected tables exist in sqlite_master
        // Exclude internal tables (sqlite_* auto-created, _migrations tracking table)
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]

        const tableNames = tables
          .map((t) => t.name)
          .filter((name) => !name.startsWith('sqlite_') && !name.startsWith('_'))

        for (const expectedTable of EXPECTED_TABLES) {
          expect(tableNames).toContain(expectedTable)
        }
      } finally {
        db.close()
      }
    })

    it('seeds default app settings on first run', () => {
      const db = new Database(':memory:')
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')

      try {
        runMigrations(db, [migration001])
        seedDefaults(db)

        // Verify defaults were inserted
        const settings = db.prepare('SELECT key, value FROM app_settings ORDER BY key ASC').all() as {
          key: string
          value: string
        }[]

        expect(settings).toHaveLength(2)

        const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))
        expect(settingsMap['theme']).toBe('system')
        expect(settingsMap['lastActiveCompanyId']).toBe('null')
      } finally {
        db.close()
      }
    })

    it('creates the _migrations tracking table', () => {
      const db = new Database(':memory:')
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')

      try {
        runMigrations(db, [migration001])

        const migrationTable = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_migrations'")
          .get() as { name: string } | undefined

        expect(migrationTable).toBeDefined()
        expect(migrationTable?.name).toBe('_migrations')
      } finally {
        db.close()
      }
    })

    it('records the applied migration in the _migrations table', () => {
      const db = new Database(':memory:')
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')

      try {
        runMigrations(db, [migration001])

        const applied = db.prepare('SELECT version, name, applied_at FROM _migrations').all() as {
          version: number
          name: string
          applied_at: string
        }[]

        expect(applied).toHaveLength(1)
        expect(applied[0].version).toBe(1)
        expect(applied[0].name).toBe('001-initial-schema')
        expect(applied[0].applied_at).toBeTruthy()

        // applied_at should be a valid ISO date string
        expect(new Date(applied[0].applied_at).toISOString()).toBe(applied[0].applied_at)
      } finally {
        db.close()
      }
    })

    it('creates indexes and foreign key constraints', () => {
      const db = new Database(':memory:')
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')

      try {
        runMigrations(db, [migration001])

        // Verify some important indexes exist
        const indexes = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'")
          .all() as { name: string }[]

        const indexNames = indexes.map((i) => i.name)

        expect(indexNames).toContain('companies_document_number_unique')
        expect(indexNames).toContain('companies_status_idx')
        expect(indexNames).toContain('users_company_email_unique')
        expect(indexNames).toContain('users_company_idx')
        expect(indexNames).toContain('audit_logs_company_idx')
      } finally {
        db.close()
      }
    })
  })

  describe('Startup with existing database and pending migrations', () => {
    it('does not re-apply already applied migrations (idempotent)', () => {
      const db = new Database(':memory:')
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')

      try {
        // First run — applies migration 001
        const firstResult = runMigrations(db, [migration001])
        expect(firstResult.applied).toBe(1)

        // Verify _migrations table has version 1
        const applied = db.prepare('SELECT version FROM _migrations').all() as { version: number }[]
        expect(applied).toHaveLength(1)
        expect(applied[0].version).toBe(1)

        // Second run — should apply 0 new migrations
        const secondResult = runMigrations(db, [migration001])
        expect(secondResult.applied).toBe(0)
        expect(secondResult.total).toBe(1)
        expect(secondResult.lastVersion).toBe(1)

        // _migrations table still has exactly one entry
        const appliedAfter = db.prepare('SELECT version FROM _migrations').all() as { version: number }[]
        expect(appliedAfter).toHaveLength(1)
      } finally {
        db.close()
      }
    })

    it('applies only pending migrations when new ones are added', () => {
      const db = new Database(':memory:')
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')

      const migration002: Migration = {
        version: 2,
        name: '002-test-migration',
        up: (sqliteDb) => {
          sqliteDb.exec('CREATE TABLE test_new_table (id INTEGER PRIMARY KEY)')
        }
      }

      try {
        // First run — applies migration 001
        runMigrations(db, [migration001])

        // Second run with a new migration — should apply only 002
        const result = runMigrations(db, [migration001, migration002])
        expect(result.applied).toBe(1)
        expect(result.total).toBe(2)
        expect(result.lastVersion).toBe(2)

        // Verify both migrations are recorded
        const applied = db.prepare('SELECT version FROM _migrations ORDER BY version ASC').all() as {
          version: number
        }[]
        expect(applied).toHaveLength(2)
        expect(applied[0].version).toBe(1)
        expect(applied[1].version).toBe(2)

        // Verify the new table was created
        const newTable = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'test_new_table'")
          .get() as { name: string } | undefined
        expect(newTable).toBeDefined()
      } finally {
        db.close()
      }
    })

    it('seed is idempotent — does not duplicate rows on second run', () => {
      const db = new Database(':memory:')
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')

      try {
        runMigrations(db, [migration001])

        // First seed
        seedDefaults(db)
        const countAfterFirst = (db.prepare('SELECT COUNT(*) as count FROM app_settings').get() as { count: number })
          .count

        // Second seed — should not add more rows
        seedDefaults(db)
        const countAfterSecond = (db.prepare('SELECT COUNT(*) as count FROM app_settings').get() as { count: number })
          .count

        expect(countAfterFirst).toBe(2)
        expect(countAfterSecond).toBe(2)
      } finally {
        db.close()
      }
    })
  })

  describe('Startup failure handling', () => {
    it('throws MigrationError when a migration fails', () => {
      const db = new Database(':memory:')
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')

      const failingMigration: Migration = {
        version: 1,
        name: 'failing-migration',
        up: () => {
          throw new Error('Simulated migration failure')
        }
      }

      try {
        expect(() => runMigrations(db, [failingMigration])).toThrow(MigrationError)
      } finally {
        db.close()
      }
    })

    it('preserves database in clean state when migration fails (no partial tables)', () => {
      const db = new Database(':memory:')
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')

      const partialMigration: Migration = {
        version: 1,
        name: 'partial-failure-migration',
        up: (sqliteDb) => {
          // Create a table, then throw — should be rolled back
          sqliteDb.exec('CREATE TABLE partial_table (id INTEGER PRIMARY KEY)')
          throw new Error('Failure after partial work')
        }
      }

      try {
        expect(() => runMigrations(db, [partialMigration])).toThrow(MigrationError)

        // The partial table should NOT exist (transaction rolled back)
        const table = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'partial_table'")
          .get() as { name: string } | undefined

        expect(table).toBeUndefined()

        // _migrations table should exist (created by ensureMigrationsTable) but be empty
        const migrations = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_migrations'")
          .get() as { name: string } | undefined
        expect(migrations).toBeDefined()

        const applied = db.prepare('SELECT COUNT(*) as count FROM _migrations').get() as { count: number }
        expect(applied.count).toBe(0)
      } finally {
        db.close()
      }
    })

    it('halts on first failure and does not apply subsequent migrations', () => {
      const db = new Database(':memory:')
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')

      const goodMigration: Migration = {
        version: 1,
        name: 'good-migration',
        up: (sqliteDb) => {
          sqliteDb.exec('CREATE TABLE good_table (id INTEGER PRIMARY KEY)')
        }
      }

      const failingMigration: Migration = {
        version: 2,
        name: 'failing-migration',
        up: () => {
          throw new Error('Failure in migration 2')
        }
      }

      const afterFailMigration: Migration = {
        version: 3,
        name: 'after-fail-migration',
        up: (sqliteDb) => {
          sqliteDb.exec('CREATE TABLE after_fail_table (id INTEGER PRIMARY KEY)')
        }
      }

      try {
        expect(() => runMigrations(db, [goodMigration, failingMigration, afterFailMigration])).toThrow(MigrationError)

        // Migration 1 should have been applied successfully
        const goodTable = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'good_table'")
          .get() as { name: string } | undefined
        expect(goodTable).toBeDefined()

        // Migration 3 should NOT have been applied (halted at 2)
        const afterFailTable = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'after_fail_table'")
          .get() as { name: string } | undefined
        expect(afterFailTable).toBeUndefined()

        // Only migration 1 recorded
        const applied = db.prepare('SELECT version FROM _migrations').all() as { version: number }[]
        expect(applied).toHaveLength(1)
        expect(applied[0].version).toBe(1)
      } finally {
        db.close()
      }
    })

    it('MigrationError includes version, name, and cause details', () => {
      const db = new Database(':memory:')
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')

      const failingMigration: Migration = {
        version: 42,
        name: 'error-details-test',
        up: () => {
          throw new Error('Specific error message')
        }
      }

      try {
        let caughtError: MigrationError | null = null

        try {
          runMigrations(db, [failingMigration])
        } catch (error) {
          if (error instanceof MigrationError) {
            caughtError = error
          }
        }

        expect(caughtError).not.toBeNull()
        if (caughtError === null) throw new Error('unreachable')
        expect(caughtError.version).toBe(42)
        expect(caughtError.migrationName).toBe('error-details-test')
        expect(caughtError.cause.message).toBe('Specific error message')
        expect(caughtError.message).toContain('42')
        expect(caughtError.message).toContain('error-details-test')
      } finally {
        db.close()
      }
    })
  })

  describe('Bootstrap route returns correct data', () => {
    let sqlite: Database.Database
    let fastify: ReturnType<typeof Fastify>

    beforeEach(async () => {
      sqlite = new Database(':memory:')
      sqlite.pragma('journal_mode = WAL')
      sqlite.pragma('foreign_keys = ON')

      // Run the full bootstrap: migrations + seed
      runMigrations(sqlite, [migration001])
      seedDefaults(sqlite)

      const db = drizzle(sqlite, { schema })
      mockedGetDb.mockReturnValue(db)

      fastify = Fastify()
      registerErrorHandler(fastify)
      registerBootstrapRoutes(fastify)
      await fastify.ready()
    })

    afterEach(async () => {
      await fastify.close()
      sqlite.close()
    })

    it('returns status "ready" and lastActiveCompanyId null when no company is active', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/bootstrap'
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()

      expect(body.success).toBe(true)
      expect(body.data.status).toBe('ready')
      expect(body.data.lastActiveCompanyId).toBeNull()
      expect(body.data.companies).toEqual([])
    })

    it('returns companies list when companies exist', async () => {
      const now = new Date().toISOString()
      sqlite
        .prepare('INSERT INTO companies (name, document_number, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run('Beta Corp', '222', 'active', now, now)
      sqlite
        .prepare('INSERT INTO companies (name, document_number, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run('Alpha Inc', '111', 'active', now, now)

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/bootstrap'
      })

      const body = response.json()
      expect(body.success).toBe(true)
      expect(body.data.companies).toHaveLength(2)
      // Companies should be ordered by name
      expect(body.data.companies[0].name).toBe('Alpha Inc')
      expect(body.data.companies[1].name).toBe('Beta Corp')
    })

    it('returns lastActiveCompanyId when one is set', async () => {
      const now = new Date().toISOString()

      // Create a company
      sqlite
        .prepare('INSERT INTO companies (name, document_number, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run('Test Company', '123', 'active', now, now)

      const company = sqlite.prepare('SELECT id FROM companies WHERE document_number = ?').get('123') as { id: number }

      // Set the active company in app_settings
      sqlite.prepare("UPDATE app_settings SET value = ? WHERE key = 'lastActiveCompanyId'").run(String(company.id))

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/bootstrap'
      })

      const body = response.json()
      expect(body.success).toBe(true)
      expect(body.data.lastActiveCompanyId).toBe(company.id)
    })

    it('returns lastActiveCompanyId as null when value is "null" string', async () => {
      // Default seed sets lastActiveCompanyId = 'null' — verify it's parsed correctly
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/bootstrap'
      })

      const body = response.json()
      expect(body.data.lastActiveCompanyId).toBeNull()
    })
  })
})
