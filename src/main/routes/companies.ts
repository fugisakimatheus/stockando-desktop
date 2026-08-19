import { asc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { NotFoundError, ValidationError } from '../api/errors'
import { ok } from '../api/types'
import { companies, companySettings } from '../db/schema'
import { nowISO } from '../lib/timestamps'
import { getDb } from '../server'

/**
 * Zod schema for the create-company request body.
 */
const createCompanySchema = z
  .object({
    name: z.string().min(1, 'Company name is required').max(200),
    documentNumber: z.string().min(1, 'Document number is required').max(20),
    tradeName: z.string().max(200).optional().nullable()
  })
  .strict()

export type CreateCompanyInput = z.infer<typeof createCompanySchema>

/**
 * Zod schema for the update-company request body.
 */
const updateCompanySchema = z
  .object({
    name: z.string().min(1, 'Company name is required').max(200).optional(),
    tradeName: z.string().max(200).optional().nullable()
  })
  .strict()

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>

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
 * Registers company management routes:
 *
 * - `GET /api/companies` — list all companies ordered by name
 * - `POST /api/companies` — create a new company with auto-generated settings
 */
export function registerCompanyRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/companies
   * Returns all companies ordered by name ascending.
   */
  fastify.get('/api/companies', async () => {
    const db = getDb()

    const result = db.select().from(companies).orderBy(asc(companies.name)).all()

    return ok(result)
  })

  /**
   * POST /api/companies
   * Creates a new company and its default company settings.
   *
   * Request body:
   * - name: string (required)
   * - documentNumber: string (required, must be unique)
   * - tradeName: string (optional)
   *
   * On success, returns the new company record with status 201.
   * On validation failure, returns 400 with field-level errors.
   * On duplicate documentNumber, the global error handler returns 409.
   */
  fastify.post('/api/companies', async (request, reply) => {
    const db = getDb()

    // Validate request body
    const parsed = createCompanySchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid company data', mapZodFieldErrors(flat.fieldErrors))
    }

    const { name, documentNumber, tradeName } = parsed.data
    const now = nowISO()

    // Insert company — unique constraint on documentNumber is enforced by the DB
    const newCompany = db
      .insert(companies)
      .values({
        name,
        documentNumber,
        tradeName: tradeName ?? null,
        status: 'active',
        createdAt: now,
        updatedAt: now
      })
      .returning()
      .get()

    // Create default company settings for the new company
    db.insert(companySettings)
      .values({
        companyId: newCompany.id,
        companyName: name,
        taxRegime: null,
        currencyCode: 'BRL',
        fiscalEnvironment: 'production',
        invoiceSeries: null,
        createdAt: now,
        updatedAt: now
      })
      .run()

    reply.status(201)
    return ok(newCompany)
  })

  /**
   * PUT /api/companies/:id
   * Updates an existing company's name and/or trade name.
   *
   * Request body:
   * - name: string (optional, min 1 char)
   * - tradeName: string | null (optional)
   *
   * On success, returns the updated company record.
   * On validation failure, returns 400 with field-level errors.
   * On company not found, returns 404.
   */
  fastify.put<{ Params: { id: string } }>('/api/companies/:id', async (request) => {
    const db = getDb()

    const id = Number.parseInt(request.params.id, 10)
    if (Number.isNaN(id)) {
      throw new NotFoundError('Company not found')
    }

    // Validate request body
    const parsed = updateCompanySchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      throw new ValidationError('Invalid company data', mapZodFieldErrors(flat.fieldErrors))
    }

    // Check company exists
    const existing = db.select().from(companies).where(eq(companies.id, id)).get()

    if (!existing) {
      throw new NotFoundError('Company not found')
    }

    // Build update payload — only include provided fields
    const updateData: Record<string, unknown> = { updatedAt: nowISO() }

    if (parsed.data.name !== undefined) {
      updateData.name = parsed.data.name
    }

    if (parsed.data.tradeName !== undefined) {
      updateData.tradeName = parsed.data.tradeName
    }

    // Update the company record
    const updatedCompany = db.update(companies).set(updateData).where(eq(companies.id, id)).returning().get()

    return ok(updatedCompany)
  })
}
