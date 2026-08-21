# Implementation Plan: Phase 3 - Finance, Fiscal, and Auditability

## Overview

This plan implements the financial control, fiscal compliance, and audit traceability layer for Stockando Desktop. It follows the existing architecture (Fastify + Drizzle + TanStack + Tailwind) with service-layer pattern, transactional writes, and company-scoped isolation. Tasks are ordered to build foundational schema and services first, then domain logic, then renderer pages.

## Tasks

- [x] 1. Database schema additions and migrations
  - [x] 1.1 Create the `installments` table schema in `src/main/db/schema.ts`
    - Add `installments` table with id, companyId, orderId, orderType, installmentNumber, amount, dueDate, status, settledAt, accountId, createdAt, updatedAt
    - Add foreign keys to companies, financialAccounts
    - Add indexes on (companyId, orderId, orderType) and (companyId, status)
    - _Requirements: 1.1, 1.5, 12.4_

  - [x] 1.2 Create the `invoice_events` table schema in `src/main/db/schema.ts`
    - Add `invoiceEvents` table with id, invoiceId, eventType, protocolNumber, justification, eventDate, createdAt
    - Add foreign key to invoices with cascade delete
    - Add index on invoiceId
    - _Requirements: 5.6_

  - [x] 1.3 Add new columns to `invoices` table in `src/main/db/schema.ts`
    - Add protocolNumber (text, nullable), cancellationJustification (text, nullable), authorizedAt (text, nullable), cancelledAt (text, nullable), series (text, nullable), discountAmount (real, default 0)
    - _Requirements: 5.1, 5.2, 4.1_

  - [x] 1.4 Add `fileSize` column to `attachments` table in `src/main/db/schema.ts`
    - Add fileSize (integer, nullable) for max size enforcement
    - _Requirements: 8.5_

  - [x] 1.5 Create Drizzle migration for all schema changes
    - Generate and apply migration using `drizzle-kit generate` and `drizzle-kit migrate`
    - Verify all tables and columns are created correctly
    - _Requirements: 1.1, 4.1, 5.6, 8.5_

- [x] 2. Core type definitions and shared utilities
  - [x] 2.1 Create shared type definitions for Phase 3 in `src/main/types/finance.ts`
    - Define InstallmentStatus, FiscalDocumentStatus, FiscalDocumentType, TransactionType, OrderType, FinancialStatus, AttachmentEntityType as const objects
    - Define all API request types (CreatePaymentPlanInput, SettleInstallmentInput, CreateFiscalDocumentInput, AuthorizeFiscalInput, CancelFiscalInput, CreateAttachmentInput, CreateTransactionInput)
    - Define all API response types (InstallmentSummary, SettlementResult, FinancialOverview, FiscalDocumentListItem, FiscalDocumentDetail, etc.)
    - Define Pagination, PaginatedResult, AuditListFilters, FiscalDocumentListFilters
    - _Requirements: 1.7, 2.4, 4.1, 5.1, 8.7, 10.2_

  - [x] 2.2 Create error code constants and ApiErrorResponse type in `src/main/types/errors.ts`
    - Define all Phase 3 error codes (INSTALLMENT_SUM_MISMATCH, INVALID_STATUS_TRANSITION, INVALID_ACCESS_KEY, etc.)
    - Define BusinessError class for service-layer exceptions
    - _Requirements: 1.4, 1.8, 5.3, 5.4, 5.5, 11.2_

  - [x] 2.3 Create fiscal document status transition utilities
    - Implement VALID_FISCAL_TRANSITIONS map, validateFiscalTransition function, validateAccessKey function
    - Use ts-pattern for status matching
    - _Requirements: 5.3, 5.4, 5.5_

  - [x] 2.4 Create financial status derivation utilities
    - Implement deriveFinancialStatus, classifyOverdue functions
    - Use ts-pattern for status derivation
    - _Requirements: 1.6, 1.7_

  - [x] 2.5 Create fiscal file path generation utility
    - Implement getFiscalFilePath following pattern `{companyId}/fiscal/{year}/{month}/{typeDir}/{documentNumber}/{fileName}`
    - _Requirements: 6.5_

