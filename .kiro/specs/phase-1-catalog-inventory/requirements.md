# Requirements Document

## Introduction

Phase 1 delivers the first operational module for daily business use in the Stockando Desktop application. It covers the complete product catalog (categories, units of measure, and products), warehouse and stock location management, stock movement tracking, inventory adjustments with audit traceability, and stock reconciliation workflows. The module supports both retail and distribution inventory patterns, maintains stock balances derived from movement history, and ensures all operations remain responsive and company-scoped.

## Glossary

- **Catalog_API**: The Fastify HTTP API layer in the Electron main process responsible for handling catalog and inventory requests from the renderer.
- **Category**: A hierarchical classification for products, scoped to a company. Categories may have a parent category forming a tree structure.
- **Unit_of_Measure**: A measurement unit (e.g., kg, unit, liter) with a name and symbol, used to quantify products.
- **Product**: A catalog item with SKU, name, description, barcode, pricing, category, unit reference, and inventory tracking flag. Scoped to a company.
- **Warehouse**: A named storage facility with a unique code per company. Contains stock records for products.
- **Stock_Record**: A materialized balance tracking the current quantity and reserved quantity of a product at a specific warehouse.
- **Stock_Movement**: An immutable record of a quantity change (inbound, outbound, transfer, adjustment) for a product at a warehouse, with movement type, reference, and timestamp.
- **Stock_Adjustment**: A correction entry with a reason, notes, and responsible user, used to reconcile physical inventory with system records.
- **Movement_Type**: A discriminant identifying the nature of a stock movement. Valid values include inbound, outbound, transfer_in, transfer_out, and adjustment.
- **Adjustment_Type**: A discriminant identifying the nature of a stock adjustment. Valid values include increase, decrease, and correction.
- **Reconciliation**: The process of comparing computed stock balances (sum of movements) against the materialized Stock_Record to detect and correct discrepancies.
- **Company_Scope**: The isolation boundary ensuring all catalog and inventory data is filtered by the active company identifier.

## Requirements

### Requirement 1: Category Management

**User Story:** As a warehouse operator, I want to create and organize product categories, so that I can classify products in a meaningful hierarchy.

#### Acceptance Criteria

1. WHEN a valid category creation request is received, THE Catalog_API SHALL create the Category record with the provided name and optional parent category, scoped to the active company.
2. WHEN a category creation request contains a name that already exists for the same company, THE Catalog_API SHALL reject the request with a conflict error and leave the database unchanged.
3. WHEN a category update request is received with valid data, THE Catalog_API SHALL update the Category record and set the updatedAt timestamp to the current time.
4. WHEN a category list request is received, THE Catalog_API SHALL return all categories for the active company, including their parent category references.
5. WHEN a category has a parentCategoryId referencing another category, THE Catalog_API SHALL validate that the parent category exists and belongs to the same company.
6. IF a category is referenced by products as their categoryId, THEN THE Catalog_API SHALL prevent deletion and return a validation error.
7. WHEN a category deletion request is received for a category with no product references, THE Catalog_API SHALL remove the category record.

### Requirement 2: Unit of Measure Management

**User Story:** As a catalog administrator, I want to define units of measure, so that products have consistent quantification across the system.

#### Acceptance Criteria

1. WHEN a valid unit of measure creation request is received, THE Catalog_API SHALL create the Unit_of_Measure record with name and symbol, scoped to the active company.
2. WHEN a unit of measure creation request contains a name that already exists for the same company, THE Catalog_API SHALL reject the request with a conflict error.
3. WHEN a unit of measure update request is received with valid data, THE Catalog_API SHALL update the record and set the updatedAt timestamp.
4. WHEN a unit of measure list request is received, THE Catalog_API SHALL return all active units of measure for the active company.
5. IF a unit of measure is referenced by products as their unitId, THEN THE Catalog_API SHALL prevent deletion and return a validation error.

### Requirement 3: Product Catalog Management

**User Story:** As a warehouse operator, I want to manage a product catalog with SKU, pricing, and inventory tracking configuration, so that I can maintain an accurate record of goods available for commerce.

#### Acceptance Criteria

1. WHEN a valid product creation request is received, THE Catalog_API SHALL create the Product record with SKU, name, and optional fields (description, barcode, costPrice, salePrice, categoryId, unitId, trackInventory), scoped to the active company.
2. WHEN a product creation request contains a SKU that already exists for the same company, THE Catalog_API SHALL reject the request with a conflict error and leave the database unchanged.
3. WHEN a product update request is received with valid data, THE Catalog_API SHALL update the Product record and set the updatedAt timestamp.
4. WHEN a product detail request is received, THE Catalog_API SHALL return the full product record including category name and unit symbol resolved from their references.
5. WHEN a product list request is received, THE Catalog_API SHALL return a paginated list of products for the active company, supporting filtering by category, status, and search term against name or SKU.
6. WHEN a product list request includes pagination parameters, THE Catalog_API SHALL return the requested page with a total count for client-side pagination controls.
7. IF a product has trackInventory set to true and active stock movement references exist, THEN THE Catalog_API SHALL prevent deletion and return a validation error.
8. WHEN a product has trackInventory set to false, THE Catalog_API SHALL exclude the product from stock balance calculations and movement validations.

