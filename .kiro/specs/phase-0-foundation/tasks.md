# Implementation Plan: Phase 0 - Foundation and MVP Shell

## Overview

This plan implements the structural foundation for Stockando Desktop: database initialization with migrations, Fastify HTTP API, multi-company context management, application settings, shared UI primitives, navigation, and the app shell experience. Each task builds incrementally on the previous, ending with full integration and testing.

## Tasks

- [x] 1. Database layer and migration infrastructure
  - [x] 1.1 Create the `appSettings` table in `src/main/db/schema.ts` and add Drizzle type exports
    - Add the `appSettings` sqliteTable with `id`, `key` (unique), `value`, `createdAt`, `updatedAt`
    - Export inferred select/insert types for all Phase 0 tables: `Company`, `CompanyInsert`, `CompanySettings`, `AppSetting`, `User`, `AuditLog`
    - _Requirements: 6.1, 4.1, 12.1_

  - [x] 1.2 Implement the Migration Runner in `src/main/db/migrations/`
    - Create a `migrations` directory with an `index.ts` runner and individual migration files
    - Define the `Migration` interface with `version`, `name`, and `up` function
    - Track applied migrations in a `_migrations` metadata table
    - Execute each migration within its own transaction; halt on failure and roll back the failed migration
    - Apply migrations in strictly ascending version order
    - _Requirements: 6.2, 6.3, 1.4_

  - [x] 1.3 Create the initial migration file (`001-initial-schema`)
    - Create all Phase 0 tables: `companies`, `company_settings`, `users`, `roles`, `role_permissions`, `audit_logs`, `app_settings`
    - Include indexes and foreign key constraints matching the existing Drizzle schema
    - _Requirements: 6.1, 6.4, 6.5_

  - [x] 1.4 Implement seed data logic for first-run initialization
    - Detect first run by checking if `app_settings` table is empty
    - Insert default app settings: `theme` = `system`, `lastActiveCompanyId` = `null`
    - _Requirements: 1.5, 4.5_

  - [x] 1.5 Write property test for migration sequential ordering
    - **Property 2: Migration sequential ordering**
    - **Validates: Requirements 6.2**

  - [x] 1.6 Write property test for migration transactional atomicity
    - **Property 3: Migration transactional atomicity**
    - **Validates: Requirements 6.3**

- [x] 2. Checkpoint - Ensure database layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Fastify HTTP server refactoring and bootstrap sequence
  - [x] 3.1 Refactor `src/main/server.ts` into a proper bootstrap sequence
    - Resolve database path via `app.getPath('userData')/database.sqlite`
    - Open SQLite connection with WAL mode enabled
    - Run the Migration Runner to apply pending migrations
    - Execute seed data logic if first run
    - Start Fastify with CORS configured for all methods (GET, POST, PUT, DELETE, OPTIONS)
    - Return `BootstrapResult` with `status`, `error`, and `lastActiveCompanyId`
    - Remove the legacy `CREATE TABLE IF NOT EXISTS users` raw SQL
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 10.5_

  - [x] 3.2 Implement the standard API response envelope and error handling
    - Create `ApiResponse<T>` and `ApiError` types in `src/main/api/types.ts`
    - Create a Fastify error handler that maps database constraint violations to structured error codes
    - Error codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409), `SYSTEM_ERROR` (500)
    - Never expose raw SQLite or internal errors to the renderer
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 3.3 Implement the bootstrap API route (`GET /api/bootstrap`)
    - Return app initialization status and last active company ID
    - Include list of available companies for initial context restoration
    - _Requirements: 1.1, 1.2, 2.6_

- [x] 4. Company management API routes
  - [x] 4.1 Implement `GET /api/companies` and `POST /api/companies`
    - List all companies ordered by name
    - Create company with validation: `name` required, `documentNumber` required and unique
    - On creation, automatically create a `companySettings` row with defaults
    - Set `createdAt`/`updatedAt` timestamps on creation
    - Return structured validation errors for invalid/missing fields
    - _Requirements: 3.1, 3.2, 3.5, 12.2_

  - [x] 4.2 Implement `PUT /api/companies/:id`
    - Update company name and trade name
    - Validate company exists; return 404 if not found
    - Update `updatedAt` timestamp
    - _Requirements: 3.4, 12.3_

  - [x] 4.3 Implement company settings routes (`GET/PUT /api/companies/:id/settings`)
    - Get company settings by company ID
    - Update company settings (taxRegime, currencyCode, fiscalEnvironment, invoiceSeries)
    - Enforce company data isolation — validate company exists and settings belong to it
    - Atomic write: all or nothing
    - _Requirements: 4.1, 4.2, 4.4, 2.4_

  - [x] 4.4 Write property test for company data isolation
    - **Property 1: Company data isolation**
    - **Validates: Requirements 2.4**

  - [x] 4.5 Write property test for company name uniqueness enforcement
    - **Property 6: Company name uniqueness enforcement**
    - **Validates: Requirements 3.2**

