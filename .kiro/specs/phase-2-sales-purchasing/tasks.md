# Implementation Plan: Phase 2 - Sales and Purchasing Flows

## Overview

This plan implements the complete commercial operations layer for Stockando Desktop, covering sales workflows (customer management, quoting, quote-to-order conversion, sales order fulfillment) and procurement workflows (supplier management, purchase orders, partial receipts with inventory integration, payment tracking). Implementation proceeds from schema adaptations through service layer, API routes, and finally the renderer pages and hooks.

## Tasks

- [x] 1. Schema adaptations and shared utilities
  - [x] 1.1 Add schema columns and new table for purchase order payments
    - Add `receivedQuantity` column (real, default 0) to `purchaseOrderItems` table
    - Add `confirmedAt`, `fulfilledAt`, `cancelledAt` columns (text, nullable) to `orders` table
    - Add `cancelledAt`, `convertedAt` columns (text, nullable) to `quotes` table
    - Add `cancelledAt` column (text, nullable) to `purchaseOrders` table
    - Create `purchaseOrderPayments` table mirroring `orderPayments` structure with `purchaseOrderId` FK
    - Add indexes on new FK columns
    - _Requirements: 9.1, 7.3, 7.4, 7.5, 4.3, 5.2, 8.6_

  - [x] 1.2 Implement shared calculation utilities
    - Create `src/main/services/commercial-utils.ts`
    - Implement `computeSalesLineTotal(quantity, unitPrice, discountAmount)` with half-up rounding to 2 decimals
    - Implement `computePurchaseLineTotal(quantity, unitCost, discountAmount)` with half-up rounding to 2 decimals
    - Implement `computeDocumentTotals(items)` returning `{ subtotal, discountAmount, taxAmount, totalAmount }`
    - Implement `roundHalfUp(value, decimals)` utility
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 1.3 Implement status transition validation utilities
    - Create `src/main/services/status-transitions.ts`
    - Define `VALID_QUOTE_TRANSITIONS`, `VALID_SALES_ORDER_TRANSITIONS`, `VALID_PURCHASE_ORDER_TRANSITIONS` as const records
    - Implement `validateTransition(currentStatus, targetStatus, validTransitions)` using ts-pattern
    - Export typed status constants (`QUOTE_STATUSES`, `SALES_ORDER_STATUSES`, `PURCHASE_ORDER_STATUSES`, `PAYMENT_STATUSES`)
    - _Requirements: 4.1, 4.2, 7.1, 7.2, 8.6, 8.7_

  - [x] 1.4 Implement shared number generation utility
    - Create or extend `src/main/services/numbering-service.ts`
    - Implement `generateNextNumber(tx, companyId, sequenceType)` using the existing `numberingSequences` table
    - Support sequence types: `quote`, `sales_order`, `purchase_order`
    - _Requirements: 3.1, 6.1, 8.1_

- [x] 2. Checkpoint - Ensure schema and utilities compile
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Customer and Supplier services
  - [x] 3.1 Implement CustomerService
    - Create `src/main/services/customer-service.ts`
    - Implement `list(companyId, filters)` with paginated query, search by name/documentNumber, indexed
    - Implement `detail(companyId, id)` returning customer with quoteCount and salesOrderCount
    - Implement `create(companyId, input)` with duplicate documentNumber detection (CONFLICT error)
    - Implement `update(companyId, id, input)` setting updatedAt timestamp
    - Implement `delete(companyId, id)` with referential integrity check (reject if quotes/orders exist)
    - Enforce company scoping on all operations
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 12.1, 12.2, 12.3, 12.4, 13.1_

  - [x] 3.2 Implement SupplierService
    - Create `src/main/services/supplier-service.ts`
    - Implement `list(companyId, filters)` with paginated query, search by name/documentNumber, indexed
    - Implement `detail(companyId, id)` returning supplier with purchaseOrderCount
    - Implement `create(companyId, input)` with duplicate documentNumber detection (CONFLICT error)
    - Implement `update(companyId, id, input)` setting updatedAt timestamp
    - Implement `delete(companyId, id)` with referential integrity check (reject if purchase orders exist)
    - Enforce company scoping on all operations
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 12.1, 12.2, 12.3, 12.4, 13.1_

  - [x] 3.3 Write property tests for CustomerService and SupplierService
    - **Property 14: Referential integrity on deletion** — generate customers/suppliers with dependent docs, verify deletion rejected
    - **Property 15: Duplicate document number rejection** — generate duplicate documentNumber per company, verify CONFLICT error
    - **Property 13: Company data isolation** — create data in company A, query from company B, verify empty results
    - **Validates: Requirements 1.2, 1.6, 2.2, 2.6, 12.1, 12.2, 12.3, 12.4**

