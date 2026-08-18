# Requirements Document

## Introduction

Phase 2 expands the Stockando Desktop application into commercial operations. It delivers end-to-end sales workflows (customer management, quote creation, quote-to-order conversion, and sales order tracking) and purchasing workflows (supplier management, purchase order creation, partial receipt tracking, and payment status). The module integrates tightly with Phase 1's inventory system to maintain stock consistency when commercial transactions generate inbound or outbound movements. All operations remain company-scoped, transactionally consistent, and responsive for multi-item documents.

## Glossary

- **Commercial_API**: The Fastify HTTP API layer in the Electron main process responsible for handling sales and purchasing requests from the renderer.
- **Customer**: A business entity that purchases goods. Contains name, contact information, and tax identifier. Scoped to a company.
- **Supplier**: A business entity that provides goods. Contains name, contact information, and tax identifier. Scoped to a company.
- **Quote**: A commercial document representing a price proposal to a Customer, containing one or more Quote_Items with quantities, unit prices, and discounts. Has a lifecycle status (draft, sent, accepted, rejected, converted, cancelled).
- **Quote_Item**: A line item within a Quote, referencing a Product with quantity, unit price, discount percentage, and computed line total.
- **Sales_Order**: A confirmed commercial document representing an agreement to deliver goods to a Customer, containing one or more Order_Items. Created independently or converted from a Quote. Has a lifecycle status (draft, confirmed, partially_fulfilled, fulfilled, cancelled).
- **Order_Item**: A line item within a Sales_Order, referencing a Product with quantity, unit price, discount percentage, and computed line total.
- **Purchase_Order**: A procurement document sent to a Supplier to request goods, containing one or more Purchase_Order_Items. Has a lifecycle status (draft, sent, partially_received, received, cancelled).
- **Purchase_Order_Item**: A line item within a Purchase_Order, referencing a Product with ordered quantity, received quantity, unit cost, and computed line total.
- **Payment_Record**: A financial record associated with a Sales_Order or Purchase_Order, tracking the amount paid, payment date, payment method, and reference. Multiple payments can exist per order for partial settlement.
- **Status_Transition**: A valid change in a document's lifecycle status, governed by business rules that prevent invalid progressions.
- **Line_Total**: The computed value for an item line, calculated as (quantity × unit_price) × (1 - discount_percentage / 100).
- **Document_Total**: The sum of all Line_Totals within a document (quote, sales order, or purchase order).
- **Partial_Receipt**: The recording of a subset of items from a Purchase_Order, updating the received quantity on each Purchase_Order_Item and generating corresponding inbound stock movements.
- **Company_Scope**: The isolation boundary ensuring all commercial data is filtered by the active company identifier.

## Requirements

### Requirement 1: Customer Management

**User Story:** As a sales operator, I want to register and manage customers, so that I can associate commercial documents with the correct buyer.

#### Acceptance Criteria

1. WHEN a valid customer creation request is received, THE Commercial_API SHALL create the Customer record with name, optional contact information (email, phone, address), and optional tax identifier, scoped to the active company.
2. WHEN a customer creation request contains a tax identifier that already exists for the same company, THE Commercial_API SHALL reject the request with a conflict error and leave the database unchanged.
3. WHEN a customer update request is received with valid data, THE Commercial_API SHALL update the Customer record and set the updatedAt timestamp to the current time.
4. WHEN a customer list request is received, THE Commercial_API SHALL return a paginated list of customers for the active company, supporting search by name or tax identifier.
5. WHEN a customer detail request is received, THE Commercial_API SHALL return the full customer record including summary counts of associated quotes and sales orders.
6. IF a customer is referenced by quotes or sales orders, THEN THE Commercial_API SHALL prevent deletion and return a validation error indicating the dependent documents.

### Requirement 2: Supplier Management

**User Story:** As a procurement operator, I want to register and manage suppliers, so that I can associate purchase orders with the correct vendor.

#### Acceptance Criteria

