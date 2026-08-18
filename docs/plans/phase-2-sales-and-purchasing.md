# Phase 2 - Sales and Purchasing Flows

## Goal

Expand the application into commercial operations. This phase delivers end-to-end quote and order workflows for the sales side, plus supplier and purchase order management for procurement.

## Sprint estimate

Sprint 4

## Deliverables

- Customer and supplier management
- End-to-end quote creation and order conversion workflow
- Sales order and purchase order management with status tracking
- Payment and settlement handling for orders and purchases
- Stronger business process coverage for retail and distribution

## Scope

### Backend

- Implement customer, supplier, quote, sales order, purchase order, and item-level persistence
- Enforce status transitions, totals, and quote-to-order conversion rules without breaking inventory integrity
- Keep inventory, order, payment, and financial references consistent when commercial transactions change
- Consolidate calculation and validation logic in the main-process layer to reduce drift and inconsistencies
- Use deterministic serialization and validation around conversions and document updates
- Support purchase order lines, quantities, costs, delivery expectations, and payment status
- Track partial receipts and maintain consistency between purchase activity and stock movement

### Frontend

- Create screens for customers, quotes, sales orders, suppliers, and purchase orders
- Add item rows, totals, status controls, payment states, and conversion actions with clear error handling
- Keep the experience aligned with desktop-first interaction patterns and shared UI conventions
- Use memoization and composition for complex forms and detail panels to reduce rerender costs
- Use TanStack Query for fetching order summaries, items, and related entities with targeted invalidation after mutations

### Performance focus

- Keep forms responsive while editing multi-item transactions
- Avoid unnecessary refetches after local mutations and use optimistic updates only where they are clearly safe
- Ensure nested item editors and large transaction tables stay smooth under real usage

## Backlog

### P2 - Important for daily commercial operations

- [ ] Implement customer and supplier management screens
- [ ] Add quote creation, editing, and item-line management
- [ ] Implement quote-to-order conversion with validation and status updates
- [ ] Build sales order and purchase order screens with totals and status tracking
- [ ] Add payment and settlement handling for orders and purchases
- [ ] Support both retail and distribution transaction patterns without compromising inventory integrity
- [ ] Keep commercial data consistent across inventory, order history, and financial references
- [ ] Keep form interactions smooth even with multi-item documents and frequent updates

## Validation criteria

- Quotes can be created, edited, and converted into orders without inconsistent state
- Purchase and sales workflows can be completed from start to finish
- Totals and status transitions are reliable and testable
- Purchase orders and payments are stored with correct totals, statuses, and references
- Inventory references remain consistent when commercial transactions change
- Partial receipts maintain consistency between purchase activity and stock movement
- Forms remain responsive with multi-item documents

## Dependencies

- Phase 0 (foundation shell, shared UI primitives)
- Phase 1 (catalog and inventory module for product references and stock movement integration)

## Technical notes

- Convert quotations into sales orders while keeping the original context and related inventory references intact
- Support item lines, quantities, pricing, discounts, totals, and status transitions
- Support partial or complete payment registration without introducing inconsistent balances
- Consolidate calculation logic in the main-process layer to avoid drift between renderer and persistence
- Use deterministic serialization around quote/order conversions to reduce edge-case bugs
- Keep list and form interactions smooth even for documents with many item lines
- Preserve company scoping and link procurement activity to the correct inventory and financial context
