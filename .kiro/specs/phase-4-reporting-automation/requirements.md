# Requirements Document

## Introduction

Phase 4 evolves the Stockando Desktop application from a transactional tool into a business platform. It delivers operational dashboards with summary cards and filters, business report generation with export capabilities, bulk data import and export flows, automation rules and reminder hooks, and integration points for external services and fiscal providers. All reporting aggregations use cacheable data computed in the main process to avoid blocking the renderer. Import and export operations run off the main UI thread. Integration points are isolated behind the main-process boundary so that the renderer remains stable regardless of external service behavior. All operations remain company-scoped, performant, and aligned with the desktop-first architecture established in previous phases.

## Glossary

- **Reporting_API**: The Fastify HTTP API layer in the Electron main process responsible for handling dashboard, report, import, export, automation, and integration requests from the renderer.
- **Dashboard**: A screen presenting aggregated business metrics (sales totals, inventory levels, financial summaries, overdue amounts) using summary cards, filters, and optional chart visualizations.
- **Summary_Card**: A visual component on a Dashboard displaying a single metric (e.g., total sales this month, current stock value) with a label, value, and optional trend indicator.
- **Report**: A structured data export summarizing business activity over a date range, filtered by entity type, status, or category. Reports are generated as paginated queries and exported to CSV or PDF.
- **Report_Template**: A predefined configuration specifying which data source, columns, filters, and groupings compose a specific report type (e.g., "Sales by Product", "Inventory Movements").
- **Dashboard_Aggregate**: A precomputed or cached summary value stored in the main process to avoid recomputing expensive queries on each dashboard open. Refreshed on demand or on a controlled schedule.
- **Import_Job**: A background operation that reads structured data from an external file (CSV) and inserts or updates records in the local database after validation. Scoped to the active company.
- **Export_Job**: A background operation that extracts records from the local database and writes them to an external file (CSV or PDF). Scoped to the active company.
- **Import_Validation_Result**: The outcome of validating an import file before committing changes, containing row-level success/error statuses, parsed values, and a summary of expected changes.
- **Automation_Rule**: A configured trigger-action pair that executes a predefined action when specific conditions are met (e.g., "when an installment is overdue by 7 days, create a reminder").
- **Automation_Trigger**: The condition that activates an Automation_Rule, based on entity state, time threshold, or event occurrence.
- **Automation_Action**: The response executed when an Automation_Trigger fires, such as creating a reminder, updating a status flag, or logging a notification.
- **Reminder**: A time-based notification record associated with a business entity, alerting the user about an upcoming or overdue event (e.g., payment due, delivery expected).
- **Integration_Point**: A configured connection to an external service (e.g., fiscal provider, payment gateway), isolated behind the main-process boundary with typed request/response contracts.
- **Integration_Config**: The stored configuration for an Integration_Point, including endpoint URL, credentials reference, active status, and provider type.
- **Company_Scope**: The isolation boundary ensuring all reporting, import, export, automation, and integration data is filtered by the active company identifier.
- **Renderer**: The React-based UI layer running in the Electron renderer process.

## Requirements

### Requirement 1: Dashboard Aggregate Computation

**User Story:** As a business owner, I want dashboard summaries to load from precomputed data, so that opening the dashboard is fast and does not trigger expensive queries every time.

#### Acceptance Criteria

1. THE Reporting_API SHALL compute Dashboard_Aggregates for the active company covering: total sales (current month), total purchases (current month), total receivables (pending installments), total payables (pending installments), total overdue receivables, total overdue payables, current inventory value, and low-stock product count.
2. WHEN a dashboard data request is received, THE Reporting_API SHALL return cached Dashboard_Aggregates if available and not older than the configured staleness threshold.
3. WHEN a dashboard refresh is explicitly requested by the user, THE Reporting_API SHALL recompute all Dashboard_Aggregates from current transactional data and update the cache.
4. THE Reporting_API SHALL compute Dashboard_Aggregates using batched, indexed queries executed in the main process to avoid blocking the renderer thread.
5. IF the Dashboard_Aggregate cache is empty or expired, THEN THE Reporting_API SHALL compute fresh aggregates before responding to the dashboard data request.
6. THE Reporting_API SHALL store Dashboard_Aggregates with a timestamp indicating when the computation was performed, displayed to the user as "last updated" on the Dashboard.

### Requirement 2: Dashboard Screens and Filters

**User Story:** As a business owner, I want a visual dashboard with summary cards and date filters, so that I can understand operational status at a glance.

#### Acceptance Criteria