- [x] 5. Application settings API routes
  - [x] 5.1 Implement `GET /api/settings` and `PUT /api/settings`
    - Read all app-level settings as key-value pairs
    - Write app-level settings atomically
    - Return defaults if no settings exist
    - _Requirements: 4.1, 4.2, 4.5_

  - [x] 5.2 Implement `PUT /api/settings/active-company`
    - Set the last active company ID in app settings
    - Validate the company ID exists before persisting
    - _Requirements: 2.6_

  - [x] 5.3 Write property test for settings two-tier resolution
    - **Property 4: Settings two-tier resolution**
    - **Validates: Requirements 4.1, 4.5**

  - [x] 5.4 Write property test for settings write atomicity
    - **Property 7: Settings write atomicity**
    - **Validates: Requirements 4.2, 4.4**

- [x] 6. Checkpoint - Ensure all API tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Shared API client and query hooks in the renderer
  - [x] 7.1 Create the shared API client in `src/renderer/src/shared/api/client.ts`
    - Implement `apiClient<T>` function with typed fetch wrapper
    - Base URL: `http://127.0.0.1:3000/api`
    - Support GET, POST, PUT, DELETE methods
    - Parse API envelope responses and throw structured errors on failure
    - _Requirements: 9.1, 11.4_

  - [x] 7.2 Create company query hooks in `src/renderer/src/shared/hooks/use-companies.ts`
    - `useCompanies()` — fetches all companies
    - `useCreateCompany()` — mutation that invalidates companies query on success
    - `useUpdateCompany()` — mutation that invalidates companies query on success
    - Include company ID in query keys for cache isolation
    - _Requirements: 9.1, 9.2, 9.3, 2.3_

  - [x] 7.3 Create settings query hooks in `src/renderer/src/shared/hooks/use-settings.ts`
    - `useAppSettings()` — fetches app-level settings
    - `useCompanySettings(companyId)` — fetches company-scoped settings
    - `useUpdateCompanySettings()` — mutation with cache invalidation
    - `useUpdateAppSettings()` — mutation with cache invalidation
    - _Requirements: 9.1, 9.2, 9.3, 4.3_

  - [x] 7.4 Create the active company hook in `src/renderer/src/shared/hooks/use-active-company.ts`
    - `useActiveCompany()` — returns current active company and a `setActive` function
    - On company switch: call `PUT /api/settings/active-company`, invalidate all company-scoped queries
    - Include loading state for bootstrap resolution
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [x] 7.5 Create the bootstrap hook in `src/renderer/src/shared/hooks/use-bootstrap.ts`
    - `useBootstrap()` — calls `GET /api/bootstrap` on app start
    - Returns bootstrap status, last active company, and error state
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 8. App shell enhancements and company context UI
  - [x] 8.1 Add company selector to the sidebar header in `AppShell`
    - Display active company name prominently
    - Provide a dropdown or dialog to switch between companies
    - Show loading state during company switch
    - When no companies exist, show a prompt to create one
    - _Requirements: 2.1, 2.2, 2.5_

  - [x] 8.2 Implement the company creation flow
    - Create a dialog or dedicated page at `/companies/new`
    - Form fields: company name (required), document number (required), trade name (optional)
    - Display inline validation errors from the API
    - On success, automatically switch context to the new company
    - _Requirements: 3.1, 3.3, 3.5_

  - [x] 8.3 Implement bootstrap error and empty states in the app shell
    - Full-screen error component when bootstrap fails (database init or migration error)
    - Show diagnostics: error code, message, and migration version info
    - Prevent navigation to data screens when bootstrap fails
    - Guide to company creation when no companies exist
    - _Requirements: 1.3, 1.4, 2.5, 11.3_

- [x] 9. Settings page implementation
  - [x] 9.1 Build the settings page at `src/renderer/src/pages/settings/`
    - App-level settings section: theme preference (light/dark/system)
    - Company-level settings section: tax regime, currency code, fiscal environment, invoice series
    - Use form inputs from shared UI primitives
    - Show loading, empty, and error states
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 8.2_

  - [x] 9.2 Add save feedback and error handling to settings forms
    - Display non-blocking toast on successful save (Sonner)
    - Display inline field errors on validation failure
    - Display error notification on system failure with retry suggestion
    - _Requirements: 11.1, 11.2, 11.3, 4.4_