- [x] 3. Checkpoint - Ensure schema and types compile correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Audit Service implementation
  - [x] 4.1 Implement AuditService in `src/main/services/audit-service.ts`
    - Implement `log(tx, entry)` for recording audit entries within a transaction
    - Implement `historyForEntity(companyId, entityType, entityId, pagination)` with descending order
    - Implement `previewForEntity(companyId, entityType, entityId)` returning last 5 entries
    - Implement `listForCompany(companyId, filters)` with filtering by entityType, action, userId, dateRange
    - Join with users table to resolve userName for display
    - Enforce company scoping on all queries
    - _Requirements: 9.5, 9.6, 10.1, 10.2, 10.3, 10.4, 10.5, 12.1, 12.4_

  - [x] 4.2 Write property tests for AuditService
    - **Property 22: Audit log completeness and format**
    - **Property 23: Audit history ordering**
    - **Property 24: Audit preview returns at most 5 entries**
    - **Validates: Requirements 9.5, 9.6, 10.1, 10.4**

- [x] 5. Attachment Service implementation
  - [x] 5.1 Implement AttachmentService in `src/main/services/attachment-service.ts`
    - Implement `listForEntity(companyId, entityType, entityId)` with company scoping
    - Implement `create(companyId, input)` with entity existence validation, file size check, file copy to structured path, and record creation
    - Implement `delete(companyId, id)` removing both DB record and filesystem file
    - Implement `getFilePath(companyId, entityType, entityId, fileName)` for path computation
    - Validate entityType is one of "sales_order", "purchase_order", "fiscal_document", "payment"
    - Enforce maximum file size constraint
    - Record audit log on create/delete
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.3, 12.1, 12.2_

  - [x] 5.2 Write property test for AttachmentService
    - **Property 21: Attachment listing returns correct entity attachments**
    - **Validates: Requirements 8.3**

- [x] 6. Financial Account and Transaction Services
  - [x] 6.1 Implement FinancialAccountService in `src/main/services/financial-account-service.ts`
    - Implement `list(companyId)` returning active accounts with current balance
    - Implement `detail(companyId, id)` returning account with recent transaction count
    - Implement `overview(companyId)` computing total receivable, total payable, total overdue receivables, total overdue payables from installments
    - Implement `updateBalance(tx, accountId, amount)` for atomic balance updates within a transaction
    - Validate account belongs to active company and has status "active"
    - _Requirements: 3.3, 3.4, 3.5, 2.2, 12.1_

  - [x] 6.2 Implement FinancialTransactionService in `src/main/services/financial-transaction-service.ts`
    - Implement `listForAccount(companyId, accountId, pagination)` with running balance computation, ordered by transaction date
    - Implement `create(tx, companyId, input)` for inserting a transaction within the caller's transaction context
    - Classify as "inbound" for sales order settlements, "outbound" for purchase order settlements
    - Record audit log on transaction creation
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 9.4, 12.1_

  - [x] 6.3 Write property tests for financial services
    - **Property 7: Transaction type classification**
    - **Property 8: Running balance computation**
    - **Property 6: Financial overview aggregation**
    - **Validates: Requirements 2.4, 2.5, 3.4**

- [x] 7. Installment Service implementation
  - [x] 7.1 Implement InstallmentService in `src/main/services/installment-service.ts`
    - Implement `listForOrder(companyId, orderType, orderId)` returning installments with computed totals (totalExpected, totalPaid, totalOverdue), derived financialStatus, and overdue classification
    - Implement `createPlan(companyId, input)` validating that installment amounts sum to order Document_Total, rejecting with INSTALLMENT_SUM_MISMATCH otherwise
    - Implement `settle(companyId, installmentId, input)` within a single transaction: validate status is "pending", validate account, update installment to "paid", create Financial_Transaction, update account balance, record audit log
    - Reject settlement with zero or negative amount
    - Classify overdue based on pending status and past due date
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.3, 2.6, 2.7, 9.1, 15.1_

  - [x] 7.2 Write property tests for InstallmentService
    - **Property 1: Installment sum equals document total**
    - **Property 2: Settlement creates transaction and updates balance**
    - **Property 3: Financial status derivation**
    - **Property 4: Overdue classification**
    - **Property 5: Financial summary remaining balance**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.6, 1.7, 2.1, 2.3, 3.1, 3.2**

