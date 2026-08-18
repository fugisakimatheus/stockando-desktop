# Phase 1 - Catalog and Inventory Management

## Goal

Deliver the first operational module for daily business use. This is one of the core modules of the product, covering products, warehouses, stock tracking, and inventory accuracy controls.

## Sprint estimate

Sprint 3

## Deliverables

- Usable product catalog with categories and units of measure
- Product inventory visibility across warehouses and stock locations
- Stock movement history with adjustments and reconciliation
- Responsive listing and filtering for inventory-heavy operations

## Scope

### Backend

- Implement CRUD workflows for categories, units of measure, products, warehouses, and stock locations
- Implement stock movement and adjustment workflows with reasons, responsible users, and audit context
- Maintain stock balances from movement history and enforce inventory consistency rules
- Add indexes and query patterns for product, warehouse, and stock lookups to keep operations efficient
- Use transactional write patterns where stock updates and movement records must remain consistent
- Preserve company scoping and ensure quantities and references remain consistent

### Frontend

- Build list and detail screens for categories, products, warehouses, stock locations, and movement history
- Add validation-rich inventory adjustment and transfer flows with clear feedback states
- Use shared UI components for forms, tables, filters, empty states, and detail panels
- Use TanStack Table for larger inventory lists with pagination and lightweight filtering
- Use TanStack Query caching and targeted invalidation for catalog and inventory data
- Add search, filtering, and paginated list behavior for catalog and inventory views

### Performance focus

- Keep inventory lists responsive with pagination, constrained result sets, and efficient table rendering
- Avoid unnecessary full-page re-renders when editing rows or changing filters
- Profile list and form interactions and optimize repeated rendering where needed

## Backlog

### P1 - Core operational module for the MVP

- [ ] Add CRUD screens for categories and units of measure
- [ ] Add CRUD screens for products, warehouses, and stock locations
- [ ] Implement stock movement entry and inventory adjustment workflows
- [ ] Maintain stock balances from movement history with validation, audit context, and reconciliation rules
- [ ] Add search, filtering, and paginated list behavior for catalog and inventory views
- [ ] Support both retail and distribution inventory behaviors where relevant
- [ ] Ensure inventory actions remain responsive with indexed queries, constrained result sets, and efficient table rendering

## Validation criteria

- Products and stock can be created, edited, and listed reliably
- Stock balances update correctly after adjustments and movement entry
- Inventory screens remain responsive for standard catalog sizes
- Company scoping isolates data between companies
- Both retail and distribution inventory patterns work without inconsistencies

## Dependencies

- Phase 0 (foundation shell, database layer, shared UI primitives)

## Technical notes

- Maintain stock balances from movement history rather than storing editable balance values
- Use transactional writes to ensure stock updates and movement records are consistent
- Support stock adjustments with reasons and responsible users for audit traceability
- Preserve clear references between products, categories, warehouses, units, and movement history
- Prevent inconsistent stock states when creating, converting, or correcting documents
- Use TanStack Table for list views with pagination support
- Use TanStack Query with targeted invalidation after stock mutations