- [x] 4. Quote and Sales Order services
  - [x] 4.1 Implement QuoteService
    - Create `src/main/services/quote-service.ts`
    - Implement `list(companyId, filters)` with pagination, customerId/status filters, search by quoteNumber
    - Implement `detail(companyId, id)` returning quote with items (joined with product name/SKU)
    - Implement `create(companyId, input)` — validate product exists in company, compute line totals and document total, generate quoteNumber
    - Implement `update(companyId, id, input)` — guard editable status (draft/sent only), recompute totals
    - Implement `transitionStatus(companyId, id, targetStatus)` — validate transition, set lifecycle timestamps, audit log
    - Validate item quantity > 0, unitPrice > 0, discountAmount >= 0
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 4.2, 4.3, 11.1, 11.3, 11.4, 13.2, 16.1_

  - [x] 4.2 Implement quote-to-order conversion
    - Add `convertToOrder(companyId, id)` to QuoteService
    - Validate quote is in "accepted" status
    - Execute within a single database transaction: create sales order, copy items, record conversion link, update quote to "converted"
    - Generate sales order number, set status "draft", copy all item fields
    - Record audit log entry with conversion details
    - Rollback entire transaction on any failure
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 15.1, 16.5_

  - [x] 4.3 Implement SalesOrderService
    - Create `src/main/services/sales-order-service.ts`
    - Implement `list(companyId, filters)` with pagination, customerId/status/paymentStatus filters, search by orderNumber
    - Implement `detail(companyId, id)` returning order with items (joined with product), payments, totalPaid, remainingBalance
    - Implement `create(companyId, input)` — validate products, compute totals, generate orderNumber
    - Implement `update(companyId, id, input)` — guard draft-only editable, recompute totals
    - Implement `transitionStatus(companyId, id, targetStatus)` — validate transition, set lifecycle timestamps (confirmedAt, fulfilledAt, cancelledAt), audit log
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5, 11.1, 11.3, 11.4, 13.2, 16.2_

  - [x] 4.4 Write property tests for quote and sales order logic
    - **Property 1: Line total determinism** — generate random quantity/unitPrice/discountAmount, verify computation
    - **Property 2: Document total equals sum of line totals** — generate random item arrays, verify document total
    - **Property 3: Quote status transition validity** — generate random status pairs, verify acceptance/rejection
    - **Property 4: Sales order status transition validity** — generate random status pairs, verify acceptance/rejection
    - **Property 6: Quote-to-order conversion preserves items** — generate quote item sets, convert, verify fields preserved
    - **Property 7: Quote-to-order conversion atomicity** — simulate failures, verify clean rollback
    - **Property 16: Editable only in draft/allowed status** — generate documents in various statuses, verify guards
    - **Validates: Requirements 3.3, 3.4, 3.6, 4.1, 4.2, 5.1, 5.3, 5.5, 5.6, 6.3, 6.4, 6.6, 7.1, 7.2, 11.1, 11.3**

