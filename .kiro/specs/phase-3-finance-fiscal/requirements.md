# Requirements Document

## Introduction

Phase 3 extends the Stockando Desktop application into finance, fiscal compliance, and auditability. It delivers payment installment tracking with financial status visibility, full fiscal document management (NF-e and NFC-e) with generation, validation, and lifecycle states, attachment handling for key business entities, and audit-history views for critical updates and state changes. The module integrates with Phase 2's commercial operations to maintain consistency between inventory, commercial documents, and financial records. All operations remain company-scoped, transactionally consistent, and responsive for document-heavy workflows. Fiscal document handling follows Brazilian NF-e/NFC-e requirements including XML preservation, access key tracking, DANFE generation, and protocol number storage.

## Glossary

- **Finance_API**: The Fastify HTTP API layer in the Electron main process responsible for handling finance, fiscal, attachment, and audit requests from the renderer.
- **Installment**: A scheduled payment fraction of a Sales_Order or Purchase_Order total, with a due date, expected amount, and settlement status. Multiple installments compose a payment plan for a single order.
- **Payment_Plan**: A collection of Installments associated with a single order, representing the agreed-upon payment schedule. The sum of all Installment amounts equals the order Document_Total.
- **Financial_Transaction**: A record in the financial_transactions table linking a payment event to a financial account, tracking the actual money movement with reference to the originating order or fiscal document.
- **Fiscal_Document**: A formal tax document (NF-e or NFC-e) stored in the invoices table, representing an authorized electronic invoice with XML content, access key, protocol number, and lifecycle status. Linked to a Sales_Order or Purchase_Order.
- **Fiscal_Document_Status**: The lifecycle state of a Fiscal_Document: draft, authorized, cancelled, or denied.
- **Access_Key**: A 44-digit unique identifier (chave de acesso) assigned to a Fiscal_Document by SEFAZ, used for document lookup and validation.
- **Protocol_Number**: A numeric confirmation code returned by SEFAZ upon successful authorization or cancellation of a Fiscal_Document.
- **DANFE**: Documento Auxiliar da Nota Fiscal Eletrônica — the PDF representation of a Fiscal_Document, used for physical transport and customer delivery.
- **XML_Content**: The complete XML representation of a Fiscal_Document as submitted to or returned from SEFAZ, preserved for compliance and audit for a minimum of 5 years.
- **Fiscal_Event**: A lifecycle event recorded against a Fiscal_Document, such as authorization, cancellation, or correction letter, with timestamp, protocol, and justification.
- **Attachment**: A file associated with a business entity (order, fiscal document, payment), stored with reference metadata (entity type, entity ID, file name, file path, MIME type). Scoped to a company.
- **Audit_Log**: A record of a meaningful change to a critical business entity, stored in the audit_logs table with entity type, entity ID, action description, user reference, and optional details JSON.
- **Audit_Trail**: The complete sequence of Audit_Log entries for a specific entity, providing traceability of all state changes over time.
- **Company_Scope**: The isolation boundary ensuring all financial, fiscal, and audit data is filtered by the active company identifier.
- **Document_Series**: A numbered sequence configuration per company and document type, used to generate sequential fiscal document numbers.

## Requirements

### Requirement 1: Payment Installment Management

**User Story:** As a financial operator, I want to create and track payment installments for orders, so that I can manage scheduled payment plans and monitor settlement progress.

#### Acceptance Criteria

1. WHEN a valid installment creation request is received for a Sales_Order or Purchase_Order, THE Finance_API SHALL create one or more Installment records with due date, expected amount, and initial status "pending", scoped to the active company.
2. THE Finance_API SHALL validate that the sum of all Installment amounts for an order equals the order Document_Total before persisting the payment plan.
3. WHEN an installment is settled, THE Finance_API SHALL update the Installment status to "paid", record the settlement date, and create a corresponding Financial_Transaction linking the payment to the associated financial account.
4. IF a payment plan creation request contains installment amounts that do not sum to the order Document_Total, THEN THE Finance_API SHALL reject the request with a validation error indicating the discrepancy.
5. WHEN an installment list is requested for an order, THE Finance_API SHALL return all Installment records for that order with computed totals (total expected, total paid, total overdue).
6. WHILE an order has one or more Installments with status "pending" and due date in the past, THE Finance_API SHALL classify those Installments as "overdue" when returning the installment list.
7. THE Finance_API SHALL track the financial status of each order as "unpaid" (no installments settled), "partially_paid" (at least one settled but not all), or "paid" (all installments settled).
8. IF an installment settlement request contains a zero or negative amount, THEN THE Finance_API SHALL reject the request with a validation error.

