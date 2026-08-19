# Architecture Documentation

## Overview

The project is a desktop business application built with Electron, React, TypeScript, and Drizzle ORM. The current architecture is intentionally simple and keeps the core boundaries clear:

- main process: application lifecycle, database access, and local services
- preload bridge: a narrow IPC surface for the renderer
- renderer: React UI, routing, and page-level composition

## Current implementation boundaries

### Main process
The main process is responsible for:
- window creation and Electron lifecycle management
- bootstrap of the local Fastify server on `127.0.0.1:3000`
- database initialization and persistence concerns
- domain services with business logic (CRUD, stock operations, audit)
- REST API routes with request validation (Zod) and structured error handling

The main bootstrap is centered in [src/main/index.ts](../../src/main/index.ts), and the local service entry point is [src/main/server.ts](../../src/main/server.ts).

Key structural directories:
- `src/main/api/` — error hierarchy, error handler, response envelope types
- `src/main/db/` — Drizzle ORM schema, migrations, seed data
- `src/main/services/` — domain services (CategoryService, ProductService, StockService, etc.)
- `src/main/routes/` — Fastify route modules for all REST endpoints
- `src/main/lib/` — shared main-process utilities

### Preload layer
The preload layer should remain minimal and intentionally expose only the API surface the renderer needs. This keeps UI code decoupled from Electron internals and avoids broad access to the main process.

The current preload entry point is [src/preload/index.ts](../../src/preload/index.ts).

### Renderer layer
The renderer is organized around:
- [src/renderer/src/app](../../src/renderer/src/app) for the router, providers, and shell-level concerns
- [src/renderer/src/pages](../../src/renderer/src/pages) for route-level screens
- [src/renderer/src/shared](../../src/renderer/src/shared) for reusable UI, helpers, and API-facing utilities

The current pages include fully functional CRUD screens for home, products (with paginated list, create/edit forms, and detail view), categories, units of measure, warehouses, stock overview (with reconciliation), stock movements (with filtered history), and stock adjustments, as well as settings and company management.

The renderer router is defined in [src/renderer/src/app/router.tsx](../../src/renderer/src/app/router.tsx), and the Electron bootstrap is centered in [src/main/index.ts](../../src/main/index.ts).

## Architectural conventions

### Separation of concerns
- database logic stays in the main process (service layer)
- IPC remains narrow and purpose-driven
- UI components consume data exclusively through the local HTTP API (Fastify) via React Query hooks
- business rules are centralized in domain services (`src/main/services/`)
- request validation happens at the route level using Zod schemas
- the renderer never imports from `src/main/` directly

### Renderer organization
- keep page-specific UI near the owning page under [src/renderer/src/pages](../../src/renderer/src/pages)
- move reusable UI to [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui) (currently 44+ shared UI component files)
- keep shared hooks in [src/renderer/src/shared/hooks](../../src/renderer/src/shared/hooks)
- keep shared utilities in [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib)
- keep API-facing helpers in [src/renderer/src/shared/api](../../src/renderer/src/shared/api)
- keep app-wide providers in [src/renderer/src/app/providers](../../src/renderer/src/app/providers) (theme and query client)

### Path aliases

The project defines 6 TypeScript path aliases for clean imports:

| Alias | Maps to |
|-------|---------|
| `@main/*` | `./src/main/*` |
| `@preload/*` | `./src/preload/*` |
| `@renderer/*` | `./src/renderer/src/*` |
| `@app/*` | `./src/renderer/src/app/*` |
| `@pages/*` | `./src/renderer/src/pages/*` |
| `@shared/*` | `./src/renderer/src/shared/*` |

### Data architecture
The data model is company-centric. Most entities are scoped to a company and support inventory, sales, purchasing, and fiscal workflows.

Core principles:
- every important entity belongs to a company
- inventory and sales workflows remain explicit and auditable
- the database is the system of record for transactional data
- the schema should evolve without breaking the existing architectural boundaries

## Persistence strategy

The application uses SQLite through Drizzle ORM.

Why SQLite fits the current stage:
- local-first desktop deployment
- simple setup and maintenance
- enough flexibility for an MVP and small desktop usage scenarios

## Growth strategy

The architecture is designed for progressive growth:
- new modules can be added without rewriting the base model
- new feature areas can be introduced as additional tables and services
- the structure can later support clearer repository patterns, domain services, and richer integrations

When a change crosses architectural boundaries or introduces a new shared abstraction, record the trade-off in [docs/adr/README.md](../adr/README.md).
