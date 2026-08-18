# Implementation Plan: Phase 1 - Catalog and Inventory Management

## Overview

This plan implements the first operational business module for Stockando Desktop, covering the full product catalog (categories, units of measure, products), warehouse management, stock movement tracking, inventory adjustments with audit traceability, and stock reconciliation. The implementation follows a backend-first approach: service layer → route modules → renderer hooks → UI pages, building incrementally so each step is testable before moving to the next.

## Tasks

- [ ] 1. Set up service layer foundation and shared types
  - [ ] 1.1 Create shared type definitions and constants for the catalog and inventory domain
    - Create `src/main/services/types.ts` with all request/response interfaces, discriminants (`MOVEMENT_TYPES`, `ADJUSTMENT_TYPES`), and pagination types as defined in the design document
    - Export `ApiErrorResponse`, error codes, and typed error helpers
    - _Requirements: 5.1, 6.4, 7.1, 11.1_

  - [ ] 1.2 Create the AuditService for logging entity changes
    - Create `src/main/services/audit-service.ts` implementing the `AuditService` interface
    - Insert entries into the `auditLogs` table with companyId, entityType, entityId, action, userId, and details
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [ ] 1.3 Add additional composite indexes on stock_movements for performance
    - Add composite index on `(companyId, productId)` and `(companyId, warehouseId)` in the `stockMovements` table definition in `src/main/db/schema.ts`
    - _Requirements: 9.3_

- [ ] 2. Implement CategoryService and categories route module
  - [ ] 2.1 Implement CategoryService with CRUD operations
    - Create `src/main/services/category-service.ts` with `list`, `create`, `update`, `delete` methods
    - Enforce company scoping on all queries
    - Validate parent category exists and belongs to the same company
    - Reject deletion when products reference the category
    - Handle unique constraint violations (duplicate name per company) with conflict error
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 8.1, 8.2, 8.4_

  - [ ]* 2.2 Write property test for uniqueness constraint enforcement (categories)
    - **Property 6: Uniqueness constraint enforcement**
    - **Validates: Requirements 1.2**

  - [ ]* 2.3 Write property test for referential integrity on deletion (categories)
    - **Property 8: Referential integrity on deletion**
    - **Validates: Requirements 1.6**

  - [ ] 2.4 Create Fastify route module for categories API
    - Create `src/main/routes/categories.ts` registering GET, POST, PUT, DELETE on `/api/categories`
    - Validate request bodies, extract company context, delegate to CategoryService
    - Return structured `ApiErrorResponse` on failures with correct HTTP status codes
    - Call AuditService on create/update operations
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 12.2_

- [ ] 3. Implement UnitOfMeasureService and units route module
  - [ ] 3.1 Implement UnitOfMeasureService with CRUD operations
    - Create `src/main/services/unit-of-measure-service.ts` with `list`, `create`, `update`, `delete` methods
    - Enforce company scoping, reject duplicates, prevent deletion if referenced by products
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.1, 8.4_

  - [ ] 3.2 Create Fastify route module for units of measure API
    - Create `src/main/routes/units-of-measure.ts` registering GET, POST, PUT, DELETE on `/api/units-of-measure`
    - Validate request bodies, delegate to service, return structured errors
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 4. Implement ProductService and products route module
  - [ ] 4.1 Implement ProductService with CRUD and paginated list
    - Create `src/main/services/product-service.ts` with `list`, `detail`, `create`, `update`, `delete` methods
    - Support pagination (limit/offset), filtering by category, status, and search term (name or SKU)
    - Resolve category name and unit symbol on detail requests
    - Enforce company scoping, reject duplicate SKU, prevent deletion when trackInventory is true and stock movements exist
    - Return total count for pagination controls
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 8.1, 8.2, 8.4, 9.1_

  - [ ]* 4.2 Write property test for uniqueness constraint enforcement (products)
    - **Property 6: Uniqueness constraint enforcement**
    - **Validates: Requirements 3.2**

  - [ ] 4.3 Create Fastify route module for products API
    - Create `src/main/routes/products.ts` registering GET (list), GET (detail), POST, PUT, DELETE on `/api/products`
    - Parse query parameters (limit, offset, categoryId, status, search) for paginated list
    - Call AuditService on create/update operations
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 9.1, 9.4, 12.2_

- [ ] 5. Implement WarehouseService and warehouses route module
  - [ ] 5.1 Implement WarehouseService with CRUD operations
    - Create `src/main/services/warehouse-service.ts` with `list`, `create`, `update`, `delete` methods
    - Enforce company scoping, reject duplicate code, prevent deletion when stock records have non-zero quantities
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 8.1, 8.4_

  - [ ] 5.2 Create Fastify route module for warehouses API
    - Create `src/main/routes/warehouses.ts` registering GET, POST, PUT, DELETE on `/api/warehouses`
    - Call AuditService on create/update operations
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 12.3_