### Requirement 2: Financial Transaction Recording

**User Story:** As a financial operator, I want payment activity to generate financial transaction records, so that I can maintain an accurate ledger of money movements linked to business operations.

#### Acceptance Criteria

1. WHEN an installment is settled, THE Finance_API SHALL create a Financial_Transaction record with the payment amount, transaction date, reference to the originating order, and the target financial account.
2. THE Finance_API SHALL validate that the referenced financial account exists, belongs to the active company, and has status "active" before creating the Financial_Transaction.
3. WHEN a Financial_Transaction is created, THE Finance_API SHALL update the associated financial account current balance by adding the transaction amount (positive for inbound, negative for outbound).
4. THE Finance_API SHALL classify Financial_Transactions as "inbound" for payments received (sales order settlements) and "outbound" for payments made (purchase order settlements).
5. WHEN a financial transaction list is requested for an account, THE Finance_API SHALL return a paginated list of transactions ordered by transaction date, with running balance computation.
6. THE Finance_API SHALL execute the installment settlement and Financial_Transaction creation within a single database transaction to maintain balance consistency.
7. IF any step within the settlement transaction fails, THEN THE Finance_API SHALL roll back the entire transaction and leave the installment, account balance, and audit state unchanged.

### Requirement 3: Financial Status Visibility

**User Story:** As a business owner, I want to view financial summaries at the order and account level, so that I can understand cash flow and outstanding obligations at a glance.

#### Acceptance Criteria

1. WHEN a financial summary is requested for a Sales_Order, THE Finance_API SHALL return the Document_Total, total paid, remaining balance, payment status, and list of installments with their individual statuses.
2. WHEN a financial summary is requested for a Purchase_Order, THE Finance_API SHALL return the Document_Total, total paid, remaining balance, payment status, and list of installments with their individual statuses.
3. WHEN a financial account summary is requested, THE Finance_API SHALL return the account name, type, initial balance, current balance, and recent transaction count.
4. WHEN a financial overview is requested for the active company, THE Finance_API SHALL return aggregated totals: total receivable (pending sales installments), total payable (pending purchase installments), total overdue receivables, and total overdue payables.
5. THE Finance_API SHALL compute all financial summaries from persisted data without requiring manual recalculation triggers.

### Requirement 4: Fiscal Document Creation

**User Story:** As a fiscal operator, I want to create fiscal documents (NF-e and NFC-e) linked to sales orders, so that I can issue electronic invoices that comply with Brazilian tax requirements.

#### Acceptance Criteria

1. WHEN a fiscal document creation request is received for a Sales_Order in "confirmed", "partially_fulfilled", or "fulfilled" status, THE Finance_API SHALL create a Fiscal_Document record with document type (NF-e or NFC-e), initial status "draft", a generated document number from the active Document_Series, and a reference to the originating Sales_Order.
2. WHEN a fiscal document is created, THE Finance_API SHALL copy the Sales_Order items as Fiscal_Document items (invoice_items) with product references, quantities, unit prices, and tax amounts.
3. THE Finance_API SHALL compute the Fiscal_Document subtotal, tax amount, and total amount from the copied items and persist them on the document record.
4. WHEN a fiscal document creation request specifies a tax rule, THE Finance_API SHALL associate the referenced Tax_Rule with the Fiscal_Document for tax calculation purposes.
5. WHEN a fiscal document creation request specifies a digital certificate, THE Finance_API SHALL associate the referenced Digital_Certificate with the Fiscal_Document for authorization purposes.
6. THE Finance_API SHALL generate the document number using the next sequential value from the Document_Series matching the company, document type, and configured series.
7. IF a fiscal document creation request references a Sales_Order that already has an active (non-cancelled) Fiscal_Document of the same type, THEN THE Finance_API SHALL reject the request with a conflict error.

### Requirement 5: Fiscal Document Lifecycle Management

**User Story:** As a fiscal operator, I want to manage fiscal document lifecycle states (authorization, cancellation), so that I can track the compliance status of each issued document.

#### Acceptance Criteria

