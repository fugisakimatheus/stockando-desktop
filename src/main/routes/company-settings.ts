import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { NotFoundError, ValidationError } from '../api/errors'
import { ok } from '../api/types'
import { companies, companySettings } from '../db/schema'
import { nowISO } from '../lib/timestamps'
import { getDb } from '../server'

/**
 * Zod schema for the update-company-settings request body.
 */
const updateCompanySettingsSchema = z
  .object({
    taxRegime: z.string().max(50).optional().nullable(),
    currencyCode: z.string().max(10).optional(),
    fiscalEnvironment: z.enum(['production', 'homologation']).optional(),
    invoiceSeries: z.string().max(10).optional().nullable()
  })
  .strict()

export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsSchema>

/**
 * Maps Zod flat field errors to a single-message-per-field record.
 */
function mapZodFieldErrors(fieldErrors: Record<string, string[]>): Record<string, string> {
  const mapped: Record<string, string> = {}
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages.length > 0) {
      mapped[field] = messages[0]
    }
  }
  return mapped
}

/**
 * Registers company settings routes:
 *
 * - `GET /api/companies/:id/settings` — get company settings by company ID
 * - `PUT /api/companies/:id/settings` — update company settings
 */
export function registerCompanySettingsRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/companies/:id/settings
   * Returns the settings for a specific company.
   *
   * - Validates that `:id` is a valid integer
   * - Verifies the company exists (404 if not)
   * - Returns the company settings row
   */
  fastify.get('/api/companies/:id/settings', async (request) => {
    const db = getDb()

    const { id } = request.params as { id: string }
    const companyId = Number(id)

    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new NotFoundError('Company not found')
    }

    // Verify company exists
    const company = db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).get()

    if (!company) {
      throw new NotFoundError('Company not found')
    }

    // Fetch settings for this company
    const settings = db.select().from(companySettings).where(eq(companySettings.companyId, companyId)).get()

    if (!settings) {
      throw new NotFoundError('Company settings not found')
    }

    return ok(settings)
  })

  /**
   * PUT /api/companies/:id/settings
   * Updates settings for a specific company.
   *
   * Request body (all optional):
   * - taxRegime: string | null
   * - currencyCode: string
   * - fiscalEnvironment: 'production' | 'homologation'
   * - invoiceSeries: string | null
   *
   * On success, returns the full updated settings row.
   * On validation failure, returns 400 with field-level errors.
   * If company not found, returns 404.
   */
  fastify.put('/api/companies/:id/settings', async (request) => {
    const db = getDb()

    const { id } = request.params as { id: string }
    const companyId = Number(id)

    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new NotFoundError('Company not found')
    }

    // Validate request body
    const parsed = updateCompanySettingsSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid settings data', mapZodFieldErrors(flat.fieldErrors))
    }

    // Verify company exists
    const company = db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).get()

    if (!company) {
      throw new NotFoundError('Company not found')
    }

    // Build the update payload with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: nowISO()
    }

    const { taxRegime, currencyCode, fiscalEnvironment, invoiceSeries } = parsed.data

    if (taxRegime !== undefined) {
      updateData.taxRegime = taxRegime
    }
    if (currencyCode !== undefined) {
      updateData.currencyCode = currencyCode
    }
    if (fiscalEnvironment !== undefined) {
      updateData.fiscalEnvironment = fiscalEnvironment
    }
    if (invoiceSeries !== undefined) {
      updateData.invoiceSeries = invoiceSeries
    }

    // Atomic update — single statement, all or nothing
    const updatedSettings = db
      .update(companySettings)
      .set(updateData)
      .where(eq(companySettings.companyId, companyId))
      .returning()
      .get()

    if (!updatedSettings) {
      throw new NotFoundError('Company settings not found')
    }

    return ok(updatedSettings)
  })
}
