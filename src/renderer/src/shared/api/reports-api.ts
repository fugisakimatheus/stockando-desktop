/**
 * Typed API client helpers for report endpoints (templates, generation, export).
 *
 * All functions require a `companyId` to enforce company-scoped data isolation
 * via the `x-company-id` header. Types are self-contained — no imports from
 * the main process.
 */

import { apiClient } from './client'

// ---------------------------------------------------------------------------
// Types (renderer-side mirror of service types)
// ---------------------------------------------------------------------------

type ReportTemplateId =
  | 'sales_by_period'
  | 'sales_by_product'
  | 'sales_by_customer'
  | 'purchases_by_period'
  | 'purchases_by_supplier'
  | 'inventory_movements'
  | 'stock_levels'
  | 'receivables_aging'
  | 'payables_aging'

interface ReportFilterDefinition {
  key: string
  label: string
  type: 'date_range' | 'entity_select' | 'status_select' | 'category_select'
}

interface ReportColumnDefinition {
  key: string
  label: string
  type: 'string' | 'number' | 'date' | 'currency'
  sortable: boolean
}

interface ReportTemplateDefinition {
  id: ReportTemplateId
  name: string
  description: string
  availableFilters: ReportFilterDefinition[]
  availableGroupings: string[]
  columns: ReportColumnDefinition[]
}

interface ReportFilters {
  startDate?: string
  endDate?: string
  customerId?: number
  supplierId?: number
  productId?: number
  categoryId?: number
  status?: string
}

interface GenerateReportInput {
  templateId: ReportTemplateId
  filters: ReportFilters
  groupBy?: string
  pagination: { limit: number; offset: number }
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

interface ReportRow {
  [key: string]: string | number | null
}

interface ReportGroup {
  groupKey: string
  groupLabel: string
  subtotal: number
  count: number
  rows: ReportRow[]
}

interface ReportSummary {
  totalAmount: number
  totalCount: number
  averageAmount: number
}

interface ReportResult {
  templateId: ReportTemplateId
  filters: ReportFilters
  data: ReportRow[]
  groups?: ReportGroup[]
  summary: ReportSummary
  total: number
  limit: number
  offset: number
}

interface ExportReportInput {
  templateId: ReportTemplateId
  filters: ReportFilters
  groupBy?: string
}

interface ExportFileResult {
  filePath: string
  fileSize: number
  recordCount: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function companyHeaders(companyId: number): Record<string, string> {
  return { 'x-company-id': String(companyId) }
}

// ---------------------------------------------------------------------------
// Reports API
// ---------------------------------------------------------------------------

function listReportTemplates(companyId: number): Promise<ReportTemplateDefinition[]> {
  return apiClient<ReportTemplateDefinition[]>('/reports/templates', {
    headers: companyHeaders(companyId)
  })
}

function generateReport(companyId: number, input: GenerateReportInput): Promise<ReportResult> {
  return apiClient<ReportResult>('/reports/generate', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function exportReportCsv(companyId: number, input: ExportReportInput): Promise<ExportFileResult> {
  return apiClient<ExportFileResult>('/reports/export/csv', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

function exportReportPdf(companyId: number, input: ExportReportInput): Promise<ExportFileResult> {
  return apiClient<ExportFileResult>('/reports/export/pdf', {
    method: 'POST',
    body: input,
    headers: companyHeaders(companyId)
  })
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { listReportTemplates, generateReport, exportReportCsv, exportReportPdf }

export type {
  ReportTemplateId,
  ReportFilterDefinition,
  ReportColumnDefinition,
  ReportTemplateDefinition,
  ReportFilters,
  GenerateReportInput,
  ReportRow,
  ReportGroup,
  ReportSummary,
  ReportResult,
  ExportReportInput,
  ExportFileResult
}
