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
- bootstrap of the local Fastify server
- database initialization and persistence concerns
- future IPC handlers and business orchestration

The main bootstrap is centered in [src/main/index.ts](../../src/main/index.ts), and the local service entry point is [src/main/server.ts](../../src/main/server.ts).

### Preload layer
The preload layer should remain minimal and intentionally expose only the API surface the renderer needs. This keeps UI code decoupled from Electron internals and avoids broad access to the main process.

The current preload entry point is [src/preload/index.ts](../../src/preload/index.ts).

### Renderer layer
The renderer is organized around:
- [src/renderer/src/app](../../src/renderer/src/app) for the router, providers, and shell-level concerns
- [src/renderer/src/pages](../../src/renderer/src/pages) for route-level screens
- [src/renderer/src/shared](../../src/renderer/src/shared) for reusable UI, helpers, and API-facing utilities

The current pages are still thin shells for home, products, categories, and settings, so the architecture favors clarity over premature abstraction.

## Architectural conventions

### Separation of concerns
- database logic stays in the main process
- IPC remains narrow and purpose-driven
- UI components should not directly manipulate the database
- business rules should be centralized in the main-process layer or in a future service layer

### Renderer organization
- keep page-specific UI near the owning page under [src/renderer/src/pages](../../src/renderer/src/pages)
- move reusable UI to [src/renderer/src/shared/ui](../../src/renderer/src/shared/ui) (currently 42 shared UI components)
- keep shared hooks in [src/renderer/src/shared/hooks](../../src/renderer/src/shared/hooks)
- keep shared utilities in [src/renderer/src/shared/lib](../../src/renderer/src/shared/lib)
- keep API-facing helpers in [src/renderer/src/shared/api](../../src/renderer/src/shared/api)

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
