import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { NotFoundError, ValidationError } from '../api/errors'
import { ok } from '../api/types'
import { appSettings, companies } from '../db/schema'
import { nowISO } from '../lib/timestamps'
import { getDb, getSqlite } from '../server'

/**
 * Default app-level settings returned when no settings exist in the database.
 */
const APP_SETTINGS_DEFAULTS: Record<string, string> = {
  theme: 'system',
  lastActiveCompanyId: 'null'
}

/**
 * Zod schema for PUT /api/settings request body.
 * Accepts a record of string key-value pairs.
 */
const updateSettingsSchema = z.record(z.string(), z.string())

/**
 * Reads all app-level settings from the database and returns them as
 * a key-value object. Missing keys are filled with defaults.
 */
function readAllSettings(): Record<string, string> {
  const db = getDb()

  const rows = db.select({ key: appSettings.key, value: appSettings.value }).from(appSettings).all()

  // Start with defaults, then overlay persisted values
  const settings: Record<string, string> = { ...APP_SETTINGS_DEFAULTS }
  for (const row of rows) {
    settings[row.key] = row.value
  }

  return settings
}

/**
 * Registers the app-level settings API routes.
 *
 * - `GET /api/settings` — read all app-level settings as key-value pairs
 * - `PUT /api/settings` — atomically write app-level settings
 */
export function registerSettingsRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/settings
   *
   * Returns all app-level settings as a flat key-value object.
   * If no settings exist, returns the default values.
   */
  fastify.get('/api/settings', async () => {
    const settings = readAllSettings()
    return ok(settings)
  })

  /**
   * PUT /api/settings
   *
   * Atomically writes one or more app-level settings.
   * Uses a transaction to ensure all-or-nothing semantics.
   * Returns the full settings object after the write.
   */
  fastify.put('/api/settings', async (request) => {
    const parseResult = updateSettingsSchema.safeParse(request.body)

    if (!parseResult.success) {
      throw new ValidationError('Invalid settings payload', {
        body: 'Expected a JSON object with string key-value pairs'
      })
    }

    const entries = parseResult.data

    if (Object.keys(entries).length === 0) {
      throw new ValidationError('At least one setting must be provided')
    }

    const sqlite = getSqlite()
    const now = nowISO()

    // Use a raw transaction for atomic upsert of all settings
    const upsert = sqlite.prepare(`
      INSERT INTO app_settings (key, value, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)

    const transaction = sqlite.transaction((settingsEntries: [string, string][]) => {
      for (const [key, value] of settingsEntries) {
        upsert.run(key, value, now, now)
      }
    })

    transaction(Object.entries(entries))

    // Return the full settings object after the write
    const updatedSettings = readAllSettings()
    return ok(updatedSettings)
  })

  /**
   * Zod schema for PUT /api/settings/active-company request body.
   */
  const setActiveCompanySchema = z
    .object({
      companyId: z.number().int().positive()
    })
    .strict()

  /**
   * PUT /api/settings/active-company
   *
   * Sets the last active company ID in app settings.
   * Validates that the company exists before persisting.
   */
  fastify.put('/api/settings/active-company', async (request) => {
    const parseResult = setActiveCompanySchema.safeParse(request.body)

    if (!parseResult.success) {
      throw new ValidationError('Invalid request body', {
        companyId: 'A positive integer company ID is required'
      })
    }

    const { companyId } = parseResult.data
    const db = getDb()

    // Verify the company exists
    const company = db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).get()

    if (!company) {
      throw new NotFoundError('Company not found')
    }

    // Upsert the lastActiveCompanyId setting
    const sqlite = getSqlite()
    const now = nowISO()

    sqlite
      .prepare(
        `INSERT INTO app_settings (key, value, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run('lastActiveCompanyId', companyId.toString(), now, now)

    return ok({ lastActiveCompanyId: companyId })
  })
}
