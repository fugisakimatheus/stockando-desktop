/**
 * Shared type definitions for Phase 4 — Reporting, Automation, and Integrations.
 *
 * Status types, API request/response interfaces, and utility types for the
 * dashboard aggregates, report generation, bulk import/export, automation rules,
 * reminders, and integration point configuration.
 */

import type { Pagination, PaginatedResult } from './finance'

// Re-export for convenience
export type { Pagination, PaginatedResult }

// ---------------------------------------------------------------------------
// Dashboard Types
// ---------------------------------------------------------------------------

export const DASHBOARD_PERIODS = {
  current_month: 'current_month',
  last_30_days: 'last_30_days',
  custom: 'custom'
} as const satisfies Record<string, string>

export type DashboardPeriod =
  | { type: 'current_month' }
  | { type: 'last_30_days' }
  | { type: 'custom'; startDate: string; endDate: string }

export interface DashboardMetrics {
  totalSales: number
  totalPurchases: number
  totalReceivables: number
  totalPayables: number
  totalOverdueReceivables: number
  totalOverduePayables: number
  currentInventoryValue: number
  lowStockProductCount: number
}

export interface DashboardAggregateSet {
  companyId: number
  period: DashboardPeriod
  lastUpdatedAt: string
  metrics: DashboardMetrics
}

// ---------------------------------------------------------------------------
// Report Types
// ---------------------------------------------------------------------------

export const REPORT_TEMPLATE_IDS = {
  sales_by_period: 'sales_by_period',
  sales_by_product: 'sales_by_product',
  sales_by_customer: 'sales_by_customer',
  purchases_by_period: 'purchases_by_period',
  purchases_by_supplier: 'purchases_by_supplier',
  inventory_movements: 'inventory_movements',
  stock_levels: 'stock_levels',
  receivables_aging: 'receivables_aging',
  payables_aging: 'payables_aging'
} as const satisfies Record<string, string>

export type ReportTemplateId = (typeof REPORT_TEMPLATE_IDS)[keyof typeof REPORT_TEMPLATE_IDS]

export const REPORT_FILTER_TYPES = {
  date_range: 'date_range',
  entity_select: 'entity_select',
  status_select: 'status_select',
  category_select: 'category_select'
} as const satisfies Record<string, string>

export type ReportFilterType = (typeof REPORT_FILTER_TYPES)[keyof typeof REPORT_FILTER_TYPES]

export const REPORT_COLUMN_TYPES = {
  string: 'string',
  number: 'number',
  date: 'date',
  currency: 'currency'
} as const satisfies Record<string, string>

export type ReportColumnType = (typeof REPORT_COLUMN_TYPES)[keyof typeof REPORT_COLUMN_TYPES]

export interface ReportFilterDefinition {
  key: string
  label: string
  type: ReportFilterType
}

export interface ReportColumnDefinition {
  key: string
  label: string
  type: ReportColumnType
  sortable: boolean
}

export interface ReportTemplateDefinition {
  id: ReportTemplateId
  name: string
  description: string
  availableFilters: ReportFilterDefinition[]
  availableGroupings: string[]
  columns: ReportColumnDefinition[]
}

export interface ReportFilters {
  startDate?: string
  endDate?: string
  customerId?: number
  supplierId?: number
  productId?: number
  categoryId?: number
  status?: string
}

export const SORT_DIRECTIONS = {
  asc: 'asc',
  desc: 'desc'
} as const satisfies Record<string, string>

export type SortDirection = (typeof SORT_DIRECTIONS)[keyof typeof SORT_DIRECTIONS]

export interface GenerateReportInput {
  templateId: ReportTemplateId
  filters: ReportFilters
  groupBy?: string
  pagination: Pagination
  sortBy?: string
  sortDirection?: SortDirection
}

export interface ReportRow {
  [key: string]: string | number | null
}

export interface ReportGroup {
  groupKey: string
  groupLabel: string
  subtotal: number
  count: number
  rows: ReportRow[]
}

