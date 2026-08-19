# Catalog and Inventory

## Purpose

This module manages products, categories, stock, and warehouse operations. It is the first operational module of the system, fully implemented in Phase 1.

## Implementation Status

Phase 1 is complete. All backend services, API routes, property-based tests, and frontend pages are implemented and passing.

## Main Resources

### Categories

- organize products into logical groups
- support nested category hierarchies (parent/child)
- unique name per company enforced at the database level
- CRUD operations with referential integrity protection (cannot delete if products reference the category)

### Units of Measure

- define measurement units (e.g., unit, box, kg, liter)
- unique name per company
- CRUD with protection against deletion when referenced by products

### Products

- store SKU, name, description, barcode, and pricing (cost and sale)
- connect products to categories and units of measure
- support inventory tracking flag (`trackInventory`)
- unique SKU per company
- paginated list with search (name/SKU), category filter, and status filter
- detail view with resolved category name and unit symbol
- deletion guard when `trackInventory=true` and stock movements exist

### Warehouses

- represent physical storage locations with name, code, and address
- unique code per company
- deletion blocked when stock records have non-zero quantities

### Stock

- materialized balance per product-warehouse combination
- real-time quantity and reserved quantity tracking
- views by warehouse (paginated product list) and by product (balance per warehouse)
- reconciliation check comparing computed balance (sum of movements) against materialized balance

### Stock Movements

- immutable records of stock changes (no update or delete)
- movement types: inbound, outbound, transfer_in, transfer_out, adjustment
- inbound: adds to stock balance (upsert pattern)
- outbound: subtracts from stock with non-negative enforcement
- transfer: paired movements (transfer_out + transfer_in) with atomic balance updates
- paginated history with filters (product, warehouse, type, date range)

### Stock Adjustments

- corrections to inventory with required reason and responsible user
- adjustment types: increase, decrease, correction
- each adjustment creates a corresponding stock movement for audit trail
- decrease adjustments enforce non-negative stock
- confirmation step before submission in the UI

## Architecture

### Backend

```text
src/main/
├── services/
│   ├── category-service.ts
│   ├── unit-of-measure-service.ts
│   ├── product-service.ts
│   ├── warehouse-service.ts
│   ├── stock-service.ts
│   ├── audit-service.ts
│   └── types.ts                  # Shared type definitions and constants
├── routes/
│   ├── categories.ts
│   ├── units-of-measure.ts
│   ├── products.ts
│   ├── warehouses.ts
│   ├── stock.ts
│   ├── stock-movements.ts
│   └── stock-adjustments.ts
└── api/
    ├── errors.ts                 # Typed error hierarchy
    ├── error-handler.ts          # Fastify global error handler
    └── types.ts                  # API envelope (ok/err)
```

### Frontend

```text
src/renderer/src/
├── shared/api/
│   └── catalog-api.ts            # 22 typed fetch functions + types
├── pages/
│   ├── categories/
│   │   ├── hooks/use-categories.ts
│   │   └── ui/categories-page.tsx
│   ├── units-of-measure/
│   │   ├── hooks/use-units-of-measure.ts
│   │   └── ui/units-of-measure-page.tsx
│   ├── products/
│   │   ├── hooks/use-products.ts
│   │   └── ui/products-page.tsx, product-detail-page.tsx, product-form-dialog.tsx
│   ├── warehouses/
│   │   ├── hooks/use-warehouses.ts
│   │   └── ui/warehouses-page.tsx
│   ├── stock/
│   │   ├── hooks/use-stock.ts
│   │   └── ui/stock-overview-page.tsx (with reconciliation tab)
│   ├── stock-movements/
│   │   ├── hooks/use-stock-movements.ts
│   │   └── ui/stock-movements-page.tsx, transfer-form.tsx
│   └── stock-adjustments/
│       ├── hooks/use-stock-adjustments.ts
│       └── ui/stock-adjustment-page.tsx
└── shared/ui/
    ├── confirm-dialog.tsx
    └── filter-bar.tsx
```

## Key Business Rules

| Rule | Enforcement |
|------|------------|
| Unique category name per company | Database unique index + ConflictError |
| Unique SKU per company | Database unique index + ConflictError |
| Unique warehouse code per company | Database unique index + ConflictError |
| Non-negative stock | Checked before outbound/transfer/decrease operations |
| Transfer source != destination | Validated before transaction begins |
| trackInventory gate | All movement operations reject products with trackInventory=false |
| Transactional atomicity | All stock operations wrapped in SQLite transactions |
| Movement immutability | No PUT/DELETE endpoints for movements |
| Company data isolation | All queries scoped by companyId from x-company-id header |

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create category |
| PUT | `/api/categories/:id` | Update category |
| DELETE | `/api/categories/:id` | Delete category |
| GET | `/api/units-of-measure` | List units |
| POST | `/api/units-of-measure` | Create unit |
| PUT | `/api/units-of-measure/:id` | Update unit |
| DELETE | `/api/units-of-measure/:id` | Delete unit |
| GET | `/api/products` | List products (paginated, filtered) |
| GET | `/api/products/:id` | Product detail |
| POST | `/api/products` | Create product |
| PUT | `/api/products/:id` | Update product |
| DELETE | `/api/products/:id` | Delete product |
| GET | `/api/warehouses` | List warehouses |
| POST | `/api/warehouses` | Create warehouse |
| PUT | `/api/warehouses/:id` | Update warehouse |
| DELETE | `/api/warehouses/:id` | Delete warehouse |
| GET | `/api/stock/product/:productId` | Stock by product |
| GET | `/api/stock/warehouse/:warehouseId` | Stock by warehouse |
| POST | `/api/stock/reconcile` | Run reconciliation |
| GET | `/api/stock-movements` | List movements (paginated, filtered) |
| POST | `/api/stock-movements/inbound` | Record inbound |
| POST | `/api/stock-movements/outbound` | Record outbound |
| POST | `/api/stock-movements/transfer` | Record transfer |
| GET | `/api/stock-adjustments` | List adjustments |
| POST | `/api/stock-adjustments` | Create adjustment |

## Test Coverage

The module is covered by 154 tests including:
- 11 property-based test files verifying domain invariants
- Integration tests covering the complete stock workflow
- Unit tests for all CRUD services