1. WHEN a fiscal document authorization is recorded, THE Finance_API SHALL update the Fiscal_Document status to "authorized", store the access key (44-digit chave de acesso), store the authorization protocol number, and record the authorization timestamp.
2. WHEN a fiscal document cancellation is recorded for a document in "authorized" status, THE Finance_API SHALL update the Fiscal_Document status to "cancelled", store the cancellation protocol number, and record the cancellation timestamp and justification.
3. IF a fiscal document cancellation is requested for a document not in "authorized" status, THEN THE Finance_API SHALL reject the request with a validation error indicating the current status and allowed transitions.
4. IF a fiscal document authorization is requested for a document not in "draft" status, THEN THE Finance_API SHALL reject the request with a validation error.
5. THE Finance_API SHALL validate that the access key follows the 44-digit format before storing it on the Fiscal_Document.
6. WHEN a fiscal document status transition occurs, THE Finance_API SHALL create a Fiscal_Event record with the event type, timestamp, protocol number, and optional justification.
7. THE Finance_API SHALL preserve the complete XML content of the authorized fiscal document for a minimum retention period aligned with Brazilian compliance requirements (5 years).

### Requirement 6: Fiscal Document XML and DANFE Management

**User Story:** As a fiscal operator, I want to store and retrieve the XML content and DANFE representation of fiscal documents, so that I can maintain compliance records and provide printed representations when needed.

#### Acceptance Criteria

1. WHEN a fiscal document is authorized, THE Finance_API SHALL store the complete authorization XML content as an Attachment associated with the Fiscal_Document entity.
2. WHEN a DANFE generation is requested for an authorized Fiscal_Document, THE Finance_API SHALL generate a PDF representation and store it as an Attachment associated with the Fiscal_Document entity.
3. WHEN a fiscal document XML retrieval is requested, THE Finance_API SHALL return the stored XML content from the associated Attachment record.
4. WHEN a DANFE retrieval is requested, THE Finance_API SHALL return the stored PDF file path from the associated Attachment record.
5. THE Finance_API SHALL organize fiscal document files (XML and DANFE) in a directory structure compatible with the backup feature archive layout: `{companyId}/fiscal/{year}/{month}/{documentType}/{documentNumber}/`.
6. IF a DANFE generation is requested for a Fiscal_Document not in "authorized" status, THEN THE Finance_API SHALL reject the request with a validation error.

### Requirement 7: Fiscal Document Query and Listing

**User Story:** As a fiscal operator, I want to search and filter fiscal documents, so that I can locate specific invoices for review, compliance checks, or customer inquiries.

#### Acceptance Criteria

1. WHEN a fiscal document list is requested, THE Finance_API SHALL return a paginated list of Fiscal_Documents for the active company, supporting filters by document type, status, date range, and customer.
2. WHEN a fiscal document detail is requested, THE Finance_API SHALL return the full Fiscal_Document record including items, associated events (authorization, cancellation), customer name, and related order reference.
3. WHEN a fiscal document search by access key is requested, THE Finance_API SHALL return the matching Fiscal_Document if it belongs to the active company.
4. THE Finance_API SHALL support search by document number or customer name on the fiscal document list endpoint.
5. WHEN a fiscal document list is requested with a date range filter, THE Finance_API SHALL filter by issue date within the specified range (inclusive on both ends).

### Requirement 8: Attachment Management

**User Story:** As a daily user, I want to attach files to business entities (orders, fiscal documents, payments), so that I can keep supporting documentation linked to the relevant records.

#### Acceptance Criteria

1. WHEN a valid attachment upload request is received, THE Finance_API SHALL store the file on the local filesystem and create an Attachment record with entity type, entity ID, file name, file path, and MIME type, scoped to the active company.
2. THE Finance_API SHALL validate that the referenced entity (order, fiscal document, or payment) exists and belongs to the active company before creating the Attachment.
3. WHEN an attachment list is requested for an entity, THE Finance_API SHALL return all Attachment records for that entity type and entity ID within the active company.
4. WHEN an attachment deletion is requested, THE Finance_API SHALL remove the Attachment record and the associated file from the filesystem.
5. THE Finance_API SHALL enforce a maximum file size per attachment to prevent excessive disk usage.
6. IF an attachment upload request references an entity that does not exist or belongs to another company, THEN THE Finance_API SHALL reject the request with a not-found error.
7. THE Finance_API SHALL support the following entity types for attachments: "sales_order", "purchase_order", "fiscal_document", and "payment".