### Requirement 4: Warehouse Management

**User Story:** As a logistics manager, I want to register and manage warehouses, so that I can track where inventory is stored.

#### Acceptance Criteria

1. WHEN a valid warehouse creation request is received, THE Catalog_API SHALL create the Warehouse record with name and code, scoped to the active company.
2. WHEN a warehouse creation request contains a code that already exists for the same company, THE Catalog_API SHALL reject the request with a conflict error.
3. WHEN a warehouse update request is received with valid data, THE Catalog_API SHALL update the Warehouse record and set the updatedAt timestamp.
4. WHEN a warehouse list request is received, THE Catalog_API SHALL return all warehouses for the active company.
5. IF a warehouse has stock records with non-zero quantities, THEN THE Catalog_API SHALL prevent deletion and return a validation error.

### Requirement 5: Stock Balance Tracking

**User Story:** As a warehouse operator, I want to view current stock levels per product and warehouse, so that I can make informed decisions about inventory availability.

#### Acceptance Criteria

1. THE Catalog_API SHALL maintain a Stock_Record for each unique combination of company, product, and warehouse where stock movements have occurred.
2. WHEN a stock movement is recorded, THE Catalog_API SHALL update the corresponding Stock_Record quantity within the same database transaction.
3. WHEN a stock balance query is received for a product, THE Catalog_API SHALL return the quantity and reservedQuantity for each warehouse where the product has a Stock_Record.
4. WHEN a stock overview query is received for a warehouse, THE Catalog_API SHALL return a paginated list of products with their current quantities at that warehouse.
5. THE Catalog_API SHALL ensure that the Stock_Record quantity equals the net sum of all stock movements for the same product and warehouse combination.
6. IF a stock movement would cause the Stock_Record quantity to become negative, THEN THE Catalog_API SHALL reject the movement with a validation error and leave the database unchanged.

### Requirement 6: Stock Movement Recording

**User Story:** As a warehouse operator, I want to record stock movements (inbound, outbound, transfers), so that I maintain an accurate and auditable inventory history.

#### Acceptance Criteria

1. WHEN a valid inbound stock movement is recorded, THE Catalog_API SHALL create a Stock_Movement record with movement_type "inbound" and increase the Stock_Record quantity by the movement quantity within a single transaction.
2. WHEN a valid outbound stock movement is recorded, THE Catalog_API SHALL create a Stock_Movement record with movement_type "outbound" and decrease the Stock_Record quantity by the movement quantity within a single transaction.
3. WHEN a valid transfer movement is recorded between two warehouses, THE Catalog_API SHALL create two Stock_Movement records (transfer_out at the source warehouse and transfer_in at the destination warehouse) and update both Stock_Records within a single transaction.
4. WHEN a stock movement is recorded, THE Catalog_API SHALL store the productId, warehouseId, quantity, optional unitCost, optional referenceType, optional referenceId, and optional notes.
5. WHEN a stock movement list request is received, THE Catalog_API SHALL return a paginated and filterable list of movements for the specified product or warehouse, ordered by creation date descending.
6. THE Catalog_API SHALL treat all Stock_Movement records as immutable after creation — no update or delete operations are permitted.
7. IF the referenced product does not have trackInventory set to true, THEN THE Catalog_API SHALL reject the stock movement with a validation error.

### Requirement 7: Stock Adjustment and Reconciliation

**User Story:** As a warehouse manager, I want to adjust stock levels with documented reasons, so that physical inventory discrepancies are corrected with full traceability.

#### Acceptance Criteria

1. WHEN a valid stock adjustment is recorded, THE Catalog_API SHALL create a Stock_Adjustment record with adjustmentType, quantity, reason, optional notes, and createdByUserId.
2. WHEN a stock adjustment is recorded, THE Catalog_API SHALL also create a corresponding Stock_Movement record with movement_type "adjustment" and update the Stock_Record within a single transaction.
3. WHEN an adjustment of type "increase" is recorded, THE Catalog_API SHALL add the quantity to the Stock_Record.
4. WHEN an adjustment of type "decrease" is recorded, THE Catalog_API SHALL subtract the quantity from the Stock_Record.
5. IF a decrease adjustment would cause the Stock_Record quantity to become negative, THEN THE Catalog_API SHALL reject the adjustment with a validation error and leave the database unchanged.
6. WHEN a reconciliation check is requested for a product at a warehouse, THE Catalog_API SHALL compute the expected balance from the sum of all movements and compare it against the materialized Stock_Record quantity.
7. IF the computed balance differs from the materialized Stock_Record quantity, THEN THE Catalog_API SHALL report the discrepancy with the expected value, actual value, and difference.