1. WHEN a valid supplier creation request is received, THE Commercial_API SHALL create the Supplier record with name, optional contact information (email, phone, address), and optional tax identifier, scoped to the active company.
2. WHEN a supplier creation request contains a tax identifier that already exists for the same company, THE Commercial_API SHALL reject the request with a conflict error and leave the database unchanged.
3. WHEN a supplier update request is received with valid data, THE Commercial_API SHALL update the Supplier record and set the updatedAt timestamp to the current time.
4. WHEN a supplier list request is received, THE Commercial_API SHALL return a paginated list of suppliers for the active company, supporting search by name or tax identifier.
5. WHEN a supplier detail request is received, THE Commercial_API SHALL return the full supplier record including summary counts of associated purchase orders.
6. IF a supplier is referenced by purchase orders, THEN THE Commercial_API SHALL prevent deletion and return a validation error indicating the dependent documents.

### Requirement 3: Quote Creation and Management

**User Story:** As a sales operator, I want to create and edit quotes with product lines, so that I can prepare price proposals for customers.

#### Acceptance Criteria

1. WHEN a valid quote creation request is received, THE Commercial_API SHALL create the Quote record with a reference to the Customer, initial status "draft", and zero or more Quote_Items, scoped to the active company.
2. WHEN a Quote_Item is added to a quote, THE Commercial_API SHALL validate that the referenced Product exists and belongs to the active company, and store the quantity, unit price, and discount percentage.
3. THE Commercial_API SHALL compute each Quote_Item Line_Total as (quantity × unit_price) × (1 - discount_percentage / 100) and persist it on the item record.
4. THE Commercial_API SHALL compute and persist the Document_Total as the sum of all Quote_Item Line_Totals whenever items are added, updated, or removed.
5. WHEN a quote update request is received for a quote in "draft" or "sent" status, THE Commercial_API SHALL apply the changes and update the Document_Total and updatedAt timestamp.
6. IF a quote update request is received for a quote in "accepted", "rejected", "converted", or "cancelled" status, THEN THE Commercial_API SHALL reject the update with a validation error indicating the quote is no longer editable.
7. WHEN a quote item quantity or unit price is zero or negative, THE Commercial_API SHALL reject the request with a validation error.
8. WHEN a quote item discount percentage is less than 0 or greater than 100, THE Commercial_API SHALL reject the request with a validation error.

### Requirement 4: Quote Status Transitions

**User Story:** As a sales operator, I want to track quote lifecycle through defined statuses, so that I can manage the proposal pipeline clearly.

#### Acceptance Criteria

1. WHEN a quote status transition is requested, THE Commercial_API SHALL validate that the transition is permitted according to the following rules: draft → sent, draft → cancelled, sent → accepted, sent → rejected, sent → cancelled, accepted → converted.
2. IF an invalid status transition is requested, THEN THE Commercial_API SHALL reject the request with a validation error indicating the current status and allowed transitions.
3. WHEN a quote transitions to "cancelled" status, THE Commercial_API SHALL set the cancellation timestamp and preserve all existing item data without modification.
4. WHEN a quote transitions to "converted" status, THE Commercial_API SHALL verify that a corresponding Sales_Order has been created from the quote before marking the transition complete.

### Requirement 5: Quote-to-Order Conversion

**User Story:** As a sales operator, I want to convert an accepted quote into a sales order, so that I can proceed with order fulfillment without re-entering data.

#### Acceptance Criteria

1. WHEN a quote-to-order conversion is requested for a quote in "accepted" status, THE Commercial_API SHALL create a new Sales_Order with all Quote_Items copied as Order_Items, preserving quantities, unit prices, discount percentages, and Line_Totals.
2. WHEN a quote-to-order conversion completes, THE Commercial_API SHALL set the quote status to "converted" and store a reference to the created Sales_Order on the Quote record.
3. WHEN a quote-to-order conversion completes, THE Commercial_API SHALL set the created Sales_Order status to "draft" with the same Customer reference and computed Document_Total.
4. IF a quote-to-order conversion is requested for a quote not in "accepted" status, THEN THE Commercial_API SHALL reject the conversion with a validation error.
5. THE Commercial_API SHALL execute the quote-to-order conversion (quote status update, sales order creation, item copying) within a single database transaction.
6. IF any step within the conversion transaction fails, THEN THE Commercial_API SHALL roll back the entire transaction and leave both the quote and database in their pre-operation state.

### Requirement 6: Sales Order Management

