# Data Layer Guide

This document describes the current persistence model and the responsibilities of the local data layer.

## Storage approach

The application uses SQLite through Drizzle ORM and better-sqlite3, with the main process acting as the orchestration boundary for database access and local services. The database file is stored in the Electron `userData` directory.

## Schema responsibilities

The current schema (`src/main/db/schema.ts`) defines a comprehensive company-scoped model with entities organized by domain:

### Foundation
- companies and company settings
- users, roles, and role permissions

### Commercial
- customers and suppliers
- orders, order items, and order payments
- quotes, quote items, and quote-to-order conversions
- purchase orders and purchase order items
- price rules

### Catalog and inventory
- categories (hierarchical, self-referencing)
- units of measure
- products
- warehouses, stock balances, stock movements, and stock adjustments

### Finance
- payment methods
- financial accounts and financial transactions

### Fiscal
- tax rules
- digital certificates
- invoices and invoice items
- document series and numbering sequences

### Operations
- audit logs
- attachments

This structure favors an operational desktop workflow with strong tenant scoping and traceability.

## Design principles

- Each important entity is scoped to a company.
- Inventory operations remain explicit and auditable.
- The database is the system of record for transactional data.
- Main-process code should remain the primary owner of persistence concerns.
- Unique constraints enforce business rules at the database level (e.g., SKU per company, document number per company).
- Cascading deletes are applied to company-owned records; restrict is used where referential integrity must be preserved (e.g., products referenced in orders).

## Local HTTP service

The main process starts a Fastify server (`src/main/server.ts`) on `127.0.0.1:3000`. This service exposes REST endpoints that the renderer consumes via the shared API layer (`src/renderer/src/shared/api`). The renderer uses TanStack React Query to manage server state, caching, and refetching.

### Implemented API routes

| Route prefix | Module | Purpose |
|--------------|--------|---------|
| `/api/categories` | `routes/categories.ts` | Category CRUD |
| `/api/units-of-measure` | `routes/units-of-measure.ts` | Unit of measure CRUD |
| `/api/products` | `routes/products.ts` | Product CRUD with pagination and filters |
| `/api/warehouses` | `routes/warehouses.ts` | Warehouse CRUD |
| `/api/stock` | `routes/stock.ts` | Stock balances and reconciliation |
| `/api/stock-movements` | `routes/stock-movements.ts` | Movement history and recording (inbound, outbound, transfer) |
| `/api/stock-adjustments` | `routes/stock-adjustments.ts` | Adjustment creation and history |
| `/api/companies` | `routes/companies.ts` | Company management |
| `/api/settings` | `routes/settings.ts` | App settings |

All catalog and inventory routes require the `x-company-id` header for company-scoped data isolation.

### Service layer

Domain logic lives in `src/main/services/`:

| Service | Responsibility |
|---------|---------------|
| `category-service.ts` | Category CRUD with parent validation and referential integrity |
| `unit-of-measure-service.ts` | Unit CRUD with product reference protection |
| `product-service.ts` | Product CRUD, paginated list with joins, deletion guard |
| `warehouse-service.ts` | Warehouse CRUD with stock-based deletion protection |
| `stock-service.ts` | Transactional stock operations (inbound, outbound, transfer, adjustment, reconcile) |
| `audit-service.ts` | Audit log insertion |

### Error handling

The API uses a structured error hierarchy (`src/main/api/errors.ts`) with typed error classes mapped to HTTP status codes by a global Fastify error handler. Error responses follow the envelope: `{ success: false, error: { code, message, fields? } }`.

## Current implementation notes

- The Drizzle schema definition lives in `src/main/db/schema.ts`.
- Migrations use a custom runner in `src/main/db/migrations/`.
- The service layer uses Drizzle's query builder with typed schemas.
- Stock operations execute within SQLite transactions for atomicity.
- Request bodies are validated with Zod schemas at the route level.
- The renderer consumes data through typed API client functions in `src/renderer/src/shared/api/catalog-api.ts` and React Query hooks colocated with each page.

## Growth strategy

As the application grows:
- Add new service modules following the existing pattern (company-scoped, typed errors, audit logging).
- Add Drizzle migration files for schema evolution beyond the initial migration.
- Expand the Fastify API as new modules are implemented.
- Consider adding a repository abstraction if query complexity justifies it.