export interface ReportSummary {
  totalAmount: number
  totalCount: number
  averageAmount: number
}

export interface ReportResult {
  templateId: ReportTemplateId
  filters: ReportFilters
  data: ReportRow[]
  groups?: ReportGroup[]
  summary: ReportSummary
  total: number
  limit: number
  offset: number
}

// ---------------------------------------------------------------------------
// Export Types
// ---------------------------------------------------------------------------

export const EXPORT_FORMATS = {
  csv: 'csv',
  pdf: 'pdf'
} as const satisfies Record<string, string>

export type ExportFormat = (typeof EXPORT_FORMATS)[keyof typeof EXPORT_FORMATS]

export interface ExportReportInput {
  templateId: ReportTemplateId
  filters: ReportFilters
  groupBy?: string
  format: ExportFormat
}

export const EXPORTABLE_ENTITY_TYPES = {
  products: 'products',
  customers: 'customers',
  suppliers: 'suppliers',
  categories: 'categories',
  sales_orders: 'sales_orders',
  purchase_orders: 'purchase_orders',
  inventory_movements: 'inventory_movements'
} as const satisfies Record<string, string>

export type ExportableEntityType = (typeof EXPORTABLE_ENTITY_TYPES)[keyof typeof EXPORTABLE_ENTITY_TYPES]

export interface EntityExportFilters {
  startDate?: string
  endDate?: string
  status?: string
  categoryId?: number
}

export interface ExportEntitiesInput {
  entityType: ExportableEntityType
  filters?: EntityExportFilters
}

export interface ExportFileResult {
  filePath: string
  fileSize: number
  recordCount: number
}

// ---------------------------------------------------------------------------
// Import Types
// ---------------------------------------------------------------------------

export const IMPORTABLE_ENTITY_TYPES = {
  products: 'products',
  customers: 'customers',
  suppliers: 'suppliers',
  categories: 'categories'
} as const satisfies Record<string, string>

export type ImportableEntityType = (typeof IMPORTABLE_ENTITY_TYPES)[keyof typeof IMPORTABLE_ENTITY_TYPES]

export const IMPORT_DELIMITERS = {
  comma: ',',
  semicolon: ';'
} as const satisfies Record<string, string>

export type ImportDelimiter = ',' | ';'

export interface ValidateImportInput {
  entityType: ImportableEntityType
  fileBuffer: Buffer
  delimiter: ImportDelimiter
}

export const IMPORT_ROW_STATUSES = {
  valid: 'valid',
  invalid: 'invalid'
} as const satisfies Record<string, string>

export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[keyof typeof IMPORT_ROW_STATUSES]

export interface ImportRowError {
  column: string
  message: string
}

export interface ImportRowValidation {
  rowNumber: number
  status: ImportRowStatus
  data: Record<string, string>
  errors: ImportRowError[]
}

export interface ImportValidationResult {
  validationId: string
  entityType: ImportableEntityType
  totalRows: number
  validRows: number
  invalidRows: number
  rows: ImportRowValidation[]
  expectedChanges: {
    creates: number
    updates: number
  }
}

export interface ConfirmImportInput {
  validationId: string
  skipInvalid: boolean
}

export interface ImportCommitResult {
  entityType: ImportableEntityType
  totalRows: number
  importedRows: number
  skippedRows: number
  failedRows: number
  createdRecords: number
  updatedRecords: number
}

// ---------------------------------------------------------------------------
// Automation Types
// ---------------------------------------------------------------------------

export const AUTOMATION_TRIGGER_TYPES = {
  installment_overdue: 'installment_overdue',
  stock_below_minimum: 'stock_below_minimum',
  order_pending_too_long: 'order_pending_too_long'
} as const satisfies Record<string, string>

export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[keyof typeof AUTOMATION_TRIGGER_TYPES]

export const AUTOMATION_ACTION_TYPES = {
  create_reminder: 'create_reminder',
  log_notification: 'log_notification'
} as const satisfies Record<string, string>

export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[keyof typeof AUTOMATION_ACTION_TYPES]

