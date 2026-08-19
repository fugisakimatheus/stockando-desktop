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

- Define route modules in `src/main/routes/` — one file per domain (categories, products, warehouses, stock, etc.).
- Register routes via `register*Routes(fastify)` functions called from `src/main/server.ts`.
- Use Zod `.strict()` schemas for request body validation in all route handlers.
- Extract `companyId` from the `x-company-id` request header and validate it as a positive integer.
- Return structured responses via the `ok()` helper from `src/main/api/types.ts`.
- Throw typed errors (from `src/main/api/errors.ts`) — the global error handler maps them to HTTP status codes and structured `{ success: false, error: { code, message, fields? } }` responses.
- Use `reply.status(201)` for resource creation responses.
- CORS headers include `x-company-id` in `Access-Control-Allow-Headers`.

## Service Layer Patterns

- Domain services live in `src/main/services/` — one file per aggregate (category-service, product-service, stock-service, etc.).
- Services accept `companyId` as the first parameter to enforce company scoping.
- Services throw typed errors (`NotFoundError`, `ConflictError`, `EntityReferencedError`, `InsufficientStockError`, etc.) — never raw strings or generic `Error`.
- Use transactional operations (`db.transaction()`) for multi-step stock operations.
- Use `onConflictDoUpdate` for upsert patterns (stock record materialization).
- Catch SQLite `UNIQUE constraint failed` errors and remap to `ConflictError`.
- Call `logAudit()` after successful mutations for audit trail.
- Shared types and constants live in `src/main/services/types.ts` (discriminants, request/response interfaces, pagination).

## Error Handling

- Error hierarchy lives in `src/main/api/errors.ts` with classes: `AppError`, `ValidationError`, `NotFoundError`, `ConflictError`, `BusinessRuleError`, `InsufficientStockError`, `EntityReferencedError`, `InvalidMovementError`, `TransferSameWarehouseError`, `SystemError`.
- Each error class has a `code` (string enum) and `statusCode` (HTTP).
- The global Fastify error handler in `src/main/api/error-handler.ts` maps errors to responses automatically.

## Query Client (Renderer Side)

- The shared query client is configured at `src/renderer/src/shared/api/query-client.ts`.
- Default stale time is 5 minutes; GC time is 5 minutes.
- Use `refetchOnWindowFocus: true` for data freshness.

## Do

- Keep schema definitions declarative and self-contained.
- Document schema changes through Drizzle migrations when introduced.
- Keep the Fastify service as the single data gateway for the renderer.
- Keep services focused on one domain aggregate per file.
- Run `pnpm test --run` to verify service logic after changes.

## Do Not

- Do not import from `drizzle-orm` in renderer code.
- Do not use raw SQL unless Drizzle's query builder cannot express the operation.
- Do not store sensitive values (passwords, certificates) in plain text without encryption.
- Do not bypass the company scope for multi-tenant entities.
- Do not throw raw `Error` or strings from services — use the typed error hierarchy.
- Do not call database operations directly from route handlers — delegate to the service layer.