- [ ] 6. Checkpoint - Core catalog services
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement StockService with transactional stock operations
  - [ ] 7.1 Implement StockService.recordInbound with transactional balance update
    - Create `src/main/services/stock-service.ts` starting with `recordInbound`
    - Validate product exists, belongs to company, has trackInventory=true
    - Create movement record with type "inbound" and upsert stock record within a single transaction
    - _Requirements: 5.1, 5.2, 5.6, 6.1, 6.4, 6.7, 11.1_

  - [ ] 7.2 Implement StockService.recordOutbound with negative stock protection
    - Add `recordOutbound` to StockService
    - Validate available stock before decrementing; reject if balance would go negative
    - Create movement record with type "outbound" and decrement stock record within a single transaction
    - _Requirements: 5.2, 5.6, 6.2, 6.4, 6.7, 11.1_

  - [ ] 7.3 Implement StockService.recordTransfer with paired movements
    - Add `recordTransfer` to StockService
    - Create transfer_out at source, transfer_in at destination, update both stock records in a single transaction
    - Validate source has sufficient stock; reject if source and destination are the same warehouse
    - _Requirements: 5.2, 5.6, 6.3, 6.4, 11.3_

  - [ ]* 7.4 Write property test for stock balance equals net movement sum
    - **Property 1: Stock balance equals net movement sum**
    - **Validates: Requirements 5.5**

  - [ ]* 7.5 Write property test for non-negative stock enforcement
    - **Property 2: Non-negative stock enforcement**
    - **Validates: Requirements 5.6, 7.5**

  - [ ]* 7.6 Write property test for transfer conservation
    - **Property 3: Transfer conservation**
    - **Validates: Requirements 6.3**

  - [ ] 7.7 Implement StockService.getProductBalances and getWarehouseOverview
    - Add `getProductBalances` returning quantity and reservedQuantity per warehouse for a product
    - Add `getWarehouseOverview` returning paginated list of products with quantities at a warehouse
    - _Requirements: 5.3, 5.4, 9.2, 9.4_

  - [ ] 7.8 Implement StockService.createAdjustment with audit trail
    - Add `createAdjustment` to StockService
    - Create stock_adjustment record, corresponding movement with type "adjustment", and update stock record in a single transaction
    - Reject decrease adjustments that would cause negative balance
    - Create audit log entry via AuditService
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 11.2, 12.1_

  - [ ]* 7.9 Write property test for adjustment creates corresponding movement
    - **Property 9: Adjustment creates corresponding movement**
    - **Validates: Requirements 7.2**

  - [ ] 7.10 Implement StockService.reconcile
    - Add `reconcile` computing expected balance from sum of all movements and comparing against materialized stock record
    - Return computed balance, materialized balance, discrepancy, and isConsistent flag
    - _Requirements: 7.6, 7.7_

  - [ ]* 7.11 Write property test for reconciliation correctness
    - **Property 10: Reconciliation correctness**
    - **Validates: Requirements 7.6, 7.7**

  - [ ]* 7.12 Write property test for transactional atomicity
    - **Property 7: Transactional atomicity for stock operations**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4**

  - [ ]* 7.13 Write property test for trackInventory gate
    - **Property 11: TrackInventory gate**
    - **Validates: Requirements 3.8, 6.7**

- [ ] 8. Create stock, movements, and adjustments route modules
  - [ ] 8.1 Create Fastify route module for stock API
    - Create `src/main/routes/stock.ts` registering GET `/api/stock/product/:productId`, GET `/api/stock/warehouse/:warehouseId`, POST `/api/stock/reconcile`
    - _Requirements: 5.3, 5.4, 7.6, 7.7, 9.2, 9.4_

  - [ ] 8.2 Create Fastify route module for stock movements API
    - Create `src/main/routes/stock-movements.ts` registering GET (paginated, filterable list), POST inbound, POST outbound, POST transfer
    - Parse query parameters (limit, offset, productId, warehouseId, movementType, startDate, endDate)
    - Enforce immutability — no PUT or DELETE endpoints
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 9.3, 9.4_

  - [ ] 8.3 Create Fastify route module for stock adjustments API
    - Create `src/main/routes/stock-adjustments.ts` registering GET (paginated history) and POST
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 12.1_