export interface AutomationTriggerParams {
  installment_overdue: { overdueDays: number }
  stock_below_minimum: { minimumQuantity: number }
  order_pending_too_long: { pendingDays: number }
}

export interface AutomationActionParams {
  create_reminder: { messageTemplate: string }
  log_notification: { notificationTemplate: string }
}

export interface CreateAutomationRuleInput {
  name: string
  triggerType: AutomationTriggerType
  triggerParams: AutomationTriggerParams[AutomationTriggerType]
  actionType: AutomationActionType
  actionParams: AutomationActionParams[AutomationActionType]
}

export interface UpdateAutomationRuleInput {
  name?: string
  triggerParams?: AutomationTriggerParams[AutomationTriggerType]
  actionParams?: AutomationActionParams[AutomationActionType]
}

export interface AutomationRuleListItem {
  id: number
  name: string
  triggerType: AutomationTriggerType
  triggerDescription: string
  actionType: AutomationActionType
  actionDescription: string
  enabled: boolean
  lastEvaluatedAt: string | null
}

export interface AutomationRuleDetail extends AutomationRuleListItem {
  triggerParams: AutomationTriggerParams[AutomationTriggerType]
  actionParams: AutomationActionParams[AutomationActionType]
  createdAt: string
  updatedAt: string
}

export interface RuleEvaluationDetail {
  ruleId: number
  ruleName: string
  entitiesTriggered: number
  actionsExecuted: number
  errors: string[]
}

export interface RuleEvaluationSummary {
  rulesEvaluated: number
  actionsExecuted: number
  actionsFailed: number
  details: RuleEvaluationDetail[]
}

// ---------------------------------------------------------------------------
// Reminder Types
// ---------------------------------------------------------------------------

export const REMINDER_STATUSES = {
  active: 'active',
  dismissed: 'dismissed',
  completed: 'completed'
} as const satisfies Record<string, string>

export type ReminderStatus = (typeof REMINDER_STATUSES)[keyof typeof REMINDER_STATUSES]

export interface ReminderListItem {
  id: number
  entityType: string
  entityId: string
  entitySummary: string
  message: string
  dueDate: string
  status: ReminderStatus
  ruleId: number | null
  createdAt: string
}

export interface ReminderListFilters extends Pagination {
  status?: ReminderStatus
  entityType?: string
}

export interface CreateReminderInput {
  entityType: string
  entityId: string
  entitySummary: string
  message: string
  dueDate: string
  ruleId?: number
}

// ---------------------------------------------------------------------------
// Integration Types
// ---------------------------------------------------------------------------

export const INTEGRATION_PROVIDER_TYPES = {
  fiscal_provider: 'fiscal_provider',
  payment_gateway: 'payment_gateway',
  custom_webhook: 'custom_webhook'
} as const satisfies Record<string, string>

export type IntegrationProviderType = (typeof INTEGRATION_PROVIDER_TYPES)[keyof typeof INTEGRATION_PROVIDER_TYPES]

export const INTEGRATION_TEST_RESULTS = {
  success: 'success',
  failure: 'failure'
} as const satisfies Record<string, string>

export type IntegrationTestResult = (typeof INTEGRATION_TEST_RESULTS)[keyof typeof INTEGRATION_TEST_RESULTS]

export interface IntegrationConfigListItem {
  id: number
  providerType: IntegrationProviderType
  endpointUrl: string
  description: string | null
  active: boolean
  lastTestedAt: string | null
  lastTestResult: IntegrationTestResult | null
}

export interface IntegrationConfigDetail extends IntegrationConfigListItem {
  credentialsRef: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateIntegrationInput {
  providerType: IntegrationProviderType
  endpointUrl: string
  credentials?: string
  description?: string
}

export interface UpdateIntegrationInput {
  endpointUrl?: string
  credentials?: string
  description?: string
}

export interface ConnectionTestResult {
  success: boolean
  responseTimeMs: number | null
  error: string | null
  testedAt: string
}