**User Story:** As a sales operator, I want to manage sales orders with product lines and status tracking, so that I can fulfill customer requests and track delivery progress.

#### Acceptance Criteria

1. WHEN a valid sales order creation request is received, THE Commercial_API SHALL create the Sales_Order record with a reference to the Customer, initial status "draft", and zero or more Order_Items, scoped to the active company.
2. WHEN an Order_Item is added to a sales order, THE Commercial_API SHALL validate that the referenced Product exists and belongs to the active company, and store the quantity, unit price, and discount percentage.
3. THE Commercial_API SHALL compute each Order_Item Line_Total as (quantity × unit_price) × (1 - discount_percentage / 100) and persist it on the item record.
4. THE Commercial_API SHALL compute and persist the Sales_Order Document_Total as the sum of all Order_Item Line_Totals whenever items are added, updated, or removed.
5. WHEN a sales order update request is received for an order in "draft" status, THE Commercial_API SHALL apply the changes and update the Document_Total and updatedAt timestamp.
6. IF a sales order update request is received for an order not in "draft" status, THEN THE Commercial_API SHALL reject the update with a validation error indicating the order is no longer editable.

### Requirement 7: Sales Order Status Transitions

**User Story:** As a sales operator, I want to progress sales orders through their lifecycle, so that I can track fulfillment status clearly.

#### Acceptance Criteria

1. WHEN a sales order status transition is requested, THE Commercial_API SHALL validate that the transition is permitted according to the following rules: draft → confirmed, draft → cancelled, confirmed → partially_fulfilled, confirmed → fulfilled, confirmed → cancelled, partially_fulfilled → fulfilled.
2. IF an invalid status transition is requested, THEN THE Commercial_API SHALL reject the request with a validation error indicating the current status and allowed transitions.
3. WHEN a sales order transitions to "confirmed" status, THE Commercial_API SHALL set the confirmation timestamp.
4. WHEN a sales order transitions to "cancelled" status, THE Commercial_API SHALL set the cancellation timestamp and preserve all existing item and payment data without modification.
5. WHEN a sales order transitions to "fulfilled" status, THE Commercial_API SHALL set the fulfillment timestamp.

### Requirement 8: Purchase Order Management

**User Story:** As a procurement operator, I want to create and manage purchase orders, so that I can request goods from suppliers and track incoming inventory.

#### Acceptance Criteria

1. WHEN a valid purchase order creation request is received, THE Commercial_API SHALL create the Purchase_Order record with a reference to the Supplier, initial status "draft", expected delivery date, and zero or more Purchase_Order_Items, scoped to the active company.
2. WHEN a Purchase_Order_Item is added, THE Commercial_API SHALL validate that the referenced Product exists and belongs to the active company, and store the ordered quantity, unit cost, and compute the Line_Total as (ordered_quantity × unit_cost).
3. THE Commercial_API SHALL compute and persist the Purchase_Order Document_Total as the sum of all Purchase_Order_Item Line_Totals whenever items are added, updated, or removed.
4. WHEN a purchase order update request is received for an order in "draft" status, THE Commercial_API SHALL apply the changes and update the Document_Total and updatedAt timestamp.
5. IF a purchase order update request is received for an order not in "draft" status, THEN THE Commercial_API SHALL reject the update with a validation error indicating the order is no longer editable.
6. WHEN a purchase order status transition is requested, THE Commercial_API SHALL validate that the transition is permitted according to the following rules: draft → sent, draft → cancelled, sent → partially_received, sent → received, sent → cancelled, partially_received → received.
7. IF an invalid purchase order status transition is requested, THEN THE Commercial_API SHALL reject the request with a validation error indicating the current status and allowed transitions.

### Requirement 9: Purchase Order Receipt and Inventory Integration

**User Story:** As a procurement operator, I want to record partial or full receipts against purchase orders, so that received goods are reflected in inventory and purchase status.

#### Acceptance Criteria