- [x] 8. Checkpoint - Ensure all financial services pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Document Series Service implementation
  - [x] 9.1 Implement DocumentSeriesService in `src/main/services/document-series-service.ts`
    - Implement `getNextNumber(tx, companyId, documentType, series)` with atomic increment within transaction context
    - Query the documentSeries table for matching company/type/series, increment current number, return the new number
    - Reject with SERIES_NOT_CONFIGURED if series does not exist
    - Rely on unique index to prevent duplicate numbers
    - _Requirements: 4.6, 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x] 9.2 Write property test for DocumentSeriesService
    - **Property 13: Sequential document numbering**
    - **Validates: Requirements 4.6, 16.1, 16.2**

- [x] 10. Fiscal Document Service implementation
  - [x] 10.1 Implement FiscalDocumentService `create` in `src/main/services/fiscal-document-service.ts`
    - Validate Sales_Order exists, belongs to company, and is in "confirmed", "partially_fulfilled", or "fulfilled" status
    - Check no active (non-cancelled) fiscal document of same type exists for order
    - Get next document number from DocumentSeriesService within transaction
    - Copy order items as invoice_items with product refs, quantities, unit prices, tax amounts
    - Compute subtotal, discountAmount, taxAmount, totalAmount and validate equals order Document_Total
    - Associate tax rule and digital certificate if specified
    - Record audit log entry
    - Execute entire operation in a single database transaction
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 11.1, 11.2, 15.2_

  - [x] 10.2 Implement FiscalDocumentService `authorize` and `cancel`
    - `authorize`: validate current status is "draft", validate access key format (44 digits), update status to "authorized", store access key, protocol number, authorizedAt timestamp, create invoice_event, store XML as attachment, record audit log — all in single transaction
    - `cancel`: validate current status is "authorized", update status to "cancelled", store cancellation protocol, cancelledAt, justification, create invoice_event, record audit log — all in single transaction
    - Preserve original data unchanged after cancellation
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 11.4, 11.5, 15.3_

  - [x] 10.3 Implement FiscalDocumentService `list`, `detail`, `searchByAccessKey`
    - `list`: paginated with filters (documentType, status, dateRange inclusive, customer), support search by document number or customer name
    - `detail`: return full record with items, events, customer name, order reference
    - `searchByAccessKey`: lookup by exact access key within active company
    - Company scoping on all queries
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 12.1_

  - [x] 10.4 Implement FiscalDocumentService `generateDanfe`, `getXml`, `getDanfePath`
    - `generateDanfe`: validate status is "authorized", generate PDF representation, store as attachment with fiscal file path structure
    - `getXml`: retrieve stored XML content from associated attachment
    - `getDanfePath`: retrieve stored DANFE file path from associated attachment
    - Organize files in `{companyId}/fiscal/{year}/{month}/{typeDir}/{documentNumber}/` structure
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 10.5 Write property tests for FiscalDocumentService
    - **Property 9: Fiscal document status transition validity**
    - **Property 10: Access key format validation**
    - **Property 11: Fiscal document creation copies items faithfully**
    - **Property 12: Fiscal document total computation**
    - **Property 14: Duplicate fiscal document rejection**
    - **Property 15: Fiscal document item immutability after draft**
    - **Property 17: Fiscal data preservation on cancellation**
    - **Property 18: Fiscal file path structure compliance**
    - **Property 19: Access key lookup round-trip**
    - **Property 20: Date range filter correctness**
    - **Validates: Requirements 4.2, 4.3, 4.7, 5.3, 5.4, 5.5, 6.5, 7.3, 7.5, 11.1, 11.4, 11.5**

