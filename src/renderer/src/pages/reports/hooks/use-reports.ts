import { listReportTemplates, generateReport, exportReportCsv, exportReportPdf } from '@shared/api'
import type {
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
} from '@shared/api'
import { useMutation, useQuery } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const reportKeys = {
  all: (companyId: number) => [companyId, 'reports'] as const,
  templates: (companyId: number) => [...reportKeys.all(companyId), 'templates'] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches the list of available report templates for the given company.
 */
function useReportTemplates(companyId: number) {
  return useQuery({
    queryKey: reportKeys.templates(companyId),
    queryFn: () => listReportTemplates(companyId)
  })
}

/**
 * Mutation to generate a report with filters, pagination, and sorting.
 */
function useGenerateReport(companyId: number) {
  return useMutation({
    mutationFn: (input: GenerateReportInput) => generateReport(companyId, input)
  })
}

/**
 * Mutation to export a report as a CSV file.
 * Returns the file path, file size, and record count on success.
 */
function useExportReportCsv(companyId: number) {
  return useMutation({
    mutationFn: (input: ExportReportInput) => exportReportCsv(companyId, input)
  })
}

/**
 * Mutation to export a report as a PDF file.
 * Returns the file path, file size, and record count on success.
 */
function useExportReportPdf(companyId: number) {
  return useMutation({
    mutationFn: (input: ExportReportInput) => exportReportPdf(companyId, input)
  })
}

export { reportKeys, useReportTemplates, useGenerateReport, useExportReportCsv, useExportReportPdf }

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
