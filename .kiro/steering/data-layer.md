---
inclusion: fileMatch
fileMatchPattern: "**/main/**/*.{ts,js}"
---

# Data Layer and Drizzle ORM

Rules for the persistence layer, database schema, and the local Fastify service in the Electron main process.

## Architecture Boundary

- All database access lives in `src/main/` — never import Drizzle or better-sqlite3 from the renderer.
- The renderer consumes data through the local HTTP API (Fastify on `127.0.0.1:3000`) via `@shared/api`.
- The preload bridge should not expose raw database queries.

## Schema Conventions

- Schema lives in `src/main/db/schema.ts` using Drizzle's `sqliteTable` helper.
- Every business entity must be scoped to a `companyId` with a foreign key to `companies.id`.
- Use `text` columns for dates (ISO strings) — SQLite has no native date type.
- Use `real` for decimal values (prices, quantities).
- Use `integer` with `{ mode: 'boolean' }` for boolean flags.
- Always include `createdAt` and `updatedAt` fields on mutable entities.
- Add database-level uniqueness constraints for natural keys (e.g., SKU per company).

## Indexing Strategy

- Add indexes on foreign keys used in queries and joins.
- Add composite unique indexes to enforce business rules at the DB level.
- Prefer `uniqueIndex` for natural keys; use `index` for query performance.

## Cascading Rules

- Use `onDelete: 'cascade'` for company-owned child entities.
- Use `onDelete: 'restrict'` for referenced entities that must not be orphaned (e.g., products in orders).
- Use `onDelete: 'set null'` for optional references.

## Fastify API Patterns

- Define routes in the Fastify instance started from `src/main/server.ts`.
- Return typed responses — prefer explicit result shapes over raw Drizzle row types.
- Add CORS headers for the renderer origin.
- Use Zod or TypeBox for request validation when the API surface grows.

## Query Client (Renderer Side)

- The shared query client is configured at `src/renderer/src/shared/api/query-client.ts`.
- Default stale time is 5 minutes; GC time is 5 minutes.
- Use `refetchOnWindowFocus: true` for data freshness.

## Do

- Keep schema definitions declarative and self-contained.
- Document schema changes through Drizzle migrations when introduced.
- Keep the Fastify service as the single data gateway for the renderer.

## Do Not

- Do not import from `drizzle-orm` in renderer code.
- Do not use raw SQL unless Drizzle's query builder cannot express the operation.
- Do not store sensitive values (passwords, certificates) in plain text without encryption.
- Do not bypass the company scope for multi-tenant entities.