- [x] 10. Navigation and routing enhancements
  - [x] 10.1 Add lazy loading to route definitions in `src/renderer/src/app/router.tsx`
    - Convert page imports to lazy-loaded components
    - Add a not-found route (`*`) rendering a NotFound page with a link to home
    - Ensure browser back/forward navigation works correctly
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 10.4_

  - [x] 10.2 Create the NotFound page at `src/renderer/src/pages/not-found/`
    - Render a friendly message indicating the page was not found
    - Include a link to navigate back to the home screen
    - _Requirements: 5.4_

- [x] 11. Shared UI primitives
  - [x] 11.1 Implement layout primitives: `PageShell` and `Section` in `src/renderer/src/shared/ui/`
    - `PageShell` — consistent page wrapper with title area, padding, and max-width
    - `Section` — content grouping with heading and spacing
    - Support light and dark modes
    - _Requirements: 8.1, 8.3, 8.4_

  - [x] 11.2 Implement state primitives: `EmptyState`, `ErrorState`, `LoadingState`
    - `EmptyState` — placeholder illustration with message and optional action
    - `ErrorState` — error display with retry button
    - `LoadingState` — loading spinner/skeleton appropriate to context
    - Render without crashing on missing/invalid data
    - _Requirements: 8.2, 8.6, 9.4, 9.5_

  - [x] 11.3 Verify existing form, table, and dialog primitives for Phase 0 completeness
    - Ensure `Input`, `Select`, `Textarea` components handle default, focus, error, disabled states
    - Ensure `Button` handles default, hover, active, disabled, loading states
    - Ensure `Dialog` component supports open/closed states
    - Add ARIA attributes and keyboard interaction if missing
    - _Requirements: 8.1, 8.2, 8.5_

- [x] 12. Audit metadata and timestamp handling
  - [x] 12.1 Implement audit timestamp utilities in `src/main/lib/timestamps.ts`
    - `nowISO()` — returns current time as ISO string
    - Helper for setting `createdAt` on insert and `updatedAt` on update
    - Integrate into all Fastify route handlers that create or modify records
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 12.2 Write property test for audit timestamp consistency
    - **Property 5: Audit timestamp consistency**
    - **Validates: Requirements 12.2, 12.3**

- [x] 13. Integration testing and final wiring
  - [x] 13.1 Wire the bootstrap hook into the app entry point
    - Call `useBootstrap()` at app initialization
    - Conditionally render loading, error, or the app shell based on bootstrap status
    - Restore last active company context on successful bootstrap
    - _Requirements: 1.1, 1.2, 2.6, 10.1, 10.2_

  - [x] 13.2 Write integration tests for the bootstrap sequence
    - Test fresh database initialization end-to-end
    - Test startup with existing database and pending migrations
    - Test startup failure handling (corrupt database, failed migration)
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

  - [x] 13.3 Write integration tests for company CRUD through the API
    - Test creating, listing, and updating companies
    - Test duplicate document number rejection
    - Test company settings read/write cycle
    - _Requirements: 3.1, 3.2, 3.4, 4.1_

  - [x] 13.4 Write integration tests for settings persistence and cache invalidation
    - Test app-level settings write and read
    - Test company-level settings write and read
    - Test active company switch persists and restores
    - _Requirements: 4.1, 4.2, 2.6_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses TypeScript throughout (Electron + React + Fastify + Drizzle)
- Testing framework: install `vitest` + `fast-check` for property-based tests
- The existing Drizzle schema already defines most tables — the migration creates them at runtime for new installations
- The Fastify server already exists in `src/main/server.ts` — task 3.1 refactors it into the full bootstrap pattern

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4", "3.2", "12.1"] },
    { "id": 2, "tasks": ["1.5", "1.6", "3.1"] },
    { "id": 3, "tasks": ["3.3", "4.1", "5.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.2"] },
    { "id": 5, "tasks": ["4.4", "4.5", "5.3", "5.4"] },
    { "id": 6, "tasks": ["7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "7.4", "7.5"] },
    { "id": 8, "tasks": ["8.1", "8.2", "8.3", "10.1", "10.2", "11.1", "11.2", "11.3"] },
    { "id": 9, "tasks": ["9.1", "9.2", "12.2"] },
    { "id": 10, "tasks": ["13.1"] },
    { "id": 11, "tasks": ["13.2", "13.3", "13.4"] }
  ]
}
```