- [x] 5. Purchase Order and Payment services
  - [x] 5.1 Implement PurchaseOrderService
    - Create `src/main/services/purchase-order-service.ts`
    - Implement `list(companyId, filters)` with pagination, supplierId/status/paymentStatus filters, search by orderNumber
    - Implement `detail(companyId, id)` returning PO with items (include receivedQuantity, product name/SKU), payments, totalPaid, remainingBalance
    - Implement `create(companyId, input)` — validate products, compute totals using purchase line formula, generate orderNumber
    - Implement `update(companyId, id, input)` — guard draft-only editable, recompute totals
    - Implement `transitionStatus(companyId, id, targetStatus)` — validate transition, set cancelledAt, audit log
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 11.2, 11.3, 11.4, 13.3, 16.3_

  - [x] 5.2 Implement purchase order receipt recording
    - Add `recordReceipt(companyId, id, input)` to PurchaseOrderService
    - Validate PO is in "sent" or "partially_received" status
    - For each receipt item: validate PO item exists, check received + new doesn't exceed ordered, update receivedQuantity
    - Generate inbound stock movements via existing StockService (referenceType: 'purchase_order', referenceId: PO id)
    - Auto-transition status: "received" if all items fully received, "partially_received" if some received
    - Execute within a single database transaction, rollback on any failure
    - Record audit log entry
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 15.2, 16.3_

  - [x] 5.3 Implement PaymentService
    - Create `src/main/services/payment-service.ts`
    - Implement `listForSalesOrder(companyId, orderId)` — return payments, documentTotal, totalPaid, remainingBalance, paymentStatus
    - Implement `listForPurchaseOrder(companyId, purchaseOrderId)` — same shape
    - Implement `registerForSalesOrder(companyId, orderId, input)` — validate order status (confirmed/partially_fulfilled/fulfilled), reject zero/negative amount, reject if exceeds remaining, create Payment_Record, recalculate paymentStatus, audit log
    - Implement `registerForPurchaseOrder(companyId, purchaseOrderId, input)` — validate PO status (sent/partially_received/received), same validations
    - Execute payment creation and status recalculation within a single transaction
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 15.3, 16.4_

  - [x] 5.4 Write property tests for purchase order and payment logic
    - **Property 5: Purchase order status transition validity** — generate random status pairs, verify acceptance/rejection
    - **Property 8: Receipt does not exceed ordered quantity** — generate receipt sequences, verify no over-receipt
    - **Property 9: Receipt generates matching stock movements** — generate receipts, verify exact K movements created
    - **Property 10: Receipt status auto-transition** — generate PO items and receipt sequences, verify status
    - **Property 11: Payment cannot exceed document total** — generate payment sequences, verify no overpayment
    - **Property 12: Payment status derivation** — generate payment sequences, verify unpaid/partially_paid/paid
    - **Validates: Requirements 8.6, 8.7, 9.1, 9.2, 9.3, 9.4, 9.5, 10.4, 10.6**