1. WHEN a receipt is recorded for a purchase order in "sent" or "partially_received" status, THE Commercial_API SHALL update the received_quantity on each specified Purchase_Order_Item by adding the received amounts.
2. WHEN a receipt is recorded, THE Commercial_API SHALL generate inbound stock movements for each received item, linking the movement to the purchase order as a reference.
3. WHEN a receipt causes all Purchase_Order_Items to have received_quantity equal to ordered_quantity, THE Commercial_API SHALL automatically transition the purchase order status to "received".
4. WHEN a receipt causes at least one Purchase_Order_Item to have received_quantity greater than zero but not all items are fully received, THE Commercial_API SHALL transition the purchase order status to "partially_received".
5. IF a receipt would cause any Purchase_Order_Item received_quantity to exceed ordered_quantity, THEN THE Commercial_API SHALL reject the receipt with a validation error.
6. THE Commercial_API SHALL execute the receipt recording (item updates, stock movements, status transition) within a single database transaction.
7. IF any step within the receipt transaction fails, THEN THE Commercial_API SHALL roll back the entire transaction and leave the purchase order and stock in their pre-operation state.

### Requirement 10: Payment Registration

**User Story:** As a financial operator, I want to register payments against sales orders and purchase orders, so that I can track settlement progress without introducing inconsistent balances.

#### Acceptance Criteria

1. WHEN a valid payment is registered for a sales order in "confirmed", "partially_fulfilled", or "fulfilled" status, THE Commercial_API SHALL create a Payment_Record with amount, payment date, payment method, and optional reference.
2. WHEN a valid payment is registered for a purchase order in "sent", "partially_received", or "received" status, THE Commercial_API SHALL create a Payment_Record with amount, payment date, payment method, and optional reference.
3. THE Commercial_API SHALL compute the total paid amount for an order as the sum of all associated Payment_Record amounts.
4. IF a payment would cause the total paid amount to exceed the Document_Total of the associated order, THEN THE Commercial_API SHALL reject the payment with a validation error.
5. WHEN a payment list is requested for an order, THE Commercial_API SHALL return all Payment_Records for that order with computed remaining balance (Document_Total minus total paid).
6. THE Commercial_API SHALL track payment status on the order level as "unpaid" (zero payments), "partially_paid" (total paid less than Document_Total), or "paid" (total paid equals Document_Total).
7. WHEN a payment is registered with a zero or negative amount, THE Commercial_API SHALL reject the request with a validation error.

### Requirement 11: Document Total Calculation Integrity

**User Story:** As a system operator, I want document totals and line calculations to be deterministic and consistent, so that financial references remain reliable.

#### Acceptance Criteria

1. THE Commercial_API SHALL compute Line_Total using the formula (quantity × unit_price) × (1 - discount_percentage / 100) for all Quote_Items and Order_Items.
2. THE Commercial_API SHALL compute Line_Total using the formula (ordered_quantity × unit_cost) for all Purchase_Order_Items.
3. THE Commercial_API SHALL recompute and persist the Document_Total on every item addition, item update, or item removal operation.
4. THE Commercial_API SHALL store computed totals with a precision of two decimal places, rounding half-up.
5. WHEN a document is retrieved, THE Commercial_API SHALL return both the persisted Document_Total and the individual Line_Totals.

### Requirement 12: Company Data Isolation

**User Story:** As a business owner with multiple companies, I want commercial data to be strictly isolated per company, so that no customer, supplier, or order data leaks between companies.

#### Acceptance Criteria

1. THE Commercial_API SHALL include the active company identifier in all commercial queries as a mandatory filter.
2. FOR ALL commercial endpoints, THE Commercial_API SHALL verify that referenced entities (customers, suppliers, products, quotes, orders) belong to the active company before performing operations.
3. WHEN a request references an entity that does not belong to the active company, THE Commercial_API SHALL return a not-found error without revealing the existence of the entity in another company.
4. THE Commercial_API SHALL enforce company scoping at the database query level for all read and write operations.

### Requirement 13: Commercial List Performance

**User Story:** As a daily user, I want commercial lists and document views to load responsively, so that I can work efficiently with many orders and quotes.

#### Acceptance Criteria