- [x] 11. Order cancellation guard integration
  - [x] 11.1 Add fiscal document check to Sales_Order cancellation flow
    - Before allowing a Sales_Order cancellation, check for any associated fiscal document in "authorized" status
    - If found, reject with ORDER_HAS_ACTIVE_FISCAL_DOC error referencing the fiscal document
    - _Requirements: 11.3_

  - [x] 11.2 Write property test for order cancellation guard
    - **Property 16: Order cancellation blocked by authorized fiscal document**
    - **Validates: Requirements 11.3**

- [x] 12. Checkpoint - Ensure all services pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Fastify route modules - Financial APIs
  - [x] 13.1 Implement Installments route module at `/api/installments`
    - GET `/api/installments/order/:orderType/:orderId` — list installments with computed totals
    - POST `/api/installments/order/:orderType/:orderId` — create payment plan
    - POST `/api/installments/:id/settle` — settle an installment
    - Extract companyId from request context, validate request bodies
    - _Requirements: 1.1, 1.3, 1.5_

  - [x] 13.2 Implement Financial Transactions route module at `/api/financial-transactions`
    - GET `/api/financial-transactions/account/:accountId` — paginated transaction list with running balance
    - Support limit/offset query parameters
    - _Requirements: 2.5, 14.6_

  - [x] 13.3 Implement Financial Accounts route module at `/api/financial-accounts`
    - GET `/api/financial-accounts` — list accounts for active company
    - GET `/api/financial-accounts/:id` — account detail with summary
    - GET `/api/financial-accounts/overview` — financial overview (receivables, payables, overdue)
    - _Requirements: 3.3, 3.4_

- [x] 14. Fastify route modules - Fiscal APIs
  - [x] 14.1 Implement Fiscal Documents route module at `/api/fiscal-documents`
    - GET `/api/fiscal-documents` — paginated list with filters (type, status, dateRange, customer, search)
    - POST `/api/fiscal-documents` — create fiscal document from Sales_Order
    - GET `/api/fiscal-documents/:id` — fiscal document detail with items and events
    - POST `/api/fiscal-documents/:id/authorize` — record authorization
    - POST `/api/fiscal-documents/:id/cancel` — record cancellation
    - POST `/api/fiscal-documents/:id/danfe` — generate DANFE PDF
    - GET `/api/fiscal-documents/:id/xml` — retrieve XML
    - GET `/api/fiscal-documents/:id/danfe` — retrieve DANFE path
    - GET `/api/fiscal-documents/search-by-key` — search by access key
    - _Requirements: 4.1, 5.1, 5.2, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 15. Fastify route modules - Attachments and Audit APIs
  - [x] 15.1 Implement Attachments route module at `/api/attachments`
    - GET `/api/attachments/:entityType/:entityId` — list attachments for entity
    - POST `/api/attachments/:entityType/:entityId` — upload attachment (multipart or file path)
    - DELETE `/api/attachments/:id` — delete attachment (record + file)
    - Validate entity type is supported, validate entity exists and belongs to company
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 15.2 Implement Audit Logs route module at `/api/audit-logs`
    - GET `/api/audit-logs/:entityType/:entityId` — paginated audit history for entity
    - GET `/api/audit-logs/:entityType/:entityId/preview` — last 5 entries compact
    - GET `/api/audit-logs` — company-wide audit log with filters (entityType, action, userId, dateRange)
    - Support limit/offset pagination on all endpoints
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 16. Checkpoint - Ensure all API routes compile and basic tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Company data isolation enforcement
  - [x] 17.1 Implement company scoping middleware and verify isolation across all endpoints
    - Verify companyId is included in all financial, fiscal, attachment, and audit queries
    - Verify cross-company entity references return not-found without revealing existence
    - Verify at database query level for all read/write operations
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 17.2 Write property test for company data isolation
    - **Property 25: Company data isolation**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4**

