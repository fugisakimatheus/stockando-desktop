# Implementation Plan: Phase 4 — Reporting, Automation, and Integrations

## Overview

This plan implements the full Phase 4 feature set: dashboard aggregates with caching, business report generation and export, bulk CSV import/export, automation rules with idempotent evaluation, reminder management, and integration point configuration. The implementation follows the established service-layer pattern (Fastify + Drizzle in main process, TanStack Query + Router in renderer) and builds incrementally from schema → services → routes → hooks → UI.

## Tasks

- [x] 1. Database schema additions and shared types
  - [x] 1.1 Add Phase 4 tables to Drizzle schema
    - Add `dashboardAggregates`, `automationRules`, `ruleEvaluations`, `reminders`, `integrationConfigs`, and `importJobs` tables to `src/main/db/schema.ts`
    - Include foreign keys, indexes, composite unique constraints (e.g., ruleId+entityType+entityId on rule_evaluations)
    - All tables must include `companyId` FK with cascade delete
    - _Requirements: 1.1, 7.1, 9.1, 10.1, 16.4, 17.5_

  - [x] 1.2 Create shared TypeScript type definitions for Phase 4
    - Create `src/main/types/phase4-types.ts` with all interface and const definitions from the design (DashboardPeriod, ReportTemplateDefinition, ImportValidationResult, AutomationRule types, Reminder types, Integration types, etc.)
    - Use `as const` objects for enum-like values (trigger types, action types, provider types, statuses)
    - _Requirements: 7.2, 7.3, 10.2_

- [x] 2. Dashboard aggregate service and API
  - [x] 2.1 Implement DashboardService with in-memory cache
    - Create `src/main/services/dashboard-service.ts`
    - Implement `getAggregates` with cache lookup (configurable staleness threshold, default 5min)
    - Implement `refreshAggregates` for forced recomputation
    - Implement `computeAggregates` with batched indexed queries (sales, purchases, receivables, payables, inventory value, low-stock count)
    - Use `resolvePeriodBounds` with `ts-pattern` match for period type handling
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 15.1, 15.2_

  - [x] 2.2 Write property tests for dashboard aggregate computation
    - **Property 1: Dashboard aggregate cache freshness**
    - **Property 2: Dashboard aggregate correctness — sales total**
    - **Property 3: Dashboard aggregate correctness — receivables**
    - **Validates: Requirements 1.1, 1.2, 1.5**

  - [x] 2.3 Register dashboard Fastify routes
    - Create `src/main/routes/dashboard-routes.ts`
    - `GET /api/dashboard/aggregates` — return cached aggregates for active company and period
    - `POST /api/dashboard/aggregates/refresh` — force recomputation
    - Validate query params (period type, custom date range)
    - Enforce company scoping
    - _Requirements: 1.2, 1.3, 1.6, 16.1_

- [x] 3. Checkpoint — Dashboard service
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Report generation service and API
  - [x] 4.1 Define report templates as static configuration
    - Create `src/main/services/report-templates.ts`
    - Define all 9 report template configurations (sales_by_period, sales_by_product, sales_by_customer, purchases_by_period, purchases_by_supplier, inventory_movements, stock_levels, receivables_aging, payables_aging)
    - Each template specifies: data source query builder, available columns, filter definitions, grouping options
    - _Requirements: 3.1_

  - [x] 4.2 Implement ReportService
    - Create `src/main/services/report-service.ts`
    - Implement `listTemplates` returning static template definitions
    - Implement `generate` with dynamic query building from template + filters, pagination, sorting, grouping with subtotals, and summary computation
    - Implement `exportCsv` generating UTF-8 BOM CSV with column headers and formatted values
    - Implement `exportPdf` using lightweight PDF table renderer for formatted output
    - Use indexed queries with company scoping
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 15.3, 15.4, 15.5_

  - [x] 4.3 Write property tests for report generation
    - **Property 4: Report date range filter correctness**
    - **Property 5: Report grouping subtotals consistency**
    - **Property 19: Report summary totals consistency**
    - **Validates: Requirements 3.2, 3.3, 3.4**

  - [x] 4.4 Write property test for CSV export encoding
    - **Property 18: Export file UTF-8 BOM encoding**
    - **Validates: Requirements 4.7**

  - [x] 4.5 Register report Fastify routes
    - Create `src/main/routes/report-routes.ts`
    - `GET /api/reports/templates` — list available templates
    - `POST /api/reports/generate` — generate report data with filters and pagination
    - `POST /api/reports/export/csv` — export report to CSV file
    - `POST /api/reports/export/pdf` — export report to PDF file
    - Validate request bodies, enforce company scoping
    - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.5, 4.6, 16.1_