### Requirement 9: Audit Log Recording

**User Story:** As a compliance officer, I want meaningful changes to critical entities to be automatically recorded, so that I can trace the history of business operations.

#### Acceptance Criteria

1. WHEN an installment is settled, THE Finance_API SHALL record an Audit_Log entry with entity_type "installment", the installment ID, action "settled", and details including the payment amount and financial account reference.
2. WHEN a fiscal document status transition occurs, THE Finance_API SHALL record an Audit_Log entry with entity_type "fiscal_document", the document ID, action describing the transition (e.g., "status_change:draft→authorized"), and details including the protocol number.
3. WHEN an attachment is created or deleted, THE Finance_API SHALL record an Audit_Log entry with entity_type "attachment", the attachment ID, and the action ("created" or "deleted") with the associated entity reference in details.
4. WHEN a financial transaction is created, THE Finance_API SHALL record an Audit_Log entry with entity_type "financial_transaction", the transaction ID, action "created", and details including the amount and account reference.
5. THE Finance_API SHALL include the active user ID and active company ID on all Audit_Log entries.
6. THE Finance_API SHALL store Audit_Log details as a JSON text field containing structured context relevant to the action performed.

### Requirement 10: Audit History Query and Display

**User Story:** As a compliance officer, I want to view the audit history of any critical entity, so that I can review the sequence of changes for compliance and troubleshooting purposes.

#### Acceptance Criteria

1. WHEN an audit history is requested for a specific entity (by entity type and entity ID), THE Finance_API SHALL return a paginated list of Audit_Log entries ordered by creation date descending.
2. WHEN an audit history list is requested for the active company, THE Finance_API SHALL return a paginated list of all Audit_Log entries with filtering support by entity type, action, date range, and user.
3. THE Finance_API SHALL return Audit_Log entries with the associated user name resolved from the users table for display purposes.
4. WHEN an audit preview is requested for an entity, THE Finance_API SHALL return only the most recent 5 entries as a compact summary without loading the full history.
5. THE Finance_API SHALL support limit and offset pagination on all audit history endpoints.

### Requirement 11: Fiscal Document Consistency with Commercial Records

**User Story:** As a system administrator, I want fiscal documents to remain consistent with the underlying commercial records, so that financial and fiscal data never contradicts order data.

#### Acceptance Criteria

1. WHEN a Fiscal_Document is created from a Sales_Order, THE Finance_API SHALL verify that the Fiscal_Document total matches the Sales_Order Document_Total before persisting.
2. IF the computed Fiscal_Document total differs from the referenced Sales_Order Document_Total, THEN THE Finance_API SHALL reject the creation with a validation error indicating the discrepancy.
3. WHEN a Sales_Order is cancelled that has an associated authorized Fiscal_Document, THE Finance_API SHALL prevent the cancellation and return a validation error indicating that the fiscal document must be cancelled first.
4. THE Finance_API SHALL prevent modification of Fiscal_Document items after the document transitions from "draft" status.
5. WHEN a Fiscal_Document is cancelled, THE Finance_API SHALL preserve the original document data (items, totals, XML) unchanged for audit purposes.

### Requirement 12: Company Data Isolation for Finance and Fiscal

**User Story:** As a business owner with multiple companies, I want financial, fiscal, and audit data to be strictly isolated per company, so that no data leaks between companies.

#### Acceptance Criteria

1. THE Finance_API SHALL include the active company identifier in all financial, fiscal, attachment, and audit queries as a mandatory filter.
2. FOR ALL finance and fiscal endpoints, THE Finance_API SHALL verify that referenced entities (orders, accounts, documents, certificates) belong to the active company before performing operations.
3. WHEN a request references an entity that does not belong to the active company, THE Finance_API SHALL return a not-found error without revealing the existence of the entity in another company.
4. THE Finance_API SHALL enforce company scoping at the database query level for all financial, fiscal, attachment, and audit read and write operations.

### Requirement 13: Finance and Fiscal UI Screens

**User Story:** As a daily user, I want clear and responsive screens for managing installments, fiscal documents, attachments, and audit histories, so that I can perform finance and compliance operations efficiently.

#### Acceptance Criteria