1. WHEN a paginated customer or supplier list request is received, THE Commercial_API SHALL use indexed queries and return results within 200ms for up to 5,000 records.
2. WHEN a paginated quote or sales order list request is received, THE Commercial_API SHALL use indexed queries and return results within 200ms for up to 10,000 documents.
3. WHEN a paginated purchase order list request is received, THE Commercial_API SHALL use indexed queries and return results within 200ms for up to 10,000 documents.
4. WHEN a document detail request includes items and payments, THE Commercial_API SHALL return the complete document with all line items and payment records within 200ms for documents with up to 200 line items.
5. THE Commercial_API SHALL support limit and offset pagination parameters on all list endpoints.

### Requirement 14: Commercial UI Screens

**User Story:** As a daily user, I want clear, responsive screens for managing customers, suppliers, quotes, sales orders, and purchase orders, so that I can perform commercial operations efficiently.

#### Acceptance Criteria

1. THE Renderer SHALL provide list screens for customers, suppliers, quotes, sales orders, and purchase orders with loading, empty, error, and populated states.
2. THE Renderer SHALL provide creation and editing forms for customers and suppliers with inline field validation and clear error feedback.
3. THE Renderer SHALL provide document editors for quotes, sales orders, and purchase orders with item line management (add, edit, remove items), live total calculation display, and status indicators.
4. WHEN an item line is added or modified in a document editor, THE Renderer SHALL update the displayed Line_Total and Document_Total immediately without requiring a server round-trip.
5. WHEN a form submission succeeds, THE Renderer SHALL display a success notification and invalidate the related query cache to refresh the list view.
6. WHEN a form submission fails with validation errors, THE Renderer SHALL display field-level error messages without losing the user's input.
7. THE Renderer SHALL provide status transition actions as contextual controls on document detail views, displaying only valid transitions for the current status.
8. THE Renderer SHALL provide a quote-to-order conversion action on accepted quotes with a confirmation step before execution.
9. THE Renderer SHALL provide a receipt recording interface on purchase orders in "sent" or "partially_received" status, allowing quantity entry per item with validation against remaining expected quantities.
10. THE Renderer SHALL provide a payment registration form on eligible orders with amount validation against remaining balance.
11. WHEN a document list exceeds one page, THE Renderer SHALL display pagination controls and allow navigation between pages without full page reload.
12. THE Renderer SHALL provide search and filter controls on commercial lists that update results without full page reload.
13. THE Renderer SHALL keep form interactions responsive while editing documents with up to 200 item lines.

### Requirement 15: Transactional Consistency for Commercial Operations

**User Story:** As a system administrator, I want commercial operations to be transactionally consistent, so that partial failures never leave documents, inventory, or payments in an inconsistent state.

#### Acceptance Criteria

1. WHEN a quote-to-order conversion is executed, THE Commercial_API SHALL execute the entire operation (quote update, order creation, item copying) within a single database transaction.
2. WHEN a purchase order receipt is recorded, THE Commercial_API SHALL execute the entire operation (item quantity updates, stock movement creation, status transition) within a single database transaction.
3. WHEN a payment is registered, THE Commercial_API SHALL execute the payment creation and payment status recalculation within a single database transaction.
4. IF any step within a commercial transaction fails, THEN THE Commercial_API SHALL roll back the entire transaction and return an error, leaving the database in its pre-operation state.

### Requirement 16: Audit Traceability for Commercial Operations

**User Story:** As a compliance officer, I want commercial document changes to be auditable, so that I can trace status transitions, conversions, and payment events.

#### Acceptance Criteria

1. WHEN a quote status transition occurs, THE Commercial_API SHALL record an entry in the audit_logs table with entity_type "quote", the quote id, the action (e.g., "status_change:draft→sent"), and the active company identifier.
2. WHEN a sales order status transition occurs, THE Commercial_API SHALL record an entry in the audit_logs table with entity_type "sales_order", the order id, and the action.
3. WHEN a purchase order status transition or receipt is recorded, THE Commercial_API SHALL record an entry in the audit_logs table with entity_type "purchase_order", the order id, and the action.
4. WHEN a payment is registered, THE Commercial_API SHALL record an entry in the audit_logs table with entity_type "payment", the payment id, the action "create", and a reference to the associated order.
5. WHEN a quote-to-order conversion completes, THE Commercial_API SHALL record an entry in the audit_logs table with entity_type "quote", the quote id, the action "converted", and the resulting sales order id in the details field.