- [x] 5. Import service and API
  - [x] 5.1 Implement ImportService with two-phase flow
    - Create `src/main/services/import-service.ts`
    - Implement `validate`: parse CSV (streaming, configurable delimiter), validate rows (required fields, types, natural key detection), return ImportValidationResult with row-level errors
    - Implement `confirm`: transactional commit (BEGIN → INSERT/UPDATE valid rows → log import_job → COMMIT), rollback on failure
    - Support partial import (skipInvalid=true: commit only valid rows)
    - Enforce file size limit, company scoping on all inserts
    - Entity schemas for products, customers, suppliers, categories
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 16.5, 17.1, 17.2, 17.3, 17.4, 17.5_

  - [x] 5.2 Write property tests for import validation and commit
    - **Property 7: Import validation rejects empty required fields**
    - **Property 8: Import transaction atomicity**
    - **Property 9: Partial import correctness**
    - **Property 10: Import company scoping**
    - **Validates: Requirements 5.2, 5.4, 5.5, 5.7, 16.5, 17.1, 17.2, 17.3, 17.4**

  - [x] 5.3 Register import Fastify routes
    - Create `src/main/routes/import-routes.ts`
    - `POST /api/imports/validate` — validate CSV file and return preview
    - `POST /api/imports/confirm` — commit validated import transactionally
    - Handle multipart file upload, enforce file size limit
    - _Requirements: 5.1, 5.2, 5.3, 16.1_

- [x] 6. Export service and API
  - [x] 6.1 Implement ExportService
    - Create `src/main/services/export-service.ts`
    - Implement `exportEntities`: generate CSV with same column structure as import (round-trip compatibility), UTF-8 BOM, header row
    - Support entity types: products, customers, suppliers, categories, sales_orders, purchase_orders, inventory_movements
    - Optional filters (date range, status, category)
    - Store files in structured directory: `{userData}/{companyId}/exports/entities/{entityType}/{filename}`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 6.2 Write property test for export-import round-trip
    - **Property 6: CSV export round-trip compatibility**
    - **Validates: Requirements 6.3**

  - [x] 6.3 Register export Fastify routes
    - Create `src/main/routes/export-routes.ts`
    - `POST /api/exports/entities` — export entity data to CSV
    - Return file path, file size, record count
    - _Requirements: 6.1, 6.5, 16.1_

- [x] 7. Checkpoint — Report, Import, Export services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Automation rules service and API
  - [x] 8.1 Implement AutomationService
    - Create `src/main/services/automation-service.ts`
    - Implement CRUD: `list`, `create` (with trigger/action validation), `update`, `toggle`
    - Implement `evaluate`: load enabled rules → query entities matching trigger condition → check rule_evaluations for idempotency → execute action → record evaluation
    - Use `ts-pattern` match for trigger type evaluation (installment_overdue, stock_below_minimum, order_pending_too_long)
    - Actions: create_reminder (delegate to ReminderService), log_notification
    - Update lastEvaluatedAt after each rule evaluation
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 8.2 Write property tests for automation rule evaluation
    - **Property 11: Automation rule idempotent execution**
    - **Property 12: Automation trigger correctness — installment_overdue**
    - **Property 13: Automation trigger correctness — stock_below_minimum**
    - **Property 20: Automation rule validation**
    - **Validates: Requirements 7.2, 7.4, 8.1, 8.2, 8.4**

  - [x] 8.3 Register automation rules Fastify routes
    - Create `src/main/routes/automation-routes.ts`
    - `GET /api/automation-rules` — list all rules for active company
    - `POST /api/automation-rules` — create new rule
    - `PUT /api/automation-rules/:id` — update rule configuration
    - `POST /api/automation-rules/:id/toggle` — enable/disable rule
    - `POST /api/automation-rules/evaluate` — trigger manual evaluation
    - _Requirements: 7.1, 7.5, 7.6, 8.7, 16.1_

- [x] 9. Reminder service and API
  - [x] 9.1 Implement ReminderService
    - Create `src/main/services/reminder-service.ts`
    - Implement `list` with status/entity filters, ordered by dueDate ascending, paginated
    - Implement `countActive` for badge count
    - Implement `dismiss` (active → dismissed, set dismissedAt)
    - Implement `complete` (active → completed, set completedAt)
    - Implement `create` for automation action integration
    - Validate status transitions (only active reminders can be dismissed/completed)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 9.2 Write property tests for reminder lifecycle
    - **Property 14: Reminder status lifecycle**
    - **Property 15: Reminder list ordering**
    - **Validates: Requirements 9.2, 9.3, 9.4**

  - [x] 9.3 Register reminder Fastify routes
    - Create `src/main/routes/reminder-routes.ts`
    - `GET /api/reminders` — list reminders with filters
    - `GET /api/reminders/count` — count of active reminders
    - `POST /api/reminders/:id/dismiss` — dismiss a reminder
    - `POST /api/reminders/:id/complete` — mark as completed
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 16.1_