1. THE Renderer SHALL provide a financial overview screen showing receivables, payables, overdue amounts, and recent payment activity for the active company.
2. THE Renderer SHALL provide an installment management view on order detail screens showing the payment plan, individual installment statuses, due dates, and settlement actions.
3. THE Renderer SHALL provide a fiscal documents list screen with filtering by type, status, date range, and customer, with loading, empty, error, and populated states.
4. THE Renderer SHALL provide a fiscal document detail screen showing document metadata, items, lifecycle events, associated XML/DANFE attachments, and status transition actions.
5. THE Renderer SHALL provide an attachment panel on entity detail screens (orders, fiscal documents) allowing file upload, listing, and deletion without blocking the main workflow.
6. THE Renderer SHALL provide an audit history panel on entity detail screens showing the most recent 5 entries by default with an option to load the full paginated history.
7. WHEN an installment settlement form is submitted, THE Renderer SHALL display a success notification and refresh the installment list and financial summary.
8. WHEN a fiscal document status transition is performed, THE Renderer SHALL display a confirmation dialog before execution and refresh the document detail on success.
9. THE Renderer SHALL keep audit history and attachment panels lightweight by deferring full data loading until the user expands the panel.
10. WHEN a fiscal document list exceeds one page, THE Renderer SHALL display pagination controls and allow navigation between pages without full page reload.
11. THE Renderer SHALL provide search and filter controls on fiscal document and audit history lists that update results without full page reload.
12. THE Renderer SHALL keep form interactions and list scrolling responsive while displaying fiscal documents with up to 200 items or audit histories with 1,000+ entries.

### Requirement 14: Finance and Fiscal Performance

**User Story:** As a daily user, I want finance and fiscal screens to load quickly even with large histories, so that operational efficiency is maintained.

#### Acceptance Criteria

1. WHEN a paginated fiscal document list is requested, THE Finance_API SHALL use indexed queries and return results within 200ms for up to 10,000 documents.
2. WHEN a fiscal document detail with items and events is requested, THE Finance_API SHALL return the complete document within 200ms for documents with up to 200 items.
3. WHEN an audit history for a specific entity is requested, THE Finance_API SHALL return the first page within 200ms for entities with up to 10,000 audit entries.
4. WHEN an attachment list is requested for an entity, THE Finance_API SHALL return results within 100ms for entities with up to 100 attachments.
5. WHEN a financial overview (aggregated receivables and payables) is requested, THE Finance_API SHALL return results within 300ms for companies with up to 50,000 installment records.
6. THE Finance_API SHALL support limit and offset pagination on all list endpoints to prevent loading unbounded result sets.

### Requirement 15: Transactional Consistency for Finance and Fiscal Operations

**User Story:** As a system administrator, I want finance and fiscal operations to be transactionally consistent, so that partial failures never leave installments, transactions, or fiscal records in an inconsistent state.

#### Acceptance Criteria

1. WHEN an installment settlement is executed, THE Finance_API SHALL execute the entire operation (installment status update, Financial_Transaction creation, account balance update, audit log) within a single database transaction.
2. WHEN a fiscal document is created from a Sales_Order, THE Finance_API SHALL execute the entire operation (document creation, item copying, document number generation) within a single database transaction.
3. WHEN a fiscal document status transition is recorded, THE Finance_API SHALL execute the entire operation (status update, event creation, audit log) within a single database transaction.
4. IF any step within a finance or fiscal transaction fails, THEN THE Finance_API SHALL roll back the entire transaction and return an error, leaving the database in its pre-operation state.

### Requirement 16: Fiscal Document Series and Numbering

**User Story:** As a fiscal operator, I want fiscal document numbers to be generated sequentially and uniquely per company and document type, so that numbering complies with SEFAZ requirements.

#### Acceptance Criteria

1. THE Finance_API SHALL generate fiscal document numbers sequentially using the Document_Series table, incrementing the current number for the matching company, document type, and series.
2. THE Finance_API SHALL prevent duplicate document numbers within the same company, document type, and series combination through a database uniqueness constraint.
3. WHEN a new fiscal document is created, THE Finance_API SHALL acquire the next number atomically within the creation transaction to prevent concurrent conflicts.
4. IF the Document_Series for the requested company, document type, and series does not exist, THEN THE Finance_API SHALL reject the request with a validation error indicating that the series must be configured first.
5. THE Finance_API SHALL support multiple active series per company and document type to accommodate fiscal configuration changes.

