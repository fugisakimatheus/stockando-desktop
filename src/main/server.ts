import { join } from 'node:path'

import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import Fastify, { type FastifyInstance } from 'fastify'

import { registerErrorHandler } from './api/error-handler'
import { migration001 } from './db/migrations/001-initial-schema'
import { MigrationError, runMigrations } from './db/migrations/index'
import * as schema from './db/schema'
import { seedDefaults } from './db/seed'
import { registerBootstrapRoutes } from './routes/bootstrap'
import { registerCompanyRoutes } from './routes/companies'
import { registerCompanySettingsRoutes } from './routes/company-settings'
import { registerSettingsRoutes } from './routes/settings'

const HOST = '127.0.0.1'
const PORT = 3000

export interface BootstrapResult {
  status: 'success' | 'error'
  error?: { code: string; message: string }
  lastActiveCompanyId?: number | null
}

let fastifyInstance: FastifyInstance | null = null
let dbInstance: BetterSQLite3Database<typeof schema> | null = null
let sqliteInstance: Database.Database | null = null

/**
 * Returns the Drizzle ORM instance. Throws if called before bootstrap.
 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call startServer() first.')
  }
  return dbInstance
}

/**
 * Returns the raw better-sqlite3 instance. Throws if called before bootstrap.
 */
export function getSqlite(): Database.Database {
  if (!sqliteInstance) {
    throw new Error('SQLite not initialized. Call startServer() first.')
  }
  return sqliteInstance
}

/**
 * Bootstraps the application:
 * 1. Opens SQLite with WAL mode
 * 2. Runs pending migrations
 * 3. Seeds default data on first run
 * 4. Starts the Fastify HTTP server with CORS and error handling
 * 5. Returns a BootstrapResult with status and last active company
 */
export async function startServer(): Promise<BootstrapResult> {
  if (fastifyInstance) {
    return { status: 'success', lastActiveCompanyId: readLastActiveCompanyId() }
  }

  // 1. Open SQLite connection with WAL mode
  const dbPath = join(app.getPath('userData'), 'database.sqlite')
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  // 2. Run pending migrations
  try {
    runMigrations(sqlite, [migration001])
  } catch (error) {
    if (error instanceof MigrationError) {
      return {
        status: 'error',
        error: {
          code: 'MIGRATION_FAILED',
          message: `Migration ${error.version} (${error.migrationName}) failed: ${error.cause.message}`
        }
      }
    }

    const message = error instanceof Error ? error.message : 'Unknown migration error'
    return {
      status: 'error',
      error: { code: 'MIGRATION_FAILED', message }
    }
  }

  // 3. Seed default data if first run
  seedDefaults(sqlite)

  // 4. Initialize Drizzle ORM
  const db = drizzle(sqlite, { schema })
  dbInstance = db
  sqliteInstance = sqlite

  // 5. Start Fastify with CORS and error handling
  const fastify = Fastify({ logger: true })

  // Register global error handler
  registerErrorHandler(fastify)

  // Register API routes
  registerBootstrapRoutes(fastify)
  registerCompanyRoutes(fastify)
  registerCompanySettingsRoutes(fastify)
  registerSettingsRoutes(fastify)

  // CORS for all routes and methods
  fastify.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Access-Control-Allow-Origin', '*')
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    reply.header('Access-Control-Allow-Headers', 'Content-Type')
    return payload
  })

  // Handle preflight OPTIONS for all routes
  fastify.options('/*', async (_request, reply) => {
    reply.code(204).send()
  })

  await fastify.listen({ host: HOST, port: PORT })
  fastify.log.info(`Fastify running at http://${HOST}:${PORT}`)

  fastifyInstance = fastify

  // 6. Read last active company and return success
  const lastActiveCompanyId = readLastActiveCompanyId()

  return { status: 'success', lastActiveCompanyId }
}

/**
 * Stops the Fastify server and closes the SQLite connection.
 */
export async function stopServer(): Promise<void> {
  if (fastifyInstance) {
    await fastifyInstance.close()
    fastifyInstance = null
  }

  if (sqliteInstance) {
    sqliteInstance.close()
    sqliteInstance = null
  }

  dbInstance = null
}

/**
 * Reads the lastActiveCompanyId from app_settings.
 * Returns null if not set or if the value is 'null'.
 */
function readLastActiveCompanyId(): number | null {
  if (!sqliteInstance) return null

  try {
    const row = sqliteInstance.prepare("SELECT value FROM app_settings WHERE key = 'lastActiveCompanyId'").get() as
      | { value: string }
      | undefined

    if (!row || row.value === 'null') return null

    const parsed = Number(row.value)
    return Number.isNaN(parsed) ? null : parsed
  } catch {
    return null
  }
}