- [ ] 9. Wire route modules into Fastify server
  - [ ] 9.1 Register all route modules in `src/main/server.ts`
    - Refactor `server.ts` to register route modules as Fastify plugins
    - Add proper CORS configuration for all routes
    - Set up company context extraction (header or query param) for all API routes
    - Remove the existing demo users endpoint
    - _Requirements: 8.1, 8.3, 8.4_

  - [ ]* 9.2 Write integration tests for stock workflow
    - Test inbound → check balance → outbound → verify balance → transfer → verify both
    - Test adjustment → verify movement + balance → verify audit log
    - Test reconciliation after a sequence of movements
    - _Requirements: 5.5, 6.1, 6.2, 6.3, 7.1, 7.2, 7.6, 11.1, 11.2, 11.3_

  - [ ]* 9.3 Write property test for company data isolation
    - **Property 5: Company data isolation**
    - **Validates: Requirements 8.1, 8.4**

  - [ ]* 9.4 Write property test for movement immutability
    - **Property 4: Movement immutability**
    - **Validates: Requirements 6.6**

- [ ] 10. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Create renderer API client and query hooks
  - [ ] 11.1 Create API client helpers for catalog and inventory endpoints
    - Create `src/renderer/src/shared/api/catalog-api.ts` with typed fetch functions for all catalog and inventory endpoints
    - Follow the existing API client pattern from Phase 0
    - _Requirements: 8.1, 8.3_

  - [ ] 11.2 Create TanStack Query hooks for categories and units of measure
    - Create `src/renderer/src/pages/categories/hooks/use-categories.ts` with `useCategories`, `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory`
    - Create `src/renderer/src/pages/units-of-measure/hooks/use-units-of-measure.ts` with `useUnitsOfMeasure`, `useCreateUnit`, `useUpdateUnit`, `useDeleteUnit`
    - Use query keys with company prefix for cache isolation
    - Invalidate related queries on mutation success
    - _Requirements: 1.1, 1.3, 1.4, 2.1, 2.3, 2.4, 10.3_

  - [ ] 11.3 Create TanStack Query hooks for products
    - Create `src/renderer/src/pages/products/hooks/use-products.ts` with `useProducts`, `useProductDetail`, `useCreateProduct`, `useUpdateProduct`, `useDeleteProduct`
    - Support pagination and filtering parameters in query keys
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 10.3_

  - [ ] 11.4 Create TanStack Query hooks for warehouses
    - Create `src/renderer/src/pages/warehouses/hooks/use-warehouses.ts` with `useWarehouses`, `useCreateWarehouse`, `useUpdateWarehouse`, `useDeleteWarehouse`
    - _Requirements: 4.1, 4.3, 4.4, 10.3_

  - [ ] 11.5 Create TanStack Query hooks for stock, movements, and adjustments
    - Create `src/renderer/src/pages/stock/hooks/use-stock.ts` with `useProductStock`, `useWarehouseOverview`, `useRecordInbound`, `useRecordOutbound`, `useRecordTransfer`, `useCreateAdjustment`, `useReconcile`
    - Create `src/renderer/src/pages/stock-movements/hooks/use-stock-movements.ts` with `useStockMovements`
    - _Requirements: 5.3, 5.4, 6.1, 6.2, 6.3, 6.5, 7.1, 7.6, 10.3_

- [ ] 12. Build shared UI components for catalog pages
  - [ ] 12.1 Create DataTable component using TanStack Table
    - Create `src/renderer/src/shared/ui/data-table.tsx` wrapping `@tanstack/react-table` with server-side pagination controls
    - Support column definitions, loading/empty states, and pagination navigation
    - Use existing table primitives from `@shared/ui/table.tsx` for rendering
    - _Requirements: 10.7, 10.8_

  - [ ] 12.2 Create ConfirmDialog and FilterBar shared components
    - Create `src/renderer/src/shared/ui/confirm-dialog.tsx` for destructive action confirmation
    - Create `src/renderer/src/shared/ui/filter-bar.tsx` for reusable search and filter controls
    - _Requirements: 10.5, 10.8_

- [ ] 13. Build Categories and Units of Measure pages
  - [ ] 13.1 Build CategoriesPage with list, create, edit, and delete
    - Create `src/renderer/src/pages/categories/ui/categories-page.tsx` with category list, create dialog, edit dialog, delete confirmation
    - Show hierarchical parent relationships in the list
    - Handle loading, empty, error, and populated states
    - Display inline validation errors on forms; show success toast on mutations
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 10.1, 10.2, 10.3, 10.4_

  - [ ] 13.2 Build UnitsOfMeasurePage with list, create, edit, and delete
    - Create `src/renderer/src/pages/units-of-measure/ui/units-of-measure-page.tsx`
    - Handle all CRUD operations with proper form validation and feedback
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 10.1, 10.2, 10.3, 10.4_