1. THE Renderer SHALL provide a main Dashboard screen displaying Summary_Cards for sales, purchases, receivables, payables, overdue amounts, inventory value, and low-stock alerts.
2. WHEN the Dashboard screen is opened, THE Renderer SHALL display the most recent cached Dashboard_Aggregate data immediately and show the "last updated" timestamp.
3. THE Renderer SHALL provide a date range filter on the Dashboard that allows the user to adjust the reporting period (current month, last 30 days, custom range).
4. WHEN the date range filter is changed, THE Renderer SHALL request updated Dashboard_Aggregates for the selected period with a debounced delay to prevent excessive requests.
5. THE Renderer SHALL provide a manual refresh button on the Dashboard that triggers a full recomputation of aggregates.
6. THE Renderer SHALL display loading, empty, and error states clearly on the Dashboard without blocking interaction with other application areas.
7. WHEN a Summary_Card is clicked, THE Renderer SHALL navigate to the relevant detail screen (e.g., clicking receivables navigates to the installments list filtered by pending status).

### Requirement 3: Business Report Generation

**User Story:** As a business owner, I want to generate structured business reports filtered by date, entity type, and status, so that I can review operational performance and make informed decisions.

#### Acceptance Criteria

1. THE Reporting_API SHALL support generating reports from predefined Report_Templates including: "Sales by Period", "Sales by Product", "Sales by Customer", "Purchases by Period", "Purchases by Supplier", "Inventory Movements", "Stock Levels", "Receivables Aging", and "Payables Aging".
2. WHEN a report generation request is received, THE Reporting_API SHALL execute the query for the specified Report_Template with the provided filters (date range, entity filters, status filters) and return paginated results.
3. THE Reporting_API SHALL compute report summary totals (total amount, total count, average) along with the detailed row data.
4. WHEN a report is generated with grouping (e.g., by product, by customer), THE Reporting_API SHALL return results grouped with subtotals per group.
5. THE Reporting_API SHALL use indexed queries and return report results within 500ms for datasets up to 50,000 records.
6. THE Reporting_API SHALL scope all report queries to the active company.

### Requirement 4: Report Export to CSV and PDF

**User Story:** As a business owner, I want to export reports to CSV and PDF formats, so that I can share data with partners, accountants, and team members who do not use the application.

#### Acceptance Criteria

1. WHEN a CSV export is requested for a report, THE Reporting_API SHALL generate a CSV file containing the report header row and all data rows matching the applied filters, and return the file path to the Renderer.
2. WHEN a PDF export is requested for a report, THE Reporting_API SHALL generate a PDF file with a formatted table containing the report title, filter description, column headers, data rows, and summary totals, and return the file path to the Renderer.
3. THE Reporting_API SHALL execute Export_Jobs off the renderer thread using the main process to prevent UI blocking during file generation.
4. THE Reporting_API SHALL store exported files in a structured directory: `{companyId}/exports/{reportType}/{year}/{month}/{filename}`.
5. WHEN an export completes, THE Reporting_API SHALL return the file path and file size to the Renderer for user download or file-system access.
6. IF an export fails due to disk space or write permission errors, THEN THE Reporting_API SHALL return a descriptive error indicating the failure reason.
7. THE Reporting_API SHALL include proper UTF-8 encoding with BOM in CSV exports for compatibility with spreadsheet applications.

### Requirement 5: Data Import from CSV

**User Story:** As a daily user, I want to import bulk data from CSV files, so that I can quickly populate the system with existing records (products, customers, suppliers) without manual entry.

#### Acceptance Criteria

1. THE Reporting_API SHALL support Import_Jobs for the following entity types: products, customers, suppliers, and categories.
2. WHEN a CSV import file is uploaded, THE Reporting_API SHALL validate the file structure (expected columns, data types, required fields) and return an Import_Validation_Result with row-level statuses before committing any data.
3. WHEN the user confirms the validated import, THE Reporting_API SHALL insert or update records within a single database transaction, scoped to the active company.
4. IF any row in the import batch fails validation, THEN THE Reporting_API SHALL include the row number, column name, and error description in the Import_Validation_Result without rejecting the entire file.
5. WHEN a partial import is confirmed (user chooses to skip invalid rows), THE Reporting_API SHALL insert only the valid rows and return a summary indicating how many rows were imported, skipped, and failed.
6. THE Reporting_API SHALL execute Import_Jobs off the renderer thread using the main process to prevent UI blocking during file parsing and database operations.
7. IF the import transaction fails after confirmation, THEN THE Reporting_API SHALL roll back all changes and return an error indicating no records were modified.
8. THE Reporting_API SHALL support CSV files with UTF-8 encoding and configurable column delimiter (comma or semicolon).
9. THE Reporting_API SHALL enforce a maximum import file size to prevent memory exhaustion during parsing.