- [x] 10. Integration service and API
  - [x] 10.1 Implement IntegrationService
    - Create `src/main/services/integration-service.ts`
    - Implement CRUD: `list`, `create`, `update`, `toggle`
    - Implement `testConnection`: HTTP health-check with configurable timeout, error isolation
    - Store credentials reference (filename) in DB, actual credentials in separate secure JSON file on disk
    - Update lastTestedAt and lastTestResult on test completion
    - Never expose raw credentials in API responses
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [-] 10.2 Write property test for integration connection test isolation
    - **Property 16: Integration connection test isolation**
    - **Validates: Requirements 10.7, 11.1**

  - [-] 10.3 Register integration Fastify routes
    - Create `src/main/routes/integration-routes.ts`
    - `GET /api/integrations` — list integration configs
    - `POST /api/integrations` — create config
    - `PUT /api/integrations/:id` — update config
    - `POST /api/integrations/:id/toggle` — activate/deactivate
    - `POST /api/integrations/:id/test` — test connection health
    - _Requirements: 10.1, 10.4, 10.5, 11.1, 16.1_

- [x] 11. Checkpoint — All backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Company data isolation enforcement
  - [-] 12.1 Add company scoping integration tests
    - Write integration tests verifying company isolation across all services (dashboard, reports, import, export, automation, reminders, integrations)
    - Verify cross-company queries return empty/not-found
    - Verify import assigns active companyId regardless of file content
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x] 12.2 Write property test for company data isolation
    - **Property 17: Company data isolation for reporting**
    - **Validates: Requirements 16.1, 16.2, 16.3, 16.4**

- [x] 13. Renderer query hooks — Dashboard and Reports
  - [x] 13.1 Create dashboard query hooks
    - Create hooks file in `src/renderer/src/pages/dashboard/` (or `@shared/hooks` if reused)
    - `useDashboardAggregates(companyId, period)` — useQuery with staleness handling
    - `useRefreshDashboard()` — useMutation that invalidates dashboard queries on success
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [x] 13.2 Create report query hooks
    - Create hooks file in `src/renderer/src/pages/reports/`
    - `useReportTemplates()` — useQuery for template list
    - `useGenerateReport()` — useMutation for report generation
    - `useExportReportCsv()` / `useExportReportPdf()` — useMutation for exports
    - _Requirements: 3.1, 3.2, 4.1, 4.2_

- [x] 14. Renderer query hooks — Import, Export, Automation, Reminders, Integrations
  - [-] 14.1 Create import/export query hooks
    - `useValidateImport()` — useMutation for validation phase
    - `useConfirmImport()` — useMutation for commit phase
    - `useExportEntities()` — useMutation for entity export
    - _Requirements: 5.2, 5.3, 6.1, 12.1, 12.4_

  - [-] 14.2 Create automation and reminder query hooks
    - `useAutomationRules(companyId)` — useQuery for rule list
    - `useCreateAutomationRule()` / `useUpdateAutomationRule()` / `useToggleAutomationRule()` — useMutation with invalidation
    - `useEvaluateRules()` — useMutation
    - `useReminders(companyId, filters)` — useQuery with pagination
    - `useActiveReminderCount(companyId)` — useQuery for badge
    - `useDismissReminder()` / `useCompleteReminder()` — useMutation with invalidation
    - _Requirements: 7.6, 8.7, 9.2, 9.3, 9.4, 13.1, 13.4, 13.6, 13.7_

  - [-] 14.3 Create integration query hooks
    - `useIntegrationConfigs(companyId)` — useQuery
    - `useCreateIntegration()` / `useUpdateIntegration()` / `useToggleIntegration()` — useMutation
    - `useTestConnection()` — useMutation
    - _Requirements: 10.5, 11.1, 14.1, 14.3_

- [x] 15. Shared UI components for Phase 4
  - [x] 15.1 Create shared reporting UI primitives
    - `SummaryCard` — metric card with label, value, optional trend indicator, click-through
    - `DateRangeFilter` — period selector (current month, last 30 days, custom range)
    - `ReportTable` — paginated table with column sorting, expandable groups, subtotals (extends TanStack Table)
    - `ExportFormatSelector` — format choice (CSV/PDF) with entity type and filter options
    - Place in `src/renderer/src/shared/ui/`
    - _Requirements: 2.1, 2.3, 18.3, 18.6_

  - [x] 15.2 Create shared import/export UI primitives
    - `ImportPreview` — table showing validated rows with success/error status per row
    - `ImportProgressBar` — progress indicator during import validation and commit
    - Place in `src/renderer/src/shared/ui/`
    - _Requirements: 12.1, 12.2, 12.3, 12.7_

  - [x] 15.3 Create shared automation and reminder UI primitives
    - `AutomationRuleForm` — trigger type/params + action type/params configuration form
    - `ReminderCard` — compact card with entity context, due date, dismiss/complete actions
    - `ReminderBadge` — navigation badge showing active reminder count
    - `ConnectionStatusIndicator` — inline result display for connection tests
    - Place in `src/renderer/src/shared/ui/`
    - _Requirements: 13.2, 13.4, 13.5, 13.6, 14.3, 14.4_

