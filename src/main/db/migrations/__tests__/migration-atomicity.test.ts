import Database from 'better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { MigrationError, runMigrations } from '../index'
import type { Migration } from '../index'

/**
 * Feature: phase-0-foundation, Property 3: Migration transactional atomicity
 *
 * For any migration that fails during execution, the database state SHALL be
 * identical to the state before that migration began — no partial schema or
 * data changes persist.
 *
 * **Validates: Requirements 6.3**
 */
describe('Property 3: Migration transactional atomicity', () => {
  function createSuccessfulMigration(version: number): Migration {
    return {
      version,
      name: `create_test_v${version}`,
      up: (db) => {
        db.exec(`CREATE TABLE test_v${version} (id INTEGER PRIMARY KEY)`)
      }
    }
  }

  function createFailingMigration(version: number): Migration {
    return {
      version,
      name: `failing_v${version}`,
      up: (db) => {
        // Partial work: create a table
        db.exec(`CREATE TABLE test_v${version} (id INTEGER PRIMARY KEY)`)
        // Then throw — transaction should roll back the table creation
        throw new Error(`Simulated failure in migration ${version}`)
      }
    }
  }

  function tableExists(db: Database.Database, tableName: string): boolean {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tableName) as
      | { name: string }
      | undefined
    return row !== undefined
  }

  function migrationRecorded(db: Database.Database, version: number): boolean {
    const row = db.prepare(`SELECT version FROM _migrations WHERE version=?`).get(version) as
      | { version: number }
      | undefined
    return row !== undefined
  }

  it('should roll back partial changes when a migration fails', () => {
    fc.assert(
      fc.property(
        // Generate total migration count (2–10) and a failure position within that range
        fc.integer({ min: 2, max: 10 }).chain((totalCount) =>
          fc.record({
            totalCount: fc.constant(totalCount),
            failIndex: fc.integer({ min: 0, max: totalCount - 1 })
          })
        ),
        ({ totalCount, failIndex }) => {
          const db = new Database(':memory:')

          // Build migration sequence with one failing at failIndex
          const migrations: Migration[] = []
          for (let i = 0; i < totalCount; i++) {
            const version = i + 1
            if (i === failIndex) {
              migrations.push(createFailingMigration(version))
            } else {
              migrations.push(createSuccessfulMigration(version))
            }
          }

          // runMigrations should throw a MigrationError
          expect(() => runMigrations(db, migrations)).toThrow(MigrationError)

          // Assertions:
          // a) All migrations BEFORE the failing one are applied
          for (let i = 0; i < failIndex; i++) {
            const version = i + 1
            expect(tableExists(db, `test_v${version}`)).toBe(true)
            expect(migrationRecorded(db, version)).toBe(true)
          }

          // b) The failing migration's partial changes do NOT exist
          const failVersion = failIndex + 1
          expect(tableExists(db, `test_v${failVersion}`)).toBe(false)
          expect(migrationRecorded(db, failVersion)).toBe(false)

          // c) All migrations AFTER the failing one are NOT applied
          for (let i = failIndex + 1; i < totalCount; i++) {
            const version = i + 1
            expect(tableExists(db, `test_v${version}`)).toBe(false)
            expect(migrationRecorded(db, version)).toBe(false)
          }

          db.close()
        }
      ),
      { numRuns: 100 }
    )
  })
})
