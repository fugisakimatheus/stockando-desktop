import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ValidationError } from '../api/errors'
import { ok } from '../api/types'
import * as ReportService from '../services/report-service'
import { REPORT_TEMPLATE_IDS } from '../types/phase4-types'
import type { ReportTemplateId } from '../types/phase4-types'

/**
 * Zod schema for report filters (shared across generate and export bodies).
 */
const reportFiltersSchema = z
  .object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    customerId: z.number().int().positive().optional(),
    supplierId: z.number().int().positive().optional(),
    productId: z.number().int().positive().optional(),
    categoryId: z.number().int().positive().optional(),
    status: z.string().optional()
  })
  .strict()

/**
 * Valid template IDs derived from the const object.
 */
const validTemplateIds = Object.values(REPORT_TEMPLATE_IDS) as [ReportTemplateId, ...ReportTemplateId[]]

/**
 * Zod schema for POST /api/reports/generate request body.
 */
const generateSchema = z
  .object({
    templateId: z.enum(validTemplateIds),
    filters: reportFiltersSchema,
    groupBy: z.string().optional(),
    pagination: z
      .object({
        limit: z.number().int().positive().max(1000).default(20),
        offset: z.number().int().min(0).default(0)
      })
      .strict(),
    sortBy: z.string().optional(),
    sortDirection: z.enum(['asc', 'desc']).optional()
  })
  .strict()

/**
 * Zod schema for POST /api/reports/export/csv request body.
 */
const exportCsvSchema = z
  .object({
    templateId: z.enum(validTemplateIds),
    filters: reportFiltersSchema,
    groupBy: z.string().optional(),
    format: z.literal('csv')
  })
  .strict()

/**
 * Zod schema for POST /api/reports/export/pdf request body.
 */
const exportPdfSchema = z
  .object({
    templateId: z.enum(validTemplateIds),
    filters: reportFiltersSchema,
    groupBy: z.string().optional(),
    format: z.literal('pdf')
  })
  .strict()

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
 * Extracts and validates the companyId from the `x-company-id` request header.
 * Throws ValidationError if missing or not a valid integer.
 */
function extractCompanyId(headers: Record<string, string | string[] | undefined>): number {
  const raw = headers['x-company-id']
  const value = Array.isArray(raw) ? raw[0] : raw

  if (!value) {
    throw new ValidationError('Company context is required', {
      'x-company-id': 'x-company-id header is required'
    })
  }

  const companyId = Number.parseInt(value, 10)

  if (Number.isNaN(companyId) || companyId <= 0) {
    throw new ValidationError('Invalid company context', {
      'x-company-id': 'x-company-id header must be a positive integer'
    })
  }

  return companyId
}

/**
 * Registers report routes:
 *
 * - `GET /api/reports/templates` — list available report templates
 * - `POST /api/reports/generate` — generate report data with filters and pagination
 * - `POST /api/reports/export/csv` — export report to CSV file
 * - `POST /api/reports/export/pdf` — export report to PDF file
 */
export function registerReportRoutes(fastify: FastifyInstance): void {
  /**
   * GET /api/reports/templates
   *
   * Returns all available report template definitions.
   * No query parameters or body required.
   */
  fastify.get('/api/reports/templates', async () => {
    const templates = ReportService.listTemplates()
    return ok(templates)
  })

  /**
   * POST /api/reports/generate
   *
   * Request body:
   * - templateId: one of the predefined report template IDs (required)
   * - filters: { startDate?, endDate?, customerId?, supplierId?, productId?, categoryId?, status? }
   * - groupBy?: string — column key to group results by
   * - pagination: { limit: number, offset: number } (required)
   * - sortBy?: string — column key to sort by
   * - sortDirection?: 'asc' | 'desc'
   *
   * Returns paginated report data with optional groups and summary totals.
   */
  fastify.post('/api/reports/generate', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = generateSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      const fieldErrors = mapZodFieldErrors(flat.fieldErrors)

      if (Object.keys(fieldErrors).length === 0 && flat.formErrors.length > 0) {
        throw new ValidationError(flat.formErrors[0], {
          templateId: flat.formErrors[0]
        })
      }

      throw new ValidationError('Invalid report generation request', fieldErrors)
    }

    const result = await ReportService.generate(companyId, parsed.data)
    return ok(result)
  })

  /**
   * POST /api/reports/export/csv
   *
   * Request body:
   * - templateId: one of the predefined report template IDs (required)
   * - filters: { startDate?, endDate?, customerId?, supplierId?, productId?, categoryId?, status? }
   * - groupBy?: string
   * - format: 'csv' (required, must be literal 'csv')
   *
   * Returns the exported file path, file size, and record count.
   */
  fastify.post('/api/reports/export/csv', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = exportCsvSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      const fieldErrors = mapZodFieldErrors(flat.fieldErrors)

      if (Object.keys(fieldErrors).length === 0 && flat.formErrors.length > 0) {
        throw new ValidationError(flat.formErrors[0], {
          templateId: flat.formErrors[0]
        })
      }

      throw new ValidationError('Invalid CSV export request', fieldErrors)
    }

    const result = await ReportService.exportCsv(companyId, parsed.data)
    return ok(result)
  })

  /**
   * POST /api/reports/export/pdf
   *
   * Request body:
   * - templateId: one of the predefined report template IDs (required)
   * - filters: { startDate?, endDate?, customerId?, supplierId?, productId?, categoryId?, status? }
   * - groupBy?: string
   * - format: 'pdf' (required, must be literal 'pdf')
   *
   * Returns the exported file path, file size, and record count.
   */
  fastify.post('/api/reports/export/pdf', async (request) => {
    const companyId = extractCompanyId(request.headers as Record<string, string | string[] | undefined>)

    const parsed = exportPdfSchema.safeParse(request.body)

    if (!parsed.success) {
      const flat = z.flattenError(parsed.error)
      const fieldErrors = mapZodFieldErrors(flat.fieldErrors)

      if (Object.keys(fieldErrors).length === 0 && flat.formErrors.length > 0) {
        throw new ValidationError(flat.formErrors[0], {
          templateId: flat.formErrors[0]
        })
      }

      throw new ValidationError('Invalid PDF export request', fieldErrors)
    }

    const result = await ReportService.exportPdf(companyId, parsed.data)
    return ok(result)
  })
}