### Requirement 6: Data Export for Bulk Operations

**User Story:** As a daily user, I want to export entity data to CSV, so that I can back up records, share data externally, or use exported files as templates for re-import.

#### Acceptance Criteria

1. THE Reporting_API SHALL support Export_Jobs for the following entity types: products, customers, suppliers, categories, sales orders, purchase orders, and inventory movements.
2. WHEN an entity export is requested, THE Reporting_API SHALL generate a CSV file containing all records of the specified entity type for the active company, with optional filters (date range, status, category).
3. THE Reporting_API SHALL use the same column structure in exports as expected by the import flow, so that exported files can serve as templates for future imports.
4. THE Reporting_API SHALL execute Export_Jobs off the renderer thread using the main process to prevent UI blocking.
5. WHEN an entity export completes, THE Reporting_API SHALL return the file path and record count to the Renderer.
6. THE Reporting_API SHALL include a header row in all exported CSV files with column names matching the import specification.

### Requirement 7: Automation Rule Configuration

**User Story:** As a business owner, I want to configure automation rules that trigger actions based on business events, so that routine tasks are handled automatically without manual intervention.

#### Acceptance Criteria

1. THE Reporting_API SHALL support creating Automation_Rules with a defined Automation_Trigger (entity type, condition, threshold) and Automation_Action (action type, parameters).
2. THE Reporting_API SHALL support the following Automation_Triggers: "installment_overdue" (installment past due date by N days), "stock_below_minimum" (product stock falls below configured minimum), "order_pending_too_long" (order in pending status for more than N days).
3. THE Reporting_API SHALL support the following Automation_Actions: "create_reminder" (generates a Reminder record linked to the entity), "log_notification" (records a notification entry for user review).
4. WHEN an Automation_Rule is created, THE Reporting_API SHALL validate that the trigger type and action type are compatible and that all required parameters are present.
5. THE Reporting_API SHALL allow enabling and disabling individual Automation_Rules without deleting them.
6. WHEN an Automation_Rule list is requested, THE Reporting_API SHALL return all rules for the active company with their current enabled/disabled status and last evaluation timestamp.
7. THE Reporting_API SHALL scope all Automation_Rules to the active company.

### Requirement 8: Automation Rule Evaluation

**User Story:** As a business owner, I want automation rules to be evaluated periodically, so that configured actions are executed when trigger conditions are met.

#### Acceptance Criteria

1. WHEN a rule evaluation cycle is triggered, THE Reporting_API SHALL evaluate all enabled Automation_Rules for the active company against current data.
2. WHEN an Automation_Trigger condition is met for an entity, THE Reporting_API SHALL execute the associated Automation_Action and record an evaluation result (entity ID, rule ID, action taken, timestamp).
3. THE Reporting_API SHALL evaluate automation rules in the main process to avoid blocking the renderer thread.
4. THE Reporting_API SHALL not execute the same Automation_Action for the same entity and rule more than once until the trigger condition is reset (e.g., installment is settled, stock is replenished).
5. IF an Automation_Action execution fails, THEN THE Reporting_API SHALL log the failure and continue evaluating remaining rules without interrupting the cycle.
6. WHEN a rule evaluation cycle completes, THE Reporting_API SHALL update the last_evaluated_at timestamp on each processed rule.
7. THE Reporting_API SHALL support manual trigger of rule evaluation from the Renderer in addition to any scheduled evaluation.

### Requirement 9: Reminder Management

**User Story:** As a daily user, I want to see reminders for overdue payments, low stock, and pending actions, so that I do not miss important operational deadlines.

#### Acceptance Criteria

1. WHEN an Automation_Action of type "create_reminder" is executed, THE Reporting_API SHALL create a Reminder record with the entity type, entity ID, reminder message, due date, and status "active".
2. WHEN a reminder list is requested, THE Reporting_API SHALL return all active Reminders for the active company, ordered by due date ascending.
3. WHEN a user dismisses a Reminder, THE Reporting_API SHALL update the Reminder status to "dismissed" and record the dismissal timestamp.
4. WHEN a user marks a Reminder as completed, THE Reporting_API SHALL update the Reminder status to "completed" and record the completion timestamp.
5. THE Reporting_API SHALL support filtering reminders by status ("active", "dismissed", "completed") and entity type.
6. THE Reporting_API SHALL include the associated entity summary (e.g., order number, product name) in reminder list responses for context.
7. THE Reporting_API SHALL scope all Reminders to the active company.

### Requirement 10: Integration Point Configuration

