/**
 * Database migration script for development.
 *
 * Usage:
 *   pnpm db:migrate          — apply pending migrations
 *   pnpm db:migrate --fresh  — delete the database and re-run all migrations + seed
 *
 * This script resolves the database path the same way the Electron app does
 * (using the platform-specific userData directory) so it operates on the same
 * file the app will open at runtime.
 */
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

import Database from 'better-sqlite3'

import { migration001 } from '../src/main/db/migrations/001-initial-schema'
import { runMigrations } from '../src/main/db/migrations/index'
import { seedDefaults } from '../src/main/db/seed'

// ---------------------------------------------------------------------------
// Resolve database path (mirrors Electron's app.getPath('userData'))
// ---------------------------------------------------------------------------

function resolveDbPath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ''

  const platform = process.platform
  let userDataDir: string

  if (platform === 'darwin') {
    userDataDir = join(home, 'Library', 'Application Support', 'stockando-desktop')
  } else if (platform === 'win32') {
    userDataDir = join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'stockando-desktop')
  } else {
    userDataDir = join(home, '.config', 'stockando-desktop')
  }

  // Ensure the directory exists
  if (!existsSync(userDataDir)) {
    mkdirSync(userDataDir, { recursive: true })
  }

  return join(userDataDir, 'database.sqlite')
}

// ---------------------------------------------------------------------------
// All registered migrations (add new ones here as the app grows)
// ---------------------------------------------------------------------------

const ALL_MIGRATIONS = [migration001]

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2)
  const isFresh = args.includes('--fresh')

  const dbPath = resolveDbPath()

  if (isFresh) {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath)
      console.log(`Deleted existing database: ${dbPath}`)
    }
  }

  console.log(`Database path: ${dbPath}`)

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  try {
    const result = runMigrations(sqlite, ALL_MIGRATIONS)

    if (result.applied > 0) {
      console.log(`Applied ${result.applied} migration(s) (total: ${result.total}, version: ${result.lastVersion})`)
    } else {
      console.log(`No pending migrations (current version: ${result.lastVersion})`)
    }

    // Seed defaults on fresh databases
    seedDefaults(sqlite)
    console.log('Seed defaults verified.')

    console.log('Done.')
  } catch (error) {
    console.error('Migration failed:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    sqlite.close()
  }
}

main()
