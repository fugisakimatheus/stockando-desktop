# Phase 3 - Finance, Fiscal, and Auditability

## Goal

Make the system more complete for real daily operations. This phase adds payment tracking, fiscal document management, attachments, and audit trail support to provide stronger financial visibility and compliance-oriented workflows.

## Sprint estimate

Sprint 5

## Deliverables

- Payment and installment tracking with financial status visibility
- Full fiscal document management with generation, validation, and lifecycle states
- Attachment handling for key business entities
- Audit-history views for critical updates and state changes
- Traceable transactional records across orders, documents, and payments

## Scope

### Backend

- Add payment, installment, fiscal-document, attachment, and audit-log support
- Ensure financial and fiscal records remain connected to the underlying order and inventory context
- Persist meaningful change history for critical business operations and document lifecycle changes
- Keep audit and attachment operations asynchronous where possible so the user flow is not blocked
- Optimize queries for financial summaries, document history, and reference lookups over larger datasets
- Support fiscal document generation, validation, lifecycle states, and document references
- Maintain consistency between inventory, commercial documents, and financial records
- Preserve historical fiscal data in a way that remains usable for review and compliance workflows

### Frontend

- Build financial review, fiscal document, attachment, and audit-history screens
- Present lifecycle states clearly for orders, documents, payments, and related records
- Keep history and attachment panels lightweight with lazy loading or paged list behavior for large records
- Expose audit context and related attachments in a lightweight and query-efficient way

### Performance focus

- Avoid loading full audit histories on first render when a compact preview is enough
- Defer heavy document or attachment rendering until the user opens the detail view
- Keep review screens responsive even when long histories are present
- Optimize history and attachment loading so large records remain usable

## Backlog

### P3 - Important for stronger operational completeness

- [ ] Add payment, installment, and financial status tracking
- [ ] Implement full fiscal document support, including generation, validation, and compliance-oriented workflows
- [ ] Support fiscal document references and lifecycle states
- [ ] Implement attachment handling for key business entities
- [ ] Expose audit-history views for critical updates and state changes
- [ ] Optimize history and attachment loading so large records remain usable
- [ ] Keep fiscal and financial screens responsive when reviewing long document histories

## Validation criteria

- Financial and fiscal records remain linked to the underlying transaction context
- Audit and attachment views load incrementally and stay responsive
- Important changes are traceable without overwhelming the UI
- Document, payment, and fiscal states are updated consistently
- Attachments and audit records are associated with the correct entities
- Fiscal document lifecycle (generation, validation, compliance) works end to end
- Historical fiscal data remains accessible for review and compliance workflows

## Dependencies

- Phase 0 (foundation shell, database layer)
- Phase 1 (inventory module for stock references)
- Phase 2 (sales and purchasing for order and payment context)

## Technical notes

- Track financial status at the order, document, and payment level
- Associate payment activity with business transactions and maintain consistent balances
- Retain a history of meaningful changes for critical entities (stock, orders, payments, fiscal documents)
- Allow attachments to important records without blocking the core workflow
- Keep audit and attachment operations from becoming a bottleneck for everyday use
- Use lazy loading and incremental rendering for long audit histories
- Isolate fiscal document workflows to support future fiscal service integrations
- Fiscal document storage layout must align with the [backup feature](./backup-feature-plan.md) archive structure