- [x] 16. Dashboard page UI
  - [x] 16.1 Implement Dashboard page
    - Create `src/renderer/src/pages/dashboard/` with `index.ts` + `ui/dashboard-page.tsx`
    - Render SummaryCards for all 8 metrics (sales, purchases, receivables, payables, overdue amounts, inventory value, low-stock count)
    - Include DateRangeFilter with 300ms debounce
    - Include manual refresh button and "last updated" timestamp display
    - Handle loading, empty, and error states
    - SummaryCard click navigates to relevant detail screen
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 15.7_

- [x] 17. Reports page UI
  - [x] 17.1 Implement Reports page
    - Create `src/renderer/src/pages/reports/` with `index.ts` + `ui/reports-page.tsx`
    - Template list with descriptions and "Generate" action
    - Filter configuration panel (date range, entity filters, status, grouping) per template
    - Paginated results table with column sorting, summary totals, export actions
    - Expandable group headers with subtotals
    - Loading states, cancellation support, debounced filter updates
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 15.3_

- [x] 18. Import/Export page UI
  - [x] 18.1 Implement Import/Export page
    - Create `src/renderer/src/pages/import-export/` with `index.ts` + `ui/import-export-page.tsx`
    - Import section: file selection (CSV), entity type selection, delimiter choice, preview step with ImportValidationResult display, confirm/cancel actions
    - Export section: entity type selection, optional filters, format selector
    - Progress indicators during validation and commit
    - Prevent navigation during active import
    - Show file path and "Open Folder" action on export completion
    - Clear error messages on failure
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [x] 19. Automation rules page UI
  - [x] 19.1 Implement Automation Rules settings page
    - Create `src/renderer/src/pages/settings/automation/` with `index.ts` + `ui/automation-rules-page.tsx`
    - Rule list with trigger description, action description, enabled/disabled toggle, last evaluation timestamp
    - Create/edit form with AutomationRuleForm component
    - Manual "Evaluate Rules" button with summary display
    - _Requirements: 13.1, 13.2, 13.3, 13.7_

- [x] 20. Reminders panel UI
  - [x] 20.1 Implement Reminders panel in navigation
    - Create `src/renderer/src/shared/ui/reminders-panel.tsx` (global panel)
    - Active reminders list ordered by due date
    - Dismiss and complete actions per reminder
    - ReminderBadge in navigation showing active count
    - Success notification on dismiss/complete
    - _Requirements: 13.4, 13.5, 13.6_

- [x] 21. Integrations settings page UI
  - [x] 21.1 Implement Integrations settings page
    - Create `src/renderer/src/pages/settings/integrations/` with `index.ts` + `ui/integrations-page.tsx`
    - Config list with provider type, endpoint URL, status, last test result
    - Create/edit form with IntegrationConfigForm
    - "Test Connection" button per entry with inline result display (ConnectionStatusIndicator)
    - Loading indicator during test without blocking other entries
    - Toggle active/inactive per integration
    - Mask credential values (show last 4 chars), require explicit action to reveal/edit
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

- [x] 22. Route registration and navigation wiring
  - [x] 22.1 Register all new routes and update navigation
    - Add routes to TanStack Router: `/dashboard`, `/reports`, `/import-export`, `/settings/automation`, `/settings/integrations`
    - Update app shell navigation to include new menu items
    - Add ReminderBadge to global navigation
    - _Requirements: 2.1, 13.6_

- [x] 23. Final checkpoint — Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in the design document
- Unit tests validate specific examples and edge cases
- The implementation language is TypeScript throughout (matching the design document)
- All services follow the existing pattern: service file → Fastify route module → renderer hook → page component
- Company scoping is enforced at the database query level in every service

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "4.2"] },
    { "id": 3, "tasks": ["4.3", "4.4", "4.5", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "8.1", "9.1"] },
    { "id": 6, "tasks": ["8.2", "8.3", "9.2", "9.3", "10.1"] },
    { "id": 7, "tasks": ["10.2", "10.3", "12.1"] },
    { "id": 8, "tasks": ["12.2", "13.1", "13.2"] },
    { "id": 9, "tasks": ["14.1", "14.2", "14.3"] },
    { "id": 10, "tasks": ["15.1", "15.2", "15.3"] },
    { "id": 11, "tasks": ["16.1", "17.1", "18.1"] },
    { "id": 12, "tasks": ["19.1", "20.1", "21.1"] },
    { "id": 13, "tasks": ["22.1"] }
  ]
}
```