- [x] 6. Checkpoint - Ensure all service layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. API route modules
  - [x] 7.1 Implement customers API routes
    - Create `src/main/routes/customers.ts` (or extend existing route registration)
    - Register GET `/api/customers` (list with search, pagination), POST `/api/customers` (create)
    - Register GET `/api/customers/:id` (detail), PUT `/api/customers/:id` (update), DELETE `/api/customers/:id` (delete)
    - Validate request bodies, extract companyId from context/header
    - Return structured ApiErrorResponse on failures
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 13.1_

  - [x] 7.2 Implement suppliers API routes
    - Create `src/main/routes/suppliers.ts`
    - Register GET `/api/suppliers` (list with search, pagination), POST `/api/suppliers` (create)
    - Register GET `/api/suppliers/:id` (detail), PUT `/api/suppliers/:id` (update), DELETE `/api/suppliers/:id` (delete)
    - Same validation and error handling pattern as customers
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 13.1_

  - [x] 7.3 Implement quotes API routes
    - Create `src/main/routes/quotes.ts`
    - Register GET `/api/quotes` (list with filters), POST `/api/quotes` (create with items)
    - Register GET `/api/quotes/:id` (detail with items), PUT `/api/quotes/:id` (update)
    - Register PATCH `/api/quotes/:id/status` (transition), POST `/api/quotes/:id/convert` (convert to order)
    - Validate item arrays, status transitions, conversion prerequisites
    - _Requirements: 3.1–3.8, 4.1–4.4, 5.1–5.6, 13.2_

  - [x] 7.4 Implement sales orders API routes
    - Create `src/main/routes/sales-orders.ts`
    - Register GET `/api/sales-orders` (list with filters), POST `/api/sales-orders` (create with items)
    - Register GET `/api/sales-orders/:id` (detail with items + payments), PUT `/api/sales-orders/:id` (update)
    - Register PATCH `/api/sales-orders/:id/status` (transition)
    - Register GET `/api/sales-orders/:id/payments` (list payments), POST `/api/sales-orders/:id/payments` (register payment)
    - _Requirements: 6.1–6.6, 7.1–7.5, 10.1, 10.3–10.7, 13.2_

  - [x] 7.5 Implement purchase orders API routes
    - Create `src/main/routes/purchase-orders.ts`
    - Register GET `/api/purchase-orders` (list with filters), POST `/api/purchase-orders` (create with items)
    - Register GET `/api/purchase-orders/:id` (detail with items + payments), PUT `/api/purchase-orders/:id` (update)
    - Register PATCH `/api/purchase-orders/:id/status` (transition), POST `/api/purchase-orders/:id/receive` (receipt)
    - Register GET `/api/purchase-orders/:id/payments` (list payments), POST `/api/purchase-orders/:id/payments` (register payment)
    - _Requirements: 8.1–8.7, 9.1–9.7, 10.2–10.7, 13.3_

  - [x] 7.6 Write integration tests for API routes
    - Test full quote lifecycle: create → items → send → accept → convert → verify order
    - Test full purchase lifecycle: create PO → send → partial receipt → full receipt → verify stock
    - Test payment flow: create order → confirm → partial payment → verify remaining → full payment → verify paid
    - Test deletion guards: delete customer with orders, supplier with POs
    - Test company isolation: create in A, query from B
    - Test pagination correctness
    - _Requirements: 1.6, 2.6, 5.1–5.6, 9.1–9.7, 10.1–10.7, 12.1–12.4_

- [x] 8. Checkpoint - Ensure all API routes respond correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Renderer shared components
  - [x] 9.1 Implement DocumentItemsEditor component
    - Create `src/renderer/src/shared/ui/document-items-editor.tsx`
    - Multi-item line editor: add, edit, remove item rows
    - Live line total calculation per row and document total at bottom
    - Product selection (combobox/select referencing products)
    - Input validation for quantity > 0, unitPrice/unitCost > 0, discountAmount >= 0
    - Support up to 200 item lines with responsive performance (memoization)
    - _Requirements: 14.3, 14.4, 14.13_

  - [x] 9.2 Implement StatusBadge and StatusTransitionActions components
    - Create `src/renderer/src/shared/ui/status-badge.tsx` — colored badge by status value
    - Create `src/renderer/src/shared/ui/status-transition-actions.tsx` — contextual action buttons showing only valid transitions
    - Accept status type (quote/salesOrder/purchaseOrder) and current status to compute valid actions
    - Include confirmation dialog on destructive transitions (cancel)
    - _Requirements: 14.7_

  - [x] 9.3 Implement PaymentForm and PaymentHistory components
    - Create `src/renderer/src/shared/ui/payment-form.tsx` — amount, payment method, date, reference fields
    - Validate amount > 0 and amount <= remainingBalance
    - Create `src/renderer/src/shared/ui/payment-history.tsx` — list of payments with running balance display
    - _Requirements: 14.10_

  - [x] 9.4 Implement ReceiptForm component
    - Create `src/renderer/src/shared/ui/receipt-form.tsx`
    - Item receipt quantity entry per PO item with validation against remaining expected (ordered - received)
    - Warehouse selection per item
    - Submit button disabled when no quantities entered
    - _Requirements: 14.9_

