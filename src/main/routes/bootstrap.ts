import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { ok } from '../api/types'
import { appSettings, companies } from '../db/schema'
import { getDb } from '../server'

/**
 * Registers the bootstrap API route.
 *
 * `GET /api/bootstrap` returns the application initialization status,
 * the last active company ID (for context restoration), and the full
 * list of available companies.
 */
export function registerBootstrapRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/bootstrap', async () => {
    const db = getDb()

    // Read lastActiveCompanyId from app_settings
    const row = db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, 'lastActiveCompanyId'))
      .get()

    let lastActiveCompanyId: number | null = null
    if (row && row.value !== 'null') {
      const parsed = Number(row.value)
      lastActiveCompanyId = Number.isNaN(parsed) ? null : parsed
    }

    // Fetch all companies (id, name, documentNumber, status) ordered by name
    const companyList = db
      .select({
        id: companies.id,
        name: companies.name,
        documentNumber: companies.documentNumber,
        status: companies.status
      })
      .from(companies)
      .orderBy(companies.name)
      .all()

    return ok({
      status: 'ready' as const,
      lastActiveCompanyId,
      companies: companyList
    })
  })
}