### Requirement 8: Company Data Isolation

**User Story:** As a business owner with multiple companies, I want catalog and inventory data to be strictly isolated per company, so that no data leaks between companies.

#### Acceptance Criteria

1. THE Catalog_API SHALL include the active company identifier in all catalog and inventory queries as a mandatory filter.
2. FOR ALL catalog and inventory endpoints, THE Catalog_API SHALL verify that referenced entities (categories, products, warehouses, units) belong to the active company before performing operations.
3. WHEN a request references an entity that does not belong to the active company, THE Catalog_API SHALL return a not-found error without revealing the existence of the entity in another company.
4. THE Catalog_API SHALL enforce company scoping at the database query level for all read and write operations.

### Requirement 9: Catalog List Performance

**User Story:** As a daily user, I want catalog and inventory lists to load and filter responsively, so that I can work efficiently with large product catalogs.

#### Acceptance Criteria

1. WHEN a paginated product list request is received, THE Catalog_API SHALL use indexed queries and return results within 200ms for catalogs of up to 10,000 products.
2. WHEN a stock overview request is received for a warehouse, THE Catalog_API SHALL use indexed queries and return paginated results within 200ms for warehouses with up to 5,000 stock records.
3. WHEN a stock movement history request is received, THE Catalog_API SHALL use indexed queries on companyId, productId, and warehouseId to return paginated results within 200ms for up to 50,000 movement records.
4. THE Catalog_API SHALL support limit and offset pagination parameters on all list endpoints.

### Requirement 10: Catalog and Inventory UI Screens

**User Story:** As a daily user, I want clear, responsive screens for managing catalog and inventory data, so that I can perform CRUD operations and view stock levels efficiently.

#### Acceptance Criteria

1. THE Renderer SHALL provide list screens for categories, units of measure, products, warehouses, and stock movements with loading, empty, error, and populated states.
2. THE Renderer SHALL provide creation and editing forms for categories, units of measure, products, and warehouses with inline field validation and clear error feedback.
3. WHEN a form submission succeeds, THE Renderer SHALL display a success notification and invalidate the related query cache to refresh the list view.
4. WHEN a form submission fails with validation errors, THE Renderer SHALL display field-level error messages without losing the user's input.
5. THE Renderer SHALL provide a stock adjustment form requiring reason, quantity, adjustment type, and warehouse selection, with a confirmation step before submission.
6. THE Renderer SHALL provide a transfer form requiring source warehouse, destination warehouse, product, and quantity, with validation that source and destination differ.
7. WHEN a product list exceeds one page, THE Renderer SHALL display pagination controls and allow navigation between pages without full page reload.
8. THE Renderer SHALL provide search and filter controls on product and stock movement lists that update results without full page reload.

### Requirement 11: Transactional Consistency

**User Story:** As a system administrator, I want stock operations to be transactionally consistent, so that partial failures never leave the database in an inconsistent state.

#### Acceptance Criteria

1. WHEN a stock movement is recorded, THE Catalog_API SHALL execute the movement creation and balance update within a single SQLite transaction.
2. WHEN a stock adjustment is recorded, THE Catalog_API SHALL execute the adjustment creation, movement creation, and balance update within a single SQLite transaction.
3. WHEN a transfer is recorded, THE Catalog_API SHALL execute both movement records and both balance updates within a single SQLite transaction.
4. IF any step within a stock transaction fails, THEN THE Catalog_API SHALL roll back the entire transaction and return an error, leaving the database in its pre-operation state.

### Requirement 12: Audit Traceability

**User Story:** As a compliance officer, I want stock adjustments and significant catalog changes to be auditable, so that I can trace who made changes and why.

#### Acceptance Criteria

1. WHEN a stock adjustment is created, THE Catalog_API SHALL record an entry in the audit_logs table with entity_type "stock_adjustment", the adjustment id, action "create", and the responsible user id.
2. WHEN a product is created or updated, THE Catalog_API SHALL record an entry in the audit_logs table with entity_type "product", the product id, and the corresponding action.
3. WHEN a warehouse is created or updated, THE Catalog_API SHALL record an entry in the audit_logs table with entity_type "warehouse", the warehouse id, and the corresponding action.
4. THE Catalog_API SHALL include the active company identifier in all audit log entries.