- [x] 18. Renderer — Query hooks and API client extensions
  - [x] 18.1 Create installment query hooks in `src/renderer/src/pages/finance/hooks/`
    - Implement useInstallments, useCreatePaymentPlan, useSettleInstallment
    - Use TanStack Query with proper query keys ['installments', orderType, orderId]
    - Invalidate related queries on mutation success
    - _Requirements: 13.2, 13.7_

  - [x] 18.2 Create financial account and transaction hooks
    - Implement useFinancialAccounts, useFinancialAccountDetail, useFinancialOverview, useFinancialTransactions
    - Use query keys ['financial-accounts', ...], ['financial-transactions', accountId, ...]
    - _Requirements: 13.1_

  - [x] 18.3 Create fiscal document query hooks in `src/renderer/src/pages/fiscal-documents/hooks/`
    - Implement useFiscalDocuments, useFiscalDocumentDetail, useCreateFiscalDocument, useAuthorizeFiscalDocument, useCancelFiscalDocument, useGenerateDanfe, useFiscalDocumentXml, useSearchFiscalByAccessKey
    - Use query keys ['fiscal-documents', ...], invalidate list after mutations
    - _Requirements: 13.3, 13.4, 13.8_

  - [x] 18.4 Create attachment and audit hooks in `src/renderer/src/shared/hooks/`
    - Implement useAttachments, useUploadAttachment, useDeleteAttachment
    - Implement useAuditHistory, useAuditPreview, useCompanyAuditLogs
    - Place in shared since these are used across multiple entity detail pages
    - _Requirements: 13.5, 13.6, 13.9_

- [x] 19. Renderer — Shared UI components
  - [x] 19.1 Create shared finance/fiscal UI components in `src/renderer/src/shared/ui/`
    - FiscalStatusBadge — colored badge for fiscal document lifecycle status
    - FinancialSummaryCard — card showing totals (paid, pending, overdue)
    - AuditEntryCard — compact card for a single audit log entry
    - AuditExpandablePanel — collapsible panel with preview (5 entries) + "load more" pagination
    - AttachmentDropzone — file upload area with drag-and-drop and size validation
    - AttachmentList — list of attached files with download/delete actions
    - _Requirements: 13.5, 13.6_

  - [x] 19.2 Create installment-specific UI components
    - InstallmentTimeline — visual timeline of installments with status indicators and due dates
    - SettlementForm — settlement dialog with account selection and amount confirmation
    - _Requirements: 13.2, 13.7_

  - [x] 19.3 Create fiscal document-specific UI components
    - FiscalTransitionActions — contextual action buttons (authorize, cancel, generate DANFE) based on current status
    - RunningBalanceTable — transaction list with computed running balance column
    - _Requirements: 13.4, 13.8_

- [x] 20. Renderer — Financial Overview page
  - [x] 20.1 Create FinancialOverviewPage at `src/renderer/src/pages/finance/`
    - Display receivables, payables, overdue amounts using FinancialSummaryCard
    - Show recent payment activity list
    - Handle loading, empty, and error states
    - Wire to useFinancialOverview hook
    - _Requirements: 13.1_

- [x] 21. Renderer — Installment Panel on Order Detail
  - [x] 21.1 Create InstallmentPanel component embedded in order detail screens
    - Display payment plan with InstallmentTimeline
    - Show individual installment statuses, due dates, amounts
    - Provide settlement action buttons opening SettlementForm dialog
    - Display success notification on settlement and refresh installment list + financial summary
    - Handle loading, empty, error states
    - _Requirements: 13.2, 13.7_

- [x] 22. Renderer — Fiscal Documents list page
  - [x] 22.1 Create FiscalDocumentsPage at `src/renderer/src/pages/fiscal-documents/`
    - Paginated list with TanStack Table
    - Filters: document type, status, date range, customer
    - Search by document number or customer name
    - Pagination controls without full page reload
    - Loading, empty, error, and populated states
    - Responsive with up to 200 items display
    - _Requirements: 13.3, 13.10, 13.11, 13.12_

