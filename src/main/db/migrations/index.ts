import type Database from 'better-sqlite3'

export interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

export interface MigrationResult {
  applied: number
  total: number
  lastVersion: number
}

const MIGRATIONS_TABLE = '_migrations'

function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)
}

function getAppliedVersions(db: Database.Database): Set<number> {
  const rows = db.prepare(`SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY version ASC`).all() as { version: number }[]

  return new Set(rows.map((r) => r.version))
}

function recordMigration(db: Database.Database, migration: Migration): void {
  db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (version, name, applied_at) VALUES (?, ?, ?)`).run(
    migration.version,
    migration.name,
    new Date().toISOString()
  )
}

/**
 * Runs all pending migrations in strictly ascending version order.
 * Each migration executes within its own transaction — on failure the
 * individual migration is rolled back and the runner halts immediately.
 */
export function runMigrations(db: Database.Database, migrations: Migration[]): MigrationResult {
  ensureMigrationsTable(db)

  const appliedVersions = getAppliedVersions(db)

  // Sort migrations in strictly ascending version order
  const sorted = [...migrations].sort((a, b) => a.version - b.version)

  const pending = sorted.filter((m) => !appliedVersions.has(m.version))

  let applied = 0

  for (const migration of pending) {
    const transaction = db.transaction(() => {
      migration.up(db)
      recordMigration(db, migration)
    })

    try {
      transaction()
      applied++
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown migration error'

      throw new MigrationError(
        `Migration ${migration.version} (${migration.name}) failed: ${message}`,
        migration.version,
        migration.name,
        error instanceof Error ? error : new Error(message)
      )
    }
  }

  const lastVersion = sorted.length > 0 ? sorted[sorted.length - 1].version : 0
  const total = sorted.length

  return { applied, total, lastVersion }
}

export class MigrationError extends Error {
  readonly version: number
  readonly migrationName: string
  readonly cause: Error

  constructor(message: string, version: number, migrationName: string, cause: Error) {
    super(message)
    this.name = 'MigrationError'
    this.version = version
    this.migrationName = migrationName
    this.cause = cause
  }
}