- [x] 10. Renderer query hooks
  - [x] 10.1 Implement customer and supplier query hooks
    - Create `src/renderer/src/shared/hooks/use-customers.ts`
    - Implement `useCustomers`, `useCustomerDetail`, `useCreateCustomer`, `useUpdateCustomer`, `useDeleteCustomer`
    - Create `src/renderer/src/shared/hooks/use-suppliers.ts`
    - Implement `useSuppliers`, `useSupplierDetail`, `useCreateSupplier`, `useUpdateSupplier`, `useDeleteSupplier`
    - Use query keys: `['customers', 'list', filters]`, `['customers', 'detail', id]`, etc.
    - Invalidate list on create/update/delete success
    - _Requirements: 14.1, 14.2, 14.5, 14.6_

  - [x] 10.2 Implement quote query hooks
    - Create `src/renderer/src/shared/hooks/use-quotes.ts`
    - Implement `useQuotes`, `useQuoteDetail`, `useCreateQuote`, `useUpdateQuote`, `useTransitionQuoteStatus`, `useConvertQuoteToOrder`
    - Invalidate quote list and detail on mutations; invalidate sales orders on conversion
    - _Requirements: 14.3, 14.5, 14.7, 14.8_

  - [x] 10.3 Implement sales order query hooks
    - Create `src/renderer/src/shared/hooks/use-sales-orders.ts`
    - Implement `useSalesOrders`, `useSalesOrderDetail`, `useCreateSalesOrder`, `useUpdateSalesOrder`, `useTransitionSalesOrderStatus`
    - Create `src/renderer/src/shared/hooks/use-payments.ts`
    - Implement `useSalesOrderPayments`, `useRegisterSalesOrderPayment`, `usePurchaseOrderPayments`, `useRegisterPurchaseOrderPayment`
    - _Requirements: 14.3, 14.5, 14.7, 14.10_

  - [x] 10.4 Implement purchase order query hooks
    - Create `src/renderer/src/shared/hooks/use-purchase-orders.ts`
    - Implement `usePurchaseOrders`, `usePurchaseOrderDetail`, `useCreatePurchaseOrder`, `useUpdatePurchaseOrder`, `useTransitionPurchaseOrderStatus`, `useRecordReceipt`
    - Invalidate PO detail and stock queries on receipt success
    - _Requirements: 14.3, 14.5, 14.7, 14.9_

- [x] 11. Renderer pages — Customer and Supplier
  - [x] 11.1 Implement CustomersPage
    - Create `src/renderer/src/pages/customers/ui/customers-page.tsx`
    - Paginated list with search, loading/empty/error states
    - Create/edit customer modal/drawer with inline validation
    - Delete action with confirmation (show dependency warning if referenced)
    - Pagination controls
    - _Requirements: 14.1, 14.2, 14.5, 14.6, 14.11, 14.12_

  - [x] 11.2 Implement CustomerDetailPage
    - Create `src/renderer/src/pages/customers/ui/customer-detail-page.tsx`
    - Customer info display with edit action
    - Summary counts of quotes and sales orders
    - Quick links to related documents
    - _Requirements: 1.5, 14.1_

  - [x] 11.3 Implement SuppliersPage
    - Create `src/renderer/src/pages/suppliers/ui/suppliers-page.tsx`
    - Same pattern as CustomersPage: paginated list, search, CRUD modals, delete guard
    - _Requirements: 14.1, 14.2, 14.5, 14.6, 14.11, 14.12_

  - [x] 11.4 Implement SupplierDetailPage
    - Create `src/renderer/src/pages/suppliers/ui/supplier-detail-page.tsx`
    - Supplier info display with edit action
    - Summary count of purchase orders
    - _Requirements: 2.5, 14.1_

- [x] 12. Renderer pages — Quotes and Sales Orders
  - [x] 12.1 Implement QuotesPage
    - Create `src/renderer/src/pages/quotes/ui/quotes-page.tsx`
    - Paginated quote list with status filter, customer filter, search by quoteNumber
    - Status badges, total amount display, creation date
    - New quote action
    - _Requirements: 14.1, 14.11, 14.12_

  - [x] 12.2 Implement QuoteDetailPage
    - Create `src/renderer/src/pages/quotes/ui/quote-detail-page.tsx`
    - Document editor using DocumentItemsEditor for quote items
    - Live total calculation display
    - Status badge and StatusTransitionActions (only valid transitions)
    - Convert-to-order button on accepted quotes with confirmation step
    - Edit guard: disable editing if quote not in draft/sent
    - _Requirements: 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

  - [x] 12.3 Implement SalesOrdersPage
    - Create `src/renderer/src/pages/sales-orders/ui/sales-orders-page.tsx`
    - Paginated list with status, payment status, customer filters, search by orderNumber
    - Status badges, payment status indicators
    - _Requirements: 14.1, 14.11, 14.12_

  - [x] 12.4 Implement SalesOrderDetailPage
    - Create `src/renderer/src/pages/sales-orders/ui/sales-order-detail-page.tsx`
    - Document editor using DocumentItemsEditor (editable only in draft)
    - Status badge and StatusTransitionActions
    - PaymentHistory and PaymentForm (visible on confirmed/partially_fulfilled/fulfilled)
    - _Requirements: 14.3, 14.4, 14.5, 14.6, 14.7, 14.10_