- [x] 23. Renderer — Fiscal Document detail page
  - [x] 23.1 Create FiscalDocumentDetailPage at `src/renderer/src/pages/fiscal-documents/`
    - Display document metadata, items table, lifecycle events timeline
    - Show associated XML/DANFE attachment links
    - FiscalTransitionActions for status changes (authorize visible for draft, cancel for authorized, DANFE for authorized)
    - Confirmation dialog before status transitions
    - Refresh document detail on successful transition
    - Embed AttachmentPanel and AuditHistoryPanel
    - _Requirements: 13.4, 13.8_

- [x] 24. Renderer — Attachment and Audit panels integration
  - [x] 24.1 Integrate AttachmentPanel on entity detail screens (orders, fiscal documents)
    - File upload, listing, and deletion without blocking the main workflow
    - Non-blocking: defer full data loading until panel is expanded
    - _Requirements: 13.5, 13.9_

  - [x] 24.2 Integrate AuditHistoryPanel on entity detail screens
    - Show most recent 5 entries by default (compact preview)
    - Option to load full paginated history on user expansion
    - Lightweight deferred loading
    - _Requirements: 13.6, 13.9_

- [x] 25. Renderer — Route registration and navigation
  - [x] 25.1 Register new routes in the TanStack Router configuration
    - Add `/finance` route for FinancialOverviewPage
    - Add `/fiscal-documents` route for FiscalDocumentsPage
    - Add `/fiscal-documents/:id` route for FiscalDocumentDetailPage
    - Update navigation/sidebar to include Finance and Fiscal Documents links
    - _Requirements: 13.1, 13.3, 13.4_

- [x] 26. Checkpoint - Ensure renderer compiles and components render correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 27. Performance optimization and indexing
  - [x] 27.1 Add database indexes for performance requirements
    - Add composite index on invoices (companyId, status, issueDate) for fiscal document list queries
    - Add composite index on auditLogs (entityType, entityId, createdAt) for audit history queries
    - Add composite index on attachments (entityType, entityId) for attachment list queries
    - Add composite index on installments (companyId, orderType, status) for financial overview aggregation
    - Add composite index on financialTransactions (accountId, transactionDate) for transaction list queries
    - Verify query performance targets: fiscal list <200ms for 10k docs, audit history <200ms for 10k entries, attachment list <100ms for 100 attachments, overview <300ms for 50k installments
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

- [x] 28. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (25 properties across 10 sub-tasks)
- Unit tests validate specific examples and edge cases
- The project uses TypeScript throughout with strict mode, Drizzle ORM for schema, Fastify for API, TanStack Query/Router/Table in the renderer
- Fiscal document operations use NFeWizard packages for SEFAZ integration (XML generation, DANFE PDF)
- All financial/fiscal operations execute within SQLite transactions for atomicity
- Company scoping is enforced at the database query level on all endpoints

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.5", "2.1", "2.2", "2.3", "2.4", "2.5"] },
    { "id": 2, "tasks": ["4.1", "5.1"] },
    { "id": 3, "tasks": ["4.2", "5.2", "6.1", "6.2"] },
    { "id": 4, "tasks": ["6.3", "7.1", "9.1"] },
    { "id": 5, "tasks": ["7.2", "9.2", "10.1"] },
    { "id": 6, "tasks": ["10.2", "10.3", "10.4"] },
    { "id": 7, "tasks": ["10.5", "11.1"] },
    { "id": 8, "tasks": ["11.2", "13.1", "13.2", "13.3"] },
    { "id": 9, "tasks": ["14.1", "15.1", "15.2"] },
    { "id": 10, "tasks": ["17.1"] },
    { "id": 11, "tasks": ["17.2", "18.1", "18.2", "18.3", "18.4"] },
    { "id": 12, "tasks": ["19.1", "19.2", "19.3"] },
    { "id": 13, "tasks": ["20.1", "25.1"] },
    { "id": 14, "tasks": ["21.1", "22.1"] },
    { "id": 15, "tasks": ["23.1", "24.1", "24.2"] },
    { "id": 16, "tasks": ["27.1"] }
  ]
}
```
