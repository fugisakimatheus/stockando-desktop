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

## Current implementation notes

- The Drizzle schema definition lives in `src/main/db/schema.ts`.
- The local HTTP service is started from `src/main/server.ts` during app bootstrap.
- The renderer should consume data through the shared API helpers and React Query hooks rather than interacting with the database directly.
- The preload bridge (`src/preload/index.ts`) currently exposes only the Electron API surface.

## Recommended follow-up

As the application grows, it will be helpful to:
- Add Drizzle migration files and a migration strategy for schema evolution.
- Introduce a service/repository layer for domain-specific persistence logic in the main process.
- Expand the Fastify API to cover CRUD operations for the major entity groups.
- Add request validation (Zod or TypeBox) at the API boundary.