- [x] 13. Renderer pages — Purchase Orders
  - [x] 13.1 Implement PurchaseOrdersPage
    - Create `src/renderer/src/pages/purchase-orders/ui/purchase-orders-page.tsx`
    - Paginated list with status, payment status, supplier filters, search by orderNumber
    - Expected delivery date display
    - _Requirements: 14.1, 14.11, 14.12_

  - [x] 13.2 Implement PurchaseOrderDetailPage
    - Create `src/renderer/src/pages/purchase-orders/ui/purchase-order-detail-page.tsx`
    - Document editor using DocumentItemsEditor (editable only in draft)
    - Status badge and StatusTransitionActions
    - ReceiptForm (visible on sent/partially_received status)
    - PaymentHistory and PaymentForm (visible on eligible statuses)
    - Display received vs ordered quantities per item
    - _Requirements: 14.3, 14.4, 14.5, 14.6, 14.7, 14.9, 14.10_

- [x] 14. Router integration and navigation
  - [x] 14.1 Register commercial routes in TanStack Router
    - Add routes for `/customers`, `/customers/:id`, `/suppliers`, `/suppliers/:id`
    - Add routes for `/quotes`, `/quotes/:id`, `/sales-orders`, `/sales-orders/:id`
    - Add routes for `/purchase-orders`, `/purchase-orders/:id`
    - Add navigation items to the app shell sidebar
    - _Requirements: 14.1_

- [x] 15. Checkpoint - Ensure full UI renders and navigates correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Audit logging integration
  - [x] 16.1 Ensure audit log entries for all commercial status transitions and operations
    - Verify QuoteService logs status changes, conversions
    - Verify SalesOrderService logs status changes
    - Verify PurchaseOrderService logs status changes and receipts
    - Verify PaymentService logs payment creation with order reference
    - All entries include entity_type, entity_id, action, companyId, and relevant details
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [x] 17. Final checkpoint - Ensure all tests pass and typecheck succeeds
  - Run `pnpm typecheck` to verify both compilation targets pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in the design document
- Unit tests validate specific examples and edge cases
- The schema already contains most required tables — only minor additions are needed (receivedQuantity, purchaseOrderPayments, lifecycle timestamps)
- The design uses absolute `discountAmount` (not percentage) — line total formula is `(qty × unitPrice) - discountAmount`
- Shared components (DocumentItemsEditor, StatusBadge, etc.) are created before pages to enable reuse
- Query hooks are created before pages so pages can consume them directly
- The existing StockService from Phase 1 is called within purchase receipt transactions — no new stock logic needed

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["3.1", "3.2"] },
    { "id": 2, "tasks": ["3.3", "4.1", "5.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "5.2", "5.3"] },
    { "id": 4, "tasks": ["4.4", "5.4"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5"] },
    { "id": 6, "tasks": ["7.6", "9.1", "9.2", "9.3", "9.4"] },
    { "id": 7, "tasks": ["10.1", "10.2", "10.3", "10.4"] },
    { "id": 8, "tasks": ["11.1", "11.3", "12.1", "13.1"] },
    { "id": 9, "tasks": ["11.2", "11.4", "12.2", "12.3", "13.2"] },
    { "id": 10, "tasks": ["12.4", "14.1"] },
    { "id": 11, "tasks": ["16.1"] }
  ]
}
```