- [ ] 14. Build Products page with pagination and filtering
  - [ ] 14.1 Build ProductsPage with paginated table, search, and filters
    - Create `src/renderer/src/pages/products/ui/products-page.tsx` using DataTable with server-side pagination
    - Add search input (name/SKU), category filter dropdown, status filter
    - Show product list items with SKU, name, category, unit, prices, status
    - Pagination controls for navigating pages without full reload
    - _Requirements: 3.5, 3.6, 9.1, 9.4, 10.1, 10.7, 10.8_

  - [ ] 14.2 Build product create and edit forms
    - Add create/edit dialog or sheet for products with all fields (SKU, name, description, barcode, costPrice, salePrice, categoryId, unitId, trackInventory)
    - Inline field validation and error feedback
    - Success toast and query invalidation on mutation
    - _Requirements: 3.1, 3.2, 3.3, 10.2, 10.3, 10.4_

  - [ ] 14.3 Build ProductDetailPage with stock information
    - Create `src/renderer/src/pages/products/ui/product-detail-page.tsx`
    - Show full product details with resolved category name and unit symbol
    - Display stock balances per warehouse for the product
    - _Requirements: 3.4, 5.3_

- [ ] 15. Build Warehouses page
  - [ ] 15.1 Build WarehousesPage with list, create, edit, and delete
    - Create `src/renderer/src/pages/warehouses/ui/warehouses-page.tsx`
    - Handle all CRUD operations with proper form validation (name, code, address)
    - Show delete confirmation; display validation errors on referenced warehouse deletion
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 10.1, 10.2, 10.3, 10.4_

- [ ] 16. Build Stock Overview and Movements pages
  - [ ] 16.1 Build StockOverviewPage with warehouse-level and product-level views
    - Create `src/renderer/src/pages/stock/ui/stock-overview-page.tsx`
    - Show paginated product stock at a selected warehouse using DataTable
    - Show stock balances per warehouse for a selected product
    - _Requirements: 5.3, 5.4, 9.2, 10.1_

  - [ ] 16.2 Build StockMovementsPage with filtered history
    - Create `src/renderer/src/pages/stock-movements/ui/stock-movements-page.tsx`
    - Paginated movement list with filters: productId, warehouseId, movementType, date range
    - Use DataTable with column definitions for movement history
    - _Requirements: 6.5, 9.3, 10.1, 10.8_

- [ ] 17. Build Stock Adjustment and Transfer forms
  - [ ] 17.1 Build StockAdjustmentPage with form and history
    - Create `src/renderer/src/pages/stock-adjustments/ui/stock-adjustment-page.tsx`
    - Adjustment form requiring reason, quantity, adjustmentType, warehouse, and product selection
    - Add confirmation step before submission
    - Display adjustment history list
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 10.5_

  - [ ] 17.2 Build Transfer form with source/destination validation
    - Create transfer UI (within stock movements or as standalone)
    - Require source warehouse, destination warehouse, product, and quantity
    - Validate that source and destination differ; show inline error if same
    - _Requirements: 6.3, 10.6_

  - [ ] 17.3 Build reconciliation trigger in stock overview
    - Add reconciliation action button on StockOverviewPage for a product/warehouse pair
    - Display reconciliation result: computed vs materialized balance, discrepancy
    - _Requirements: 7.6, 7.7_

- [ ] 18. Register routes in TanStack Router
  - [ ] 18.1 Add page routes to the router configuration
    - Update `src/renderer/src/app/router.tsx` with routes for all new pages: `/categories`, `/units-of-measure`, `/products`, `/products/:id`, `/warehouses`, `/stock`, `/stock-movements`, `/stock-adjustments`
    - Add navigation links in the app shell sidebar
    - _Requirements: 10.1_

- [ ] 19. Checkpoint - Full feature integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The schema already exists in `src/main/db/schema.ts` — no migration step needed for table creation
- The existing UI primitives (dialog, button, input, table, select, sonner, etc.) from Phase 0 should be reused throughout
- All stock operations must execute within SQLite transactions via `db.transaction()`
- Company scoping is mandatory on every query — extract company context from request headers or params

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1", "5.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "3.2", "4.1", "5.2"] },
    { "id": 4, "tasks": ["4.2", "4.3"] },
    { "id": 5, "tasks": ["7.1"] },
    { "id": 6, "tasks": ["7.2", "7.7"] },
    { "id": 7, "tasks": ["7.3", "7.8"] },
    { "id": 8, "tasks": ["7.4", "7.5", "7.6", "7.9", "7.10", "7.13"] },
    { "id": 9, "tasks": ["7.11", "7.12", "8.1", "8.2", "8.3"] },
    { "id": 10, "tasks": ["9.1"] },
    { "id": 11, "tasks": ["9.2", "9.3", "9.4"] },
    { "id": 12, "tasks": ["11.1"] },
    { "id": 13, "tasks": ["11.2", "11.3", "11.4", "11.5", "12.1", "12.2"] },
    { "id": 14, "tasks": ["13.1", "13.2", "14.1", "15.1", "16.1", "16.2"] },
    { "id": 15, "tasks": ["14.2", "14.3", "17.1", "17.2", "17.3"] },
    { "id": 16, "tasks": ["18.1"] }
  ]
}
```
