/**
 * Property test for migration sequential ordering.
 *
 * **Validates: Requirements 6.2**
 *
 * Property 2: Migration sequential ordering
 * "For any set of pending migrations, the Migration Runner SHALL apply them
 * in strictly ascending version order, and the resulting database version
 * SHALL equal the highest migration version applied."
 *
 * Feature: phase-0-foundation, Property 2: Migration sequential ordering
 */
import Database from 'better-sqlite3'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type { Migration } from '../index'
import { runMigrations } from '../index'

/**
 * Generates an array of Migration objects with unique random version numbers.
 * Each migration creates a table named `test_v{version}` to prove it was executed.
 */
const migrationsArbitrary = fc
  .uniqueArray(fc.integer({ min: 1, max: 10_000 }), { minLength: 1, maxLength: 20 })
  .map((versions) =>
    versions.map(
      (version): Migration => ({
        version,
        name: `migration_v${version}`,
        up: (db) => {
          db.exec(`CREATE TABLE test_v${version} (id INTEGER PRIMARY KEY)`)
        }
      })
    )
  )

describe('Migration sequential ordering (Property 2)', () => {
  it('applies migrations in strictly ascending version order and reports the highest version', () => {
    fc.assert(
      fc.property(migrationsArbitrary, (migrations) => {
        const db = new Database(':memory:')

        try {
          const result = runMigrations(db, migrations)

          // Read the _migrations table to verify application order
          const applied = db.prepare('SELECT version FROM _migrations ORDER BY rowid ASC').all() as {
            version: number
          }[]

          const appliedVersions = applied.map((row) => row.version)

          // Assert: migrations were applied in strictly ascending order
          for (let i = 1; i < appliedVersions.length; i++) {
            expect(appliedVersions[i]).toBeGreaterThan(appliedVersions[i - 1])
          }

          // Assert: the applied versions are sorted (redundant with above, but explicit)
          const sorted = [...appliedVersions].sort((a, b) => a - b)
          expect(appliedVersions).toEqual(sorted)

          // Assert: the last version equals the highest version in the input set
          const highestVersion = Math.max(...migrations.map((m) => m.version))
          expect(result.lastVersion).toBe(highestVersion)

          // Assert: number of applied migrations matches the input set size
          expect(result.applied).toBe(migrations.length)
          expect(appliedVersions.length).toBe(migrations.length)
        } finally {
          db.close()
        }
      }),
      { numRuns: 100 }
    )
  })
})