**User Story:** As a system administrator, I want to configure integration points for external services, so that the application can connect to fiscal providers and other services when needed.

#### Acceptance Criteria

1. THE Reporting_API SHALL support creating Integration_Configs with provider type, endpoint URL, credentials reference, and active/inactive status, scoped to the active company.
2. THE Reporting_API SHALL support the following provider types: "fiscal_provider" (SEFAZ communication), "payment_gateway" (future payment processing), and "custom_webhook" (generic HTTP callback).
3. WHEN an Integration_Config is created, THE Reporting_API SHALL validate that the required fields (provider type, endpoint URL) are present and well-formed.
4. THE Reporting_API SHALL allow enabling and disabling individual Integration_Configs without deleting them.
5. WHEN an integration config list is requested, THE Reporting_API SHALL return all configurations for the active company with their current status and last connection test timestamp.
6. THE Reporting_API SHALL store credentials references (not raw credentials) in the Integration_Config, with actual credential values stored in a separate secure location on the filesystem.
7. THE Reporting_API SHALL isolate all integration operations behind the main-process boundary so that external service failures do not affect renderer stability.

### Requirement 11: Integration Connection Testing

**User Story:** As a system administrator, I want to test integration connections before relying on them, so that I can verify that external services are reachable and properly configured.

#### Acceptance Criteria

1. WHEN an integration connection test is requested, THE Reporting_API SHALL attempt a lightweight health-check call to the configured endpoint and return the result (success with response time, or failure with error description).
2. THE Reporting_API SHALL execute connection tests in the main process with a configurable timeout to prevent hanging requests.
3. WHEN a connection test completes, THE Reporting_API SHALL update the last_tested_at timestamp and last_test_result on the Integration_Config record.
4. IF a connection test fails due to network timeout, THEN THE Reporting_API SHALL return a descriptive error including the timeout duration and endpoint URL.
5. IF a connection test fails due to authentication error, THEN THE Reporting_API SHALL return a descriptive error indicating credential verification is needed without exposing credential values in the response.
6. THE Reporting_API SHALL scope connection tests to the active company's Integration_Config records only.

### Requirement 12: Import and Export UI Flows

**User Story:** As a daily user, I want clear import and export screens with progress feedback, so that I can perform bulk data operations confidently without worrying about data corruption.

#### Acceptance Criteria

1. THE Renderer SHALL provide an import screen allowing file selection (CSV), entity type selection, and a preview step showing the Import_Validation_Result before committing.
2. WHEN an import validation completes, THE Renderer SHALL display a summary showing total rows, valid rows, invalid rows (with error descriptions), and a confirmation action to proceed or cancel.
3. WHEN an import is in progress, THE Renderer SHALL display a progress indicator and prevent navigation away from the import screen until completion or cancellation.
4. THE Renderer SHALL provide an export screen allowing entity type selection, optional filters (date range, status), and format selection (CSV for entity exports, CSV or PDF for reports).
5. WHEN an export completes, THE Renderer SHALL display the file path and offer an action to open the containing folder in the system file manager.
6. WHEN an import or export operation fails, THE Renderer SHALL display a clear error message describing what went wrong and whether any data was modified.
7. THE Renderer SHALL display loading states during import validation and export generation without blocking other application areas.

### Requirement 13: Automation and Reminder UI

**User Story:** As a business owner, I want screens to manage automation rules and view reminders, so that I can configure automatic actions and track pending operational items.

#### Acceptance Criteria

1. THE Renderer SHALL provide an automation rules list screen showing all configured rules with their trigger description, action description, enabled/disabled status, and last evaluation timestamp.
2. THE Renderer SHALL provide an automation rule creation form with trigger type selection, condition parameters, action type selection, and action parameters.
3. THE Renderer SHALL provide toggle controls to enable or disable individual automation rules from the list view.
4. THE Renderer SHALL provide a reminders panel accessible from the main navigation showing active reminders with entity context, due date, and dismiss/complete actions.
5. WHEN a reminder is dismissed or completed, THE Renderer SHALL remove it from the active reminders panel and display a brief success notification.
6. THE Renderer SHALL display a badge or indicator on the reminders navigation item showing the count of active reminders.
7. THE Renderer SHALL provide a manual "Evaluate Rules" button that triggers rule evaluation and displays a summary of actions taken.

### Requirement 14: Integration Configuration UI

**User Story:** As a system administrator, I want a settings screen to manage integration points, so that I can add, edit, test, and monitor external service connections.

#### Acceptance Criteria

1. THE Renderer SHALL provide an integrations settings screen listing all Integration_Configs for the active company with provider type, endpoint URL, status, and last test result.
2. THE Renderer SHALL provide an integration configuration form for creating and editing Integration_Configs with provider type, endpoint URL, credentials, and description fields.
3. THE Renderer SHALL provide a "Test Connection" button on each integration entry that triggers a connection test and displays the result inline.
4. WHEN a connection test is in progress, THE Renderer SHALL display a loading indicator on the specific integration entry without blocking other entries.
5. THE Renderer SHALL provide toggle controls to activate or deactivate individual integrations from the list view.
6. THE Renderer SHALL mask credential values in the UI, showing only the last 4 characters, and require explicit action to reveal or edit.

### Requirement 15: Reporting and Dashboard Performance

**User Story:** As a daily user, I want dashboards and reports to remain responsive even with large datasets, so that generating reports does not slow down my daily workflow.

#### Acceptance Criteria

1. WHEN a Dashboard data request is served from cache, THE Reporting_API SHALL return results within 100ms.
2. WHEN a Dashboard_Aggregate recomputation is triggered, THE Reporting_API SHALL complete the computation within 2 seconds for companies with up to 100,000 transactional records.
3. WHEN a report is generated with filters, THE Reporting_API SHALL return the first page of results within 500ms for datasets up to 50,000 records.
4. WHEN a CSV export is generated, THE Reporting_API SHALL complete file generation within 5 seconds for exports up to 100,000 rows.
5. WHEN a PDF export is generated, THE Reporting_API SHALL complete file generation within 10 seconds for reports up to 10,000 rows.
6. THE Reporting_API SHALL execute all heavy computations (aggregates, report queries, export generation) in the main process without blocking the renderer thread.
7. WHEN a dashboard filter is changed, THE Renderer SHALL debounce the request by 300ms to prevent excessive recomputation during rapid filter changes.

### Requirement 16: Company Data Isolation for Reporting and Automation

**User Story:** As a business owner with multiple companies, I want all reporting, automation, and integration data to be strictly isolated per company, so that no data leaks between companies.

#### Acceptance Criteria

1. THE Reporting_API SHALL include the active company identifier in all dashboard, report, import, export, automation, and integration queries as a mandatory filter.
2. FOR ALL reporting and automation endpoints, THE Reporting_API SHALL verify that referenced entities belong to the active company before performing operations.
3. WHEN a request references an entity that does not belong to the active company, THE Reporting_API SHALL return a not-found error without revealing the existence of the entity in another company.
4. THE Reporting_API SHALL enforce company scoping at the database query level for all reporting, automation, reminder, and integration read and write operations.
5. THE Reporting_API SHALL isolate Import_Jobs so that imported records are always assigned to the active company regardless of any company references in the import file.

### Requirement 17: Transactional Consistency for Import Operations

**User Story:** As a daily user, I want import operations to be transactionally safe, so that partial failures do not leave the database in an inconsistent state.

#### Acceptance Criteria

1. WHEN a full import is confirmed (no invalid rows skipped), THE Reporting_API SHALL execute all inserts within a single database transaction.
2. WHEN a partial import is confirmed (some rows skipped), THE Reporting_API SHALL execute valid row inserts within a single database transaction, skipping invalid rows.
3. IF the import transaction fails after confirmation, THEN THE Reporting_API SHALL roll back all changes from that transaction and return an error indicating no records were modified.
4. WHEN an import completes successfully, THE Reporting_API SHALL return a summary indicating the number of records created, updated, and skipped.
5. THE Reporting_API SHALL create an Audit_Log entry for each completed Import_Job with entity_type "import", action "completed", and details including the entity type, file name, and record counts.

### Requirement 18: Report Screens and Filtering

**User Story:** As a business owner, I want report screens with flexible filters and grouping options, so that I can generate the specific data views I need for decision-making.

#### Acceptance Criteria

1. THE Renderer SHALL provide a reports screen listing all available Report_Templates with descriptions and a "Generate" action for each.
2. THE Renderer SHALL provide a report configuration panel allowing date range selection, entity filters (customer, supplier, product, category), status filters, and grouping options specific to each Report_Template.
3. WHEN a report is generated, THE Renderer SHALL display results in a paginated table with column sorting, summary totals, and export actions (CSV, PDF).
4. THE Renderer SHALL display report loading states clearly and allow cancellation of report generation if results are not yet returned.
5. THE Renderer SHALL provide filter controls that update report results without full page reload, using debounced requests.
6. WHEN a report contains grouped results, THE Renderer SHALL display expandable group headers with subtotals and individual rows within each group.
7. THE Renderer SHALL keep report table interactions (sorting, pagination, scrolling) responsive for result sets up to 10,000 rows.
